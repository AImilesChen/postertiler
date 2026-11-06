import { AiStore } from './store.mjs';
import { AI_LIMITS,AiError,aiReady } from './contract.mjs';
import { cleanImage } from '../cloud/image.mjs';
import { falProvider } from './provider.mjs';
export const aiSourceKey=id=>'ai-test/'+id+'/source.jpg';
export const aiResultKey=id=>'ai-test/'+id+'/result.png';
const limits={pngPixels:AI_LIMITS.pixels,jpegPixels:AI_LIMITS.pixels,dimension:AI_LIMITS.dimension};
function dataUri(bytes){let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return 'data:image/jpeg;base64,'+btoa(s);}
// Stream decompression without allocating a full 96 MB RGBA bitmap in Workers.
export async function verifyPng(bytes){
 const image=cleanImage(bytes,'image/png',true,limits),v=new DataView(image.bytes.buffer,image.bytes.byteOffset,image.bytes.byteLength),parts=[];
 const colour=image.bytes[25],channels={0:1,2:3,3:1,4:2,6:4}[colour],row=image.width*channels+1;
 for(let p=8;p+12<=image.bytes.length;){const n=v.getUint32(p),type=new TextDecoder().decode(image.bytes.subarray(p+4,p+8));if(type==='IDAT')parts.push(image.bytes.subarray(p+8,p+8+n));p+=12+n;}
 const stream=new Blob(parts).stream().pipeThrough(new DecompressionStream('deflate')).getReader();let size=0;
 try{while(true){const {done,value}=await stream.read();if(done)break;for(let i=0;i<value.length;i++)if((size+i)%row===0&&value[i]>4)throw new AiError('invalid_result');size+=value.length;if(size>row*image.height)throw new AiError('invalid_result');}}catch(e){await stream.cancel().catch(()=>{});throw e;}
 if(size!==row*image.height)throw new AiError('invalid_result');return image;
}
export async function processAiJob(id,env,{now=()=>Date.now(),provider=falProvider(env),verify=verifyPng}={}){
 if(!aiReady(env))return;
 const store=new AiStore(env.BILLING_TEST_DB,now);let job=await store.claim(id);if(!job)return;
 try{
  if(job.created_at+AI_LIMITS.taskMs<=now()){await store.fail(id,'task_timeout');return;}
  const spec=JSON.parse(job.spec_json);
  if(job.status==='queued'){
   let source;
   if(spec.kind!=='generate'){
    const object=await env.CLOUD_TEST_FILES.get(aiSourceKey(id));if(!object)throw new AiError('source_missing');
    const bytes=new Uint8Array(await object.arrayBuffer());if(bytes.length>AI_LIMITS.sourceBytes)throw new AiError('file_too_large');source=dataUri(bytes);
   }
   const limit=Number(env.AI_DAILY_BUDGET_CENTS||500);
   if(!Number.isInteger(limit)||limit<1||!await store.submitting(job,limit)){await store.fail(id,'daily_budget_reached');return;}
   let submitted;
   try{submitted=await provider.submit(spec,source);}catch(e){await store.fail(id,e?.code==='provider_rejected'?'provider_rejected':'submission_uncertain');return;}
   const fresh=await store.submitted(job,submitted);
   if(fresh.status==='canceled'){await provider.cancel({...fresh,...{cancel_url:submitted.cancel_url}}).catch(()=>{});}
   return; // Only polling is retried; a paid submit is never blindly repeated.
  }
  const status=await provider.status(job);
  if(status.status!=='COMPLETED'){if(!['IN_QUEUE','IN_PROGRESS'].includes(status.status))throw new AiError('provider_failed');await store.release(job);return;}
  if(status.error||status.error_type)throw new AiError('provider_failed');
  const bytes=await provider.result(job);let image;
  try{image=await verify(bytes);}catch{throw new AiError('invalid_result');}
  if(image.width!==spec.output.width||image.height!==spec.output.height)throw new AiError('output_size_mismatch');
  const fresh=await store.find(id);if(fresh.status!=='processing'||fresh.lease!==job.lease)return;
  const key=aiResultKey(id);await env.CLOUD_TEST_FILES.put(key,image.bytes,{httpMetadata:{contentType:'image/png'}});
  try{const done=await store.finish(job,key,image);if(done.status!=='succeeded'){await env.CLOUD_TEST_FILES.delete(key);await store.fail(id,'credit_revoked');}}
  catch(e){const done=await store.find(id);if(done.status!=='succeeded'){await env.CLOUD_TEST_FILES.delete(key);throw e;}}
 }catch(e){
  if(e instanceof AiError||e?.code){await store.fail(id,e instanceof AiError?e.code:'invalid_result');}
  else await store.release(job); // transient poll/download failure: keep provider ID, never resubmit
 }
}
export async function maintainAi(env,{now=()=>Date.now(),provider}={}){
 if(!env.BILLING_TEST_DB?.prepare||!env.CLOUD_TEST_FILES?.delete)return;
 if(!await env.BILLING_TEST_DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_test_jobs'").first())return;
 const store=new AiStore(env.BILLING_TEST_DB,now);await store.recover();
 if(aiReady(env))for(const job of await store.pending())await processAiJob(job.id,env,{now,...(provider?{provider}:{})});
 for(const job of await store.expired()){await env.CLOUD_TEST_FILES.delete([aiSourceKey(job.id),aiResultKey(job.id)]);await store.expire(job.id);}
}
