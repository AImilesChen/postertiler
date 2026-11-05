import { getSessionUser } from '../auth.mjs';
import { CloudStore } from './store.mjs';
import { CLOUD_LIMITS, CloudError, cloudReady, ownerKey, publicJob, sha256, uuid, validateSettings } from './contract.mjs';
import { cleanImage } from './image.mjs';
import { sourceKey } from './processor.mjs';
import { assemblyPdf,calibrationPdf } from '../../src/engine/pdf.ts';
const BASE='/api/cloud/test';
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
async function read(request,limit) {
  if(Number(request.headers.get('Content-Length'))>limit)throw new CloudError('file_too_large',413);
  const reader=request.body?.getReader();if(!reader)throw new CloudError('invalid_request');
  const chunks=[];let n=0;
  try{while(true){const r=await reader.read();if(r.done)break;n+=r.value.length;if(n>limit)throw new CloudError('file_too_large',413);chunks.push(r.value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}
  const out=new Uint8Array(n);let p=0;for(const chunk of chunks){out.set(chunk,p);p+=chunk.length;}return out;
}
export function createCloudHandler({authenticate=getSessionUser,now=()=>Date.now()}={}) {
 return async function handleCloud(request,env) {
  const url=new URL(request.url);if(url.pathname!==BASE && !url.pathname.startsWith(BASE+'/'))return null;
  try {
    const origin=new URL(env.AUTH_ORIGIN||'https://postertiler.com').origin;
    if(url.origin!==origin)throw new CloudError('invalid_origin',403);
    const user=await authenticate(request,env);if(!user)throw new CloudError('sign_in_required',401);
    if(!cloudReady(env))throw new CloudError('cloud_unavailable',503);
    if(!['GET','POST','PUT'].includes(request.method))throw new CloudError('method_not_allowed',405);
    if(request.method!=='GET' && request.headers.get('Origin')!==origin)throw new CloudError('invalid_origin',403);
    const owner=await ownerKey(user),store=new CloudStore(env.BILLING_TEST_DB,now),path=url.pathname.slice(BASE.length);
    if(path==='/status' && request.method==='GET') {
      return json({mode:'test',enabled:true,limits:CLOUD_LIMITS,balance:await store.balance(owner),jobs:(await store.list(owner)).map(j=>publicJob(j,now()))});
    }
    if(path==='/jobs' && request.method==='POST') {
      if(request.headers.get('Content-Type')?.split(';')[0]!=='application/json')throw new CloudError('invalid_content_type',415);
      let body;try{body=JSON.parse(new TextDecoder().decode(await read(request,8192)));}catch(e){if(e instanceof CloudError)throw e;throw new CloudError('invalid_request');}
      if(!body||Array.isArray(body)||Object.keys(body).some(k=>!['request_id','source_hash','source_size','source_type','settings','upload_consent'].includes(k)) || !uuid(body.request_id) || body.upload_consent!==true || !/^[a-f0-9]{64}$/.test(body.source_hash||'') || !['image/jpeg','image/png'].includes(body.source_type) || !Number.isInteger(body.source_size) || body.source_size<=0 || body.source_size>(body.source_type==='image/png'?CLOUD_LIMITS.pngBytes:CLOUD_LIMITS.jpegBytes))throw new CloudError('invalid_request');
      const {settings,geometry}=validateSettings(body.settings);
      const fingerprint=await sha256(new TextEncoder().encode(JSON.stringify([body.source_hash,body.source_size,body.source_type,settings])));
      let job=await store.findRequest(owner,body.request_id);
      if(job && job.fingerprint!==fingerprint)throw new CloudError('request_conflict',409);
      if(!job){await store.recover();job=await store.same(owner,fingerprint)||await store.create(owner,body,fingerprint,settings,geometry.count)||await store.same(owner,fingerprint);}
      if(!job){const balance=await store.balance(owner);throw new CloudError(balance.available<1?'insufficient_credits':'task_limit',409);}
      return json({mode:'test',job:publicJob(job,now()),balance:await store.balance(owner)},201);
    }
    const match=path.match(/^\/jobs\/([0-9a-f-]{36})(?:\/(source|cancel|retry|download|assembly|calibration))?$/i);
    if(!match||!uuid(match[1]))throw new CloudError('not_found',404);
    let job=await store.find(match[1]);if(!job||job.user_key!==owner)throw new CloudError('not_found',404);
    const action=match[2];
    if(!action && request.method==='GET')return json({job:publicJob(job,now()),balance:await store.balance(owner)});
    if(['download','assembly','calibration'].includes(action) && request.method==='GET') {
      if(job.expires_at<=now())throw new CloudError('result_expired',410);
      if(job.status!=='succeeded'||!job.result_key)throw new CloudError('result_not_ready',409);
      if(action!=='download') {
        const bytes=await (action==='assembly'?assemblyPdf:calibrationPdf)(JSON.parse(job.settings_json),CLOUD_LIMITS.pages);
        return new Response(bytes,{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="postertiler-${action}.pdf"`}});
      }
      const object=await env.CLOUD_TEST_FILES.get(job.result_key);if(!object)throw new CloudError('result_missing',410);
      return new Response(object.body,{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="postertiler-cloud-poster.pdf"','Content-Length':String(object.size)}});
    }
    if(action==='cancel' && request.method==='POST') {
      job=await store.cancel(job.id);return json({job:publicJob(job,now()),balance:await store.balance(owner)});
    }
    if(action==='retry' && request.method==='POST') {
      if(job.status==='failed')job=await store.retry(job.id,owner);
      if(!['queued','processing','succeeded'].includes(job.status))throw new CloudError('retry_unavailable',409);
      if(job.status==='queued')await env.CLOUD_TEST_QUEUE.send({job_id:job.id}).catch(()=>{});
      return json({job:publicJob(job,now()),balance:await store.balance(owner)});
    }
    if(action==='source' && request.method==='PUT') {
      if(job.status!=='awaiting_upload')return json({job:publicJob(job,now()),balance:await store.balance(owner)});
      if(job.upload_until<=now()){await store.fail(job.id,'upload_timeout');throw new CloudError('upload_timeout',410);}
      if(request.headers.get('Content-Type')!==job.source_type)throw new CloudError('invalid_content_type',415);
      let bytes,verified;
      try {
        bytes=await read(request,job.source_size);
        if(bytes.length!==job.source_size || await sha256(bytes)!==job.source_hash)throw new CloudError('source_mismatch');
        // Validate before storage. Full decoding remains server-side in the queue.
        const image=cleanImage(bytes,job.source_type,false);
        verified=validateSettings({...JSON.parse(job.settings_json),imageRatio:image.width/image.height});
      }catch(e){if(e instanceof CloudError)await store.fail(job.id,e.code,false);throw e;}
      const fresh=await store.find(job.id);
      if(fresh.status!=='awaiting_upload'||fresh.upload_until<=now())throw new CloudError('upload_timeout',410);
      await env.CLOUD_TEST_FILES.put(sourceKey(job.id),bytes,{httpMetadata:{contentType:job.source_type}});
      job=await store.uploaded(job.id,verified.settings,verified.geometry.count);
      if(!['queued','processing','succeeded'].includes(job.status))await env.CLOUD_TEST_FILES.delete(sourceKey(job.id));
      if(job.status==='queued')await env.CLOUD_TEST_QUEUE.send({job_id:job.id}).catch(()=>{}); // durable outbox + cron recovers publish failures
      return json({job:publicJob(job,now()),balance:await store.balance(owner)},202);
    }
    throw new CloudError('method_not_allowed',405);
  }catch(e){return json({error:e instanceof CloudError?e.code:'cloud_temporarily_unavailable'},e instanceof CloudError?e.status:503);}
 };
}
export const handleCloud=createCloudHandler();
