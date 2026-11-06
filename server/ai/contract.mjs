export const AI_VERSION = 'ai-test-2026-11-06';
export const MODERATION_VERSION = 'sightengine-2026-11-06-v1';
export const AI_LIMITS = Object.freeze({ sourceBytes:8*1024*1024,resultBytes:32*1024*1024,pixels:24_000_000,dimension:12000,retentionMs:86400000,taskMs:1200000,uploadMs:600000,leaseMs:120000,prompt:1000 });
export const AI_PACKS = Object.freeze({
  ai40:Object.freeze({name:'AI Starter — 40 credits',price:'inline:ai40',inline:true,amount:499,currency:'usd',credits:40}),
  ai100:Object.freeze({name:'AI Pack — 100 credits',price:'inline:ai100',inline:true,amount:999,currency:'usd',credits:100}),
});
export const AI_SIZES = Object.freeze({square:{width:1024,height:1024},portrait:{width:1024,height:1536},landscape:{width:1536,height:1024},'4k':{width:3840,height:2160}});
export class AiError extends Error { constructor(code,status=400){super(code);this.code=code;this.status=status;} }
export const aiReady = env => env.AI_TEST_ENABLED==='true' && !!env.FAL_KEY && !!env.SIGHTENGINE_API_USER?.trim() && !!env.SIGHTENGINE_API_SECRET?.trim() && !!env.AI_TEST_ALLOWED_EMAILS?.trim() && !!env.BILLING_TEST_DB?.prepare && !!env.CLOUD_TEST_FILES?.get && !!env.CLOUD_TEST_QUEUE?.send;
export const aiAllowed = (user,env) => typeof user?.email==='string' && (env.AI_TEST_ALLOWED_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean).includes(user.email.toLowerCase());
export function validateSpec(value) {
  if(!value||Array.isArray(value)||Object.keys(value).some(k=>!['kind','quality','size','factor','prompt','width','height'].includes(k)))throw new AiError('invalid_spec');
  const {kind}=value;
  if(!['upscale','generate','edit'].includes(kind))throw new AiError('invalid_spec');
  if(kind==='upscale') {
    const {width,height,factor}=value;
    if(![2,4].includes(factor)||![width,height].every(n=>Number.isInteger(n)&&n>0)||width*height*factor*factor>AI_LIMITS.pixels||Math.max(width,height)*factor>AI_LIMITS.dimension)throw new AiError('output_too_large');
    return {kind,width,height,factor,credits:3,budget_cents:11,endpoint:'topaz/upscale/image/precision',output:{width:width*factor,height:height*factor}};
  }
  if(!['medium','high'].includes(value.quality)||!Object.hasOwn(AI_SIZES,value.size)||value.size==='4k'&&value.quality!=='high'||typeof value.prompt!=='string'||!value.prompt.trim()||value.prompt.length>AI_LIMITS.prompt)throw new AiError('invalid_spec');
  return {kind,quality:value.quality,size:value.size,prompt:value.prompt.trim(),credits:value.size==='4k'?16:value.quality==='high'?8:3,budget_cents:value.size==='4k'?50:value.quality==='high'?29:11,
    endpoint:kind==='edit'?'openai/gpt-image-2/edit':'openai/gpt-image-2',output:AI_SIZES[value.size]};
}
export function publicAiJob(job,now=Date.now()) {
  const spec=JSON.parse(job.spec_json);
  return {id:job.id,kind:spec.kind,status:job.status,credits:job.credits,error:job.error_code||null,created_at:job.created_at,expires_at:job.expires_at,
    width:job.width||spec.output.width,height:job.height||spec.output.height,can_download:job.status==='succeeded'&&job.expires_at>now,
    can_cancel:['awaiting_upload','queued','submitting','processing'].includes(job.status)};
}
