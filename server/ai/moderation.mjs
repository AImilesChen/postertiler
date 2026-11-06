import { AiError } from './contract.mjs';
import { boundedBytes } from './provider.mjs';

export { MODERATION_VERSION } from './contract.mjs';
export const moderationReady=env=>!!env.SIGHTENGINE_API_USER?.trim()&&!!env.SIGHTENGINE_API_SECRET?.trim();
export const IMAGE_MODELS='nudity-2.1,gore-2.0,violence,self-harm,offensive-2.0';
const languages='en,zh,fr,es,de,it,pt,ru,tr,ko,da,nl,fi,no,pl,ro,sv,tl';
const ruleCategories=['profanity','violence','self-harm','extremism'];
const score=(o,k)=>{const n=o?.[k];if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>1)throw new AiError('moderation_unavailable',503);return n;};
const any=(o,keys,threshold)=>keys.map(k=>score(o,k)).some(n=>n>=threshold);
export function imageDecision(data){
 // These are PosterTiler policy thresholds, not a legal-compliance guarantee.
 const sexual=any(data.nudity,['sexual_activity','sexual_display','erotica','very_suggestive'],.5);
 const harm=score(data.gore,'prob')>=.5||any(data.violence?.classes,['physical_violence','firearm_threat'],.5)||score(data['self-harm'],'prob')>=.5;
 const hate=any(data.offensive,['nazi','supremacist','terrorist'],.5);
 return sexual||harm||hate;
}
function rulesDecision(data){
 return ruleCategories.map(key=>{const matches=data?.[key]?.matches;if(!Array.isArray(matches))throw new AiError('moderation_unavailable',503);return matches;})
  .some((matches,index)=>matches.some(match=>index!==0||['sexual','discriminatory'].includes(match?.type)));
}
export function sightengine(env,transport=fetch,{now=()=>Date.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 let nextAt=0;
 async function request(path,fields){
  if(!moderationReady(env))throw new AiError('moderation_unavailable',503);
  // Free-plan pacing within this task. Cross-isolate 429s fail closed as well.
  await sleep(Math.max(0,nextAt-now()));nextAt=now()+1100;
  const form=new FormData();for(const [key,value]of Object.entries(fields))form.set(key,value);form.set('api_user',env.SIGHTENGINE_API_USER);form.set('api_secret',env.SIGHTENGINE_API_SECRET);
  try{
   const response=await transport('https://api.sightengine.com/1.0/'+path,{method:'POST',body:form,redirect:'manual',signal:AbortSignal.timeout(20000)});
   if(!response.ok){await response.body?.cancel().catch(()=>{});throw new AiError(response.status===429?'moderation_limit':'moderation_unavailable',503);}
   const data=JSON.parse(new TextDecoder().decode(await boundedBytes(response,128*1024)));
   if(data?.status!=='success')throw new AiError('moderation_unavailable',503);
   return data;
  }catch(error){if(error instanceof AiError&&['moderation_limit','moderation_unavailable'].includes(error.code))throw error;throw new AiError('moderation_unavailable',503);}
 }
 return {
  async prompt(text){
   const normalized=text.normalize('NFKC');
   const rules=await request('text/check.json',{text:normalized,mode:'rules',lang:languages,categories:ruleCategories.join(',')});
   if(rulesDecision(rules))throw new AiError('moderation_prompt_blocked');
   // Semantic classification has no Chinese model. Chinese/mixed prompts still
   // receive rule-based screening, provider safety, and visual output review.
   if(!/[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(normalized)){
    const data=await request('text/check.json',{text:normalized,mode:'ml',lang:'en,fr,es,it,pt,ru,tr',models:'general,self-harm'});
    if(any(data.moderation_classes,['sexual','discriminatory','violent','self-harm'],.5))throw new AiError('moderation_prompt_blocked');
   }
  },
  async image(bytes,mime,stage){
   if(!['source','output'].includes(stage)||!['image/jpeg','image/png'].includes(mime)||!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>12_000_000)throw new AiError('moderation_unavailable',503);
   const data=await request('check.json',{models:IMAGE_MODELS,media:new Blob([bytes],{type:mime})});
   if(imageDecision(data))throw new AiError(stage==='source'?'moderation_source_blocked':'moderation_output_blocked');
  }
 };
}
