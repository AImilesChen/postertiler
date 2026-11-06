import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import miniflare from 'miniflare';
import {createCanvas} from '@napi-rs/canvas';
const {Miniflare,convertV4MiniflareOptions}=miniflare;

async function runtime(t,entry,handler){
 const bundled=await build({stdin:{contents:entry,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser'});
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-11-04',cf:false,outboundService:handler}));
 t.after(()=>mf.dispose());return mf;
}
test('workerd rejects redirect error before any network I/O',async t=>{
 let outbound=0;const mf=await runtime(t,`export default {fetch(){try{new Request('https://queue.fal.run/topaz/upscale/image/precision',{redirect:'error'});return Response.json({unexpected:true});}catch(error){return Response.json({name:error.name,reason:error.message});}}};`,()=>{outbound++;return Response.json({});});
 const result=await(await mf.dispatchFetch('https://local.invalid/')).json();
 assert.equal(result.name,'TypeError');assert.match(result.reason,/Invalid redirect value/);assert.equal(outbound,0);
});
test('actual provider code submits once in workerd and can read its receipt',async t=>{
 const requests=[];const mf=await runtime(t,`import {falProvider} from './server/ai/provider.mjs';import {validateSpec} from './server/ai/contract.mjs';export default {async fetch(){try{const p=falProvider({FAL_KEY:'fixture-only'});const receipt=await p.submit(validateSpec({kind:'upscale',width:8,height:8,factor:2}),'data:image/jpeg;base64,fixture');return Response.json({id:receipt.request_id});}catch(error){return Response.json({error:error.code||error.name});}}};`,async request=>{
  requests.push({host:new URL(request.url).hostname,method:request.method,input:JSON.parse(await request.text())});
  return Response.json({request_id:'runtime-receipt'});
 });
 const result=await(await mf.dispatchFetch('https://local.invalid/')).json();assert.deepEqual(result,{id:'runtime-receipt'});assert.equal(requests.length,1);assert.equal(requests[0].host,'queue.fal.run');assert.equal(requests[0].input.output_format,'png');
});
test('workerd provider blocks redirects without forwarding credentials or retrying',async t=>{
 const hosts=[];const mf=await runtime(t,`import {falProvider} from './server/ai/provider.mjs';import {validateSpec} from './server/ai/contract.mjs';export default {async fetch(){try{await falProvider({FAL_KEY:'fixture-only'}).submit(validateSpec({kind:'upscale',width:8,height:8,factor:2}),'fixture');return Response.json({unexpected:true});}catch(error){return Response.json({error:error.code});}}};`,request=>{hosts.push(new URL(request.url).hostname);return new Response(null,{status:307,headers:{Location:'https://untrusted.invalid/collect'}});});
 const result=await(await mf.dispatchFetch('https://local.invalid/')).json();assert.deepEqual(result,{error:'provider_redirect_blocked'});assert.deepEqual(hosts,['queue.fal.run']);
});
test('Sightengine multipart transport and streaming review PNG run in actual workerd',async t=>{
 const canvas=createCanvas(8,8),ctx=canvas.getContext('2d');ctx.fillStyle='#2468aa';ctx.fillRect(0,0,8,8);const base64=canvas.toBuffer('image/png').toString('base64'),requests=[];
 const mf=await runtime(t,`import {sightengine} from './server/ai/moderation.mjs';import {moderationPng} from './server/ai/moderation-image.mjs';export default {async fetch(){try{const bytes=Uint8Array.from(atob('${base64}'),c=>c.charCodeAt(0)),copy=await moderationPng(bytes);await sightengine({SIGHTENGINE_API_USER:'fixture-user',SIGHTENGINE_API_SECRET:'fixture-secret'}).image(copy,'image/png','output');return Response.json({passed:true,size:copy.length});}catch(error){return Response.json({error:error.code||error.name});}}};`,async request=>{
  const form=await request.formData();requests.push({host:new URL(request.url).hostname,query:new URL(request.url).search,mediaType:form.get('media').type,user:form.get('api_user')});
  return Response.json({status:'success',nudity:{sexual_activity:.01,sexual_display:.01,erotica:.01,very_suggestive:.01},gore:{prob:.01},violence:{prob:.01,classes:{physical_violence:.01,firearm_threat:.01,combat_sport:.99}},'self-harm':{prob:.01},offensive:{nazi:.01,supremacist:.01,terrorist:.01}});
 });
 const result=await(await mf.dispatchFetch('https://local.invalid/')).json();assert.equal(result.passed,true);assert.ok(result.size>0);assert.deepEqual(requests,[{host:'api.sightengine.com',query:'',mediaType:'image/png',user:'fixture-user'}]);
});
test('Sightengine workerd transport rejects redirects without leaking credentials or retrying',async t=>{
 const hosts=[];const mf=await runtime(t,`import {sightengine} from './server/ai/moderation.mjs';export default {async fetch(){try{await sightengine({SIGHTENGINE_API_USER:'fixture',SIGHTENGINE_API_SECRET:'fixture'}).prompt('A quiet garden');return Response.json({unexpected:true});}catch(error){return Response.json({error:error.code});}}};`,request=>{hosts.push(new URL(request.url).hostname);return new Response(null,{status:307,headers:{Location:'https://evil.invalid'}});});
 assert.deepEqual(await(await mf.dispatchFetch('https://local.invalid/')).json(),{error:'moderation_unavailable'});assert.deepEqual(hosts,['api.sightengine.com']);
});
