import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import miniflare from 'miniflare';
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
