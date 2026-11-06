import { AiError,AI_LIMITS } from './contract.mjs';
export const queueUrl = value => {
 try { const u=new URL(value);return u.protocol==='https:'&&u.hostname==='queue.fal.run'&&!u.username&&!u.password&&!u.port?u.href:null; } catch{return null;}
};
export const mediaUrl = value => {
 try {const u=new URL(value);return u.protocol==='https:'&&(u.hostname==='fal.media'||u.hostname.endsWith('.fal.media'))&&!u.username&&!u.password&&!u.port?u.href:null;}catch{return null;}
};
export async function boundedBytes(response,limit){
 if(!response.ok)throw new AiError('provider_unavailable',503);
 if(Number(response.headers.get('Content-Length'))>limit)throw new AiError('file_too_large',413);
 const reader=response.body?.getReader();if(!reader)throw new AiError('invalid_response',502);
 const chunks=[];let size=0;
 try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>limit)throw new AiError('file_too_large',413);chunks.push(r.value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}
 const bytes=new Uint8Array(size);let p=0;for(const c of chunks){bytes.set(c,p);p+=c.length;}return bytes;
}
async function json(response){return JSON.parse(new TextDecoder().decode(await boundedBytes(response,128*1024)));}
export function falProvider(env,transport=fetch){
 const auth={Authorization:`Key ${env.FAL_KEY}`};
 const request=(url,init={})=>transport(url,{...init,redirect:'error',signal:AbortSignal.timeout(20000)});
 return {
  async submit(spec,source){
   let input;
   if(spec.kind==='upscale')input={image_url:source,model:'Standard V2',upscale_factor:spec.factor,crop_to_fill:false,face_enhancement:false,output_format:'png',enable_safety_checker:true};
   else input={prompt:spec.prompt,image_size:spec.output,quality:spec.quality,num_images:1,output_format:'png',background:'opaque',enable_safety_checker:true,...(spec.kind==='edit'?{image_urls:[source]}:{})};
   const response=await request('https://queue.fal.run/'+spec.endpoint,{method:'POST',headers:{...auth,'Content-Type':'application/json','X-Fal-Store-IO':'0','X-Fal-Object-Lifecycle-Preference':JSON.stringify({expiration_duration_seconds:3600})},body:JSON.stringify(input)});
   if([400,401,402,403,422,429].includes(response.status))throw new AiError('provider_rejected',502);
   const data=await json(response);
   if(typeof data.request_id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(data.request_id))throw new AiError('submission_uncertain',502);
   for(const key of ['response_url','status_url','cancel_url']){
    const url=queueUrl(data[key]);if(!url||!new URL(url).pathname.includes('/requests/'+data.request_id))throw new AiError('submission_uncertain',502);
    data[key]=url;
   }
   return data;
  },
  async status(job){const u=queueUrl(job.status_url);if(!u)throw new AiError('invalid_response',502);return json(await request(u,{headers:auth}));},
  async result(job){const u=queueUrl(job.result_url);if(!u)throw new AiError('invalid_response',502);const result=await json(await request(u,{headers:auth}));
   const image=JSON.parse(job.spec_json).kind==='upscale'?result.image:result.images?.length===1?result.images[0]:null;
   const url=mediaUrl(image?.url);if(!url)throw new AiError('invalid_result',502);
   const response=await request(url);if(response.headers.get('Content-Type')?.split(';')[0]!=='image/png')throw new AiError('invalid_result',502);
   return boundedBytes(response,AI_LIMITS.resultBytes);
  },
  async cancel(job){const u=queueUrl(job.cancel_url);if(u)await request(u,{method:'PUT',headers:auth});},
 };
}
