import {handleOperations,maintainOperations} from './operations/handler.mjs';
import {handleGallery,maintainGallery} from './gallery/handler.mjs';
import {galleryPages} from './gallery/pages.mjs';
import { handleAuth } from './auth.mjs';
import { handleBilling,handleAiBilling } from './billing/handler.mjs';
import { handleCloud } from './cloud/handler.mjs';
import { consumeCloud, maintainCloud } from './cloud/processor.mjs';
import { handleAi } from './ai/handler.mjs';
import { processAiJob,maintainAi } from './ai/processor.mjs';
import { AiStore } from './ai/store.mjs';
import { aiReady } from './ai/contract.mjs';

export default {
  async fetch(request, env, ctx) {
    try {
      const operations=await handleOperations(request,env,ctx);if(operations)return operations;
      const galleryResponse=await handleGallery(request,env)||await galleryPages(request,env);if(galleryResponse)return galleryResponse;
      const response = await handleAi(request,env) || await handleAiBilling(request,env) || await handleCloud(request, env) || await handleBilling(request, env) || await handleAuth(request, env);
      if (response) return response;
      const asset = await env.ASSETS.fetch(request);
      const path = new URL(request.url).pathname;
      if (!/^\/account(?:\/|\.|$)/.test(path) && !/^\/cloud(?:\/|\.|$)/.test(path)) return asset;
      const headers = new Headers(asset.headers);
      headers.set('Cache-Control', 'private, no-store');
      headers.set('X-Robots-Tag', 'noindex, nofollow');
      headers.set('Referrer-Policy', 'no-referrer');
      return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
    } catch {
      return new Response(JSON.stringify({ error: 'temporarily_unavailable' }), {
        status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
      });
    }
  },
  async queue(batch,env) {
    for(const message of batch.messages){
      if(message.body?.ai_job_id){
        await processAiJob(message.body.ai_job_id,env);
        if(aiReady(env)){const job=await new AiStore(env.BILLING_TEST_DB).find(message.body.ai_job_id);if(job&&['queued','processing'].includes(job.status))await env.CLOUD_TEST_QUEUE.send(message.body,{delaySeconds:10}).catch(()=>{});}
        message.ack();
      }
      else await consumeCloud({...batch,messages:[message]},env);
    }
  },
  async scheduled(controller,env,ctx) { ctx.waitUntil(Promise.all([maintainCloud(env),maintainAi(env),maintainGallery(env),maintainOperations(env)])); },
};
