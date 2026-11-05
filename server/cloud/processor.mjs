import { posterPdf } from '../../src/engine/pdf.ts';
import { CloudStore } from './store.mjs';
import { CLOUD_LIMITS, CloudError, sha256 } from './contract.mjs';
import { cleanImage } from './image.mjs';

export const sourceKey=id=>`jobs/${id}/source`;
export async function processJob(id,env,{render=posterPdf,now=()=>Date.now()}={}) {
  const store=new CloudStore(env.BILLING_TEST_DB,now),job=await store.claim(id);if(!job)return;
  const token=job.lease_token,key=`jobs/${id}/result-${token}.pdf`,started=now();let stored=false;
  try {
    const source=await env.CLOUD_TEST_FILES.get(sourceKey(id));
    if(!source)throw new CloudError('source_missing');
    const bytes=new Uint8Array(await source.arrayBuffer());
    if(bytes.length!==job.source_size || await sha256(bytes)!==job.source_hash)throw new CloudError('source_mismatch');
    const image=cleanImage(bytes,job.source_type),settings={...JSON.parse(job.settings_json),imageRatio:image.width/image.height};
    const output=await render(image.bytes,settings,()=>{if(now()-started>45000)throw new CloudError('processing_timeout');},image.format,{pageLimit:CLOUD_LIMITS.pages,orientation:image.orientation})
      .catch(error=>{if(error instanceof CloudError)throw error;throw new CloudError('invalid_image');});
    if(output.length<100 || output.length>CLOUD_LIMITS.resultBytes || new TextDecoder().decode(output.slice(0,5))!=='%PDF-')throw new CloudError('invalid_output');
    // A lost/canceled/refunded lease must never consume a credit or publish a result.
    const fresh=await store.find(id);if(fresh.status!=='processing'||fresh.lease_token!==token)return;
    await env.CLOUD_TEST_FILES.put(key,output,{httpMetadata:{contentType:'application/pdf'}});stored=true;
    if(!await store.finish(id,token,key,output.length)) {
      await env.CLOUD_TEST_FILES.delete(key);stored=false;await store.fail(id,'credit_revoked',false,token);
    }
  } catch(error) {
    if(stored) {
      // The commit may have succeeded even if its response was lost. Never delete
      // a result referenced by a succeeded row when reconciling that uncertainty.
      const fresh=await store.find(id);
      if(fresh.status==='succeeded' && fresh.result_key===key)return;
      await env.CLOUD_TEST_FILES.delete(key);
    }
    const permanent=error instanceof CloudError && error.code!=='processing_timeout';
    if(!permanent && job.attempts<3 && now()<job.deadline) {
      await store.requeue(id,token);throw new Error('cloud_retry');
    }
    await store.fail(id,error instanceof CloudError?error.code:'processing_failed',!permanent,token);
  }
}
export async function consumeCloud(batch,env) {
  for(const message of batch.messages) {
    if(typeof message.body?.job_id!=='string' || !/^[0-9a-f-]{36}$/i.test(message.body.job_id)){message.ack();continue;}
    try{await processJob(message.body.job_id,env);message.ack();}catch{message.retry({delaySeconds:60});}
  }
}
export async function maintainCloud(env,{now=()=>Date.now()}={}) {
  if(!env.BILLING_TEST_DB || !env.CLOUD_TEST_FILES || !env.CLOUD_TEST_QUEUE)return;
  const store=new CloudStore(env.BILLING_TEST_DB,now);await store.recover();
  for(const row of await store.expired()) {
    // Only this sandbox's job prefix is touched. Include abandoned attempt objects.
    const list=await env.CLOUD_TEST_FILES.list({prefix:`jobs/${row.id}/`,limit:100});
    if(list.objects.length)await env.CLOUD_TEST_FILES.delete(list.objects.map(o=>o.key));
    if(!list.truncated)await store.cleaned(row.id);
  }
  for(const row of await store.queued())await env.CLOUD_TEST_QUEUE.send({job_id:row.id});
}
