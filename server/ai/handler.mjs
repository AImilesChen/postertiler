import { getSessionUser } from '../auth.mjs';
import { ownerKey,sha256,uuid } from '../cloud/contract.mjs';
import { cleanImage } from '../cloud/image.mjs';
import { AI_LIMITS,AI_VERSION,AI_PACKS,MODERATION_VERSION,AiError,aiReady,aiAllowed,validateSpec,publicAiJob } from './contract.mjs';
import { moderationReady,sightengine } from './moderation.mjs';
import { moderationPng } from './moderation-image.mjs';
import { AiStore } from './store.mjs';
import { boundedBytes,falProvider } from './provider.mjs';
import { aiSourceKey } from './processor.mjs';
const BASE='/api/ai/test';
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
export function createAiHandler({authenticate=getSessionUser,now=()=>Date.now(),makeProvider=falProvider,makeModerator=sightengine}={}){
 let lastProbe=0;
 return async(request,env)=>{
  const url=new URL(request.url);if(!url.pathname.startsWith(BASE+'/')||url.pathname.startsWith(BASE+'/billing/'))return null;
  try{
   const origin=new URL(env.AUTH_ORIGIN||'https://postertiler.com').origin;
   if(url.origin!==origin)throw new AiError('invalid_origin',403);
   if(url.pathname===BASE+'/capabilities'&&request.method==='GET')return json({enabled:aiReady(env)&&aiAllowed(await authenticate(request,env),env),mode:'test',version:AI_VERSION,limits:AI_LIMITS});
   const user=await authenticate(request,env);if(!user)throw new AiError('sign_in_required',401);
   if(env.AI_TEST_ENABLED==='true'&&!aiAllowed(user,env))throw new AiError('pilot_access_required',403);
   if(env.AI_TEST_ENABLED!=='true'||!env.BILLING_TEST_DB?.prepare||!env.CLOUD_TEST_FILES?.get)throw new AiError('ai_unavailable',503);
   if(!['GET','POST','PUT'].includes(request.method))throw new AiError('method_not_allowed',405);
   if(request.method!=='GET'&&request.headers.get('Origin')!==origin)throw new AiError('invalid_origin',403);
   const owner=await ownerKey(user),store=new AiStore(env.BILLING_TEST_DB,now),path=url.pathname.slice(BASE.length);
   // Pilot-only operator diagnostic. Fixed public inputs, no model submission,
   // no image generation, no credit mutations and no arbitrary upload support.
   if(path==='/moderation-check'&&request.method==='GET')return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>PosterTiler safety connection check</title><h1>Safety connection check</h1><p>Tests Sightengine with a fixed public example and fixed text. Uses free moderation operations. Does not call fal, generate an image or spend AI credits.</p><form method="post"><button type="submit">Run safety connection check</button></form><p><a href="/account/ai">Return to AI tools</a></p></html>',{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"}});
   if(path==='/moderation-check'&&request.method==='POST'){
    if(!aiReady(env))throw new AiError('moderation_unavailable',503);
    if(lastProbe&&now()-lastProbe<60000)throw new AiError('moderation_limit',429);lastProbe=now();
    const m=makeModerator(env);await m.prompt('A quiet moonlit garden with maple trees');
    const sample=await env.ASSETS.fetch(new Request(origin+'/assets/images/alpine-lake.png'));
    if(!sample.ok)throw new AiError('moderation_unavailable',503);
    await m.image(await moderationPng(await boundedBytes(sample,AI_LIMITS.resultBytes)),'image/png','output');
    let rejected=false;try{await m.prompt('sexual intercourse');}catch(e){if(e.code!=='moderation_prompt_blocked')throw e;rejected=true;}
    if(!rejected)throw new AiError('moderation_unavailable',503);
    return json({status:'passed',prompt_screening:'passed',image_screening:'passed',blocked_prompt:'blocked',policy:MODERATION_VERSION,fal_calls:0,ai_credits_used:0});
   }
   if(path==='/status'&&request.method==='GET'){await store.recover();return json({enabled:aiReady(env),mode:'test',version:AI_VERSION,balance:await store.balance(owner),jobs:(await store.list(owner)).map(j=>publicAiJob(j,now())),plans:Object.entries(AI_PACKS).map(([id,p])=>({id,name:p.name,amount:p.amount,credits:p.credits}))});}
   if(path==='/jobs'&&request.method==='POST'){
    if(!moderationReady(env))throw new AiError('moderation_unavailable',503);
    if(!aiReady(env))throw new AiError('ai_unavailable',503);
    if(request.headers.get('Content-Type')?.split(';')[0]!=='application/json')throw new AiError('invalid_content_type',415);
    let body;try{body=JSON.parse(new TextDecoder().decode(await boundedBytes(new Response(request.body),8192)));}catch{throw new AiError('invalid_request');}
    if(!body||Array.isArray(body)||Object.keys(body).some(k=>!['request_id','spec','source_hash','source_size','source_type','upload_consent','moderation_consent'].includes(k))||!uuid(body.request_id)||body.upload_consent!==true)throw new AiError('invalid_request');
    if(body.moderation_consent!==MODERATION_VERSION)throw new AiError('moderation_consent_required');
    const spec=validateSpec(body.spec);
    if(spec.kind!=='generate'&&(!/^[a-f0-9]{64}$/.test(body.source_hash||'')||!Number.isInteger(body.source_size)||body.source_size<=0||body.source_size>AI_LIMITS.sourceBytes||body.source_type!=='image/jpeg'))throw new AiError('invalid_source');
    if(spec.kind==='generate'&&(body.source_hash||body.source_size||body.source_type))throw new AiError('invalid_source');
    const fingerprint=await sha256(new TextEncoder().encode(JSON.stringify([spec,body.source_hash||null,body.source_size||null])));
    await store.recover();let job=await store.request(owner,body.request_id);
    if(job&&job.fingerprint!==fingerprint)throw new AiError('request_conflict',409);
    if(job&&['failed','canceled','expired'].includes(job.status))throw new AiError('request_closed',409);
    if(!job)job=await store.create(owner,body,spec,fingerprint);
    if(!job)throw new AiError((await store.balance(owner)).available<spec.credits?'insufficient_ai_credits':'task_limit',409);
    if(job.status==='queued')await env.CLOUD_TEST_QUEUE.send({ai_job_id:job.id}).catch(()=>{});
    return json({job:publicAiJob(job,now()),balance:await store.balance(owner)},201);
   }
   const match=path.match(/^\/jobs\/([0-9a-f-]{36})(?:\/(source|cancel|download))?$/i);
   if(!match||!uuid(match[1]))throw new AiError('not_found',404);
   let job=await store.find(match[1]);if(!job||job.user_key!==owner)throw new AiError('not_found',404);
   if(!match[2]&&request.method==='GET')return json({job:publicAiJob(job,now()),balance:await store.balance(owner)});
   if(match[2]==='download'&&request.method==='GET'){
    if(job.expires_at<=now())throw new AiError('result_expired',410);
    if(job.status!=='succeeded'||!job.result_key)throw new AiError('result_not_ready',409);
    const object=await env.CLOUD_TEST_FILES.get(job.result_key);if(!object)throw new AiError('result_expired',410);
    return new Response(object.body,{headers:{...headers,'Content-Type':'image/png','Content-Disposition':'attachment; filename="postertiler-ai-result.png"','Content-Length':String(object.size)}});
   }
   if(match[2]==='cancel'&&request.method==='POST'){
    job=await store.cancel(job.id);if(job.status==='canceled'&&job.provider_request_id)await makeProvider(env).cancel(job).catch(()=>{});
    return json({job:publicAiJob(job,now()),balance:await store.balance(owner)});
   }
   if(match[2]==='source'&&request.method==='PUT'){
    if(job.status!=='awaiting_upload')return json({job:publicAiJob(job,now()),balance:await store.balance(owner)});
    if(request.headers.get('Content-Type')!=='image/jpeg')throw new AiError('invalid_content_type',415);
    try{
     const bytes=await boundedBytes(new Response(request.body),job.source_size);
     if(bytes.length!==job.source_size||await sha256(bytes)!==job.source_hash)throw new AiError('source_mismatch');
     const image=cleanImage(bytes,'image/jpeg',true,{jpegPixels:AI_LIMITS.pixels,pngPixels:AI_LIMITS.pixels,dimension:AI_LIMITS.dimension});
     const spec=JSON.parse(job.spec_json);
     if(image.orientation!==1||spec.kind==='upscale'&&(image.width!==spec.width||image.height!==spec.height)||spec.kind==='edit'&&(Math.max(image.width,image.height)>1536||image.width*image.height>1_600_000))throw new AiError('invalid_source');
     await env.CLOUD_TEST_FILES.put(aiSourceKey(job.id),image.bytes,{httpMetadata:{contentType:'image/jpeg'}});
     job=await store.uploaded(job.id);
     if(job.status==='queued')await env.CLOUD_TEST_QUEUE.send({ai_job_id:job.id}).catch(()=>{});else await env.CLOUD_TEST_FILES.delete(aiSourceKey(job.id));
     return json({job:publicAiJob(job,now()),balance:await store.balance(owner)},202);
    }catch(e){await store.fail(job.id,e instanceof AiError?e.code:'invalid_source');throw e;}
   }
   throw new AiError('method_not_allowed',405);
  }catch(e){return json({error:e instanceof AiError?e.code:'ai_temporarily_unavailable'},e instanceof AiError?e.status:503);}
 };
}
export const handleAi=createAiHandler();
