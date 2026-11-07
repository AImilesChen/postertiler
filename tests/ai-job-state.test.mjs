import test from 'node:test';
import assert from 'node:assert/strict';
import {aiJobFeedback,selectedAiFeedback} from '../src/ai-job-state.js';
import {falProvider} from '../server/ai/provider.mjs';
import {validateSpec} from '../server/ai/contract.mjs';

test('terminal failure replaces processing feedback and states the released credits',()=>{
 const state=aiJobFeedback({kind:'upscale',status:'failed',error:'submission_uncertain',credits:3});
 assert.equal(state.tone,'error');assert.equal(state.title,'Enhancement failed');
 assert.match(state.description,/could not be confirmed/);assert.match(state.description,/No result is available/);
 assert.equal(state.creditText,'3 AI credits released. No credits used for this task.');
 for(const status of ['awaiting_upload','queued','submitting','processing']){const feedback=aiJobFeedback({kind:'upscale',status,credits:3});assert.equal(feedback.tone,'working');assert.match(feedback.creditText,/reserved/);}
 const ready=aiJobFeedback({kind:'upscale',status:'succeeded',credits:3});assert.equal(ready.tone,'success');assert.match(ready.creditText,/used/);
});
test('safety blocks have a clear reason, no result action and released credits',()=>{
 for(const error of ['moderation_prompt_blocked','moderation_source_blocked','moderation_output_blocked','moderation_unavailable','moderation_limit']){
  const feedback=aiJobFeedback({kind:'generate',status:'failed',error,credits:3});assert.equal(feedback.tone,'error');assert.match(feedback.description,/safety|Safety|checks/);assert.match(feedback.creditText,/3 AI credits released/);
 }
});
test('accepted provider receipt is retained using canonical tracking URLs without a second submit',async()=>{
 let calls=0;const provider=falProvider({FAL_KEY:'fixture'},async()=>{calls++;return Response.json({request_id:'receipt_1',response_url:'https://untrusted.invalid/private',status_url:'https://queue.fal.run/topaz/upscale/image/precision/requests/receipt_1/status'});});
 const receipt=await provider.submit(validateSpec({kind:'upscale',width:8,height:8,factor:2}),'data:image/jpeg;base64,fixture');
 assert.equal(calls,1);assert.equal(receipt.response_url,'https://queue.fal.run/topaz/upscale/requests/receipt_1');assert.equal(receipt.status_url,receipt.response_url+'/status');assert.equal(receipt.cancel_url,receipt.response_url+'/cancel');
});
test('provider submission problems retain safe diagnostic categories without exposing response bodies',async()=>{
 for(const [transport,code] of [[async()=>{throw new DOMException('private URL and token','TimeoutError');},'provider_submit_timeout'],[async()=>{throw new Error('private details');},'provider_submit_connection'],[async()=>new Response('private provider details',{status:503}),'provider_submit_unavailable'],[async()=>new Response('not-json'),'provider_submit_receipt']]){
  const provider=falProvider({FAL_KEY:'fixture'},transport);await assert.rejects(()=>provider.submit(validateSpec({kind:'upscale',width:8,height:8,factor:2}),'fixture'),error=>error.code===code&&!error.message.includes('private'));
 }
});

test('a fresh workspace never shows an unrelated completed task as its current result',()=>{
 const previous={id:'old',kind:'upscale',status:'succeeded',credits:3};
 assert.equal(selectedAiFeedback([previous],{restoreLatest:false}),null);
 assert.equal(selectedAiFeedback([previous],{restoreLatest:true}),previous);
 const live={id:'new',kind:'upscale',status:'processing',credits:3};
 assert.equal(selectedAiFeedback([previous,live],{restoreLatest:false}),live);
 const failed={...live,status:'failed',error:'provider_failed'};
 assert.equal(selectedAiFeedback([previous,failed],{localJob:live,restoreLatest:false}),failed);
 assert.equal(selectedAiFeedback([previous],{localJob:previous,restoreLatest:false}),previous);
 assert.equal(selectedAiFeedback(undefined,{restoreLatest:false}),null);
});
