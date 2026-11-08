import {FEEDBACK_TYPES,FEEDBACK_AREAS,FEEDBACK_STATES} from '../../src/operations-contract.js';
import {boundedBytes} from '../ai/provider.mjs';
import {cleanImage} from '../cloud/image.mjs';
import {OpsError,q,rows,uuid,text,pagePath,safeEmail,ownerKey,sha256,rateLimit,audit} from './core.mjs';
export const mailReady=env=>!!env.RESEND_API_KEY&&!!safeEmail(env.OPS_EMAIL_FROM)&&!!safeEmail(env.OPS_NOTIFY_EMAIL);
export async function feedbackInput(request){
 const bytes=await boundedBytes(new Response(request.body),3*1024*1024),type=request.headers.get('Content-Type')||'';
 if(type.startsWith('multipart/form-data')){try{const form=await new Response(bytes,{headers:{'Content-Type':type}}).formData();return {data:JSON.parse(String(form.get('feedback'))),file:form.get('attachment')};}catch{throw new OpsError('invalid_feedback');}}
 if(!type.startsWith('application/json'))throw new OpsError('invalid_content_type',415);
 try{return {data:JSON.parse(new TextDecoder().decode(bytes)),file:null};}catch{throw new OpsError('invalid_feedback');}
}
async function verifyTurnstile(request,env,token,transport=fetch){
 if(!env.TURNSTILE_SECRET_KEY)return;
 if(typeof token!=='string'||token.length>2048||!token)throw new OpsError('challenge_required',403);
 const body=new URLSearchParams({secret:env.TURNSTILE_SECRET_KEY,response:token});
 const response=await transport('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body,signal:AbortSignal.timeout(10000)});
 const result=await response.json();if(!response.ok||result.success!==true||result.hostname!==new URL(request.url).hostname||result.action!=='feedback')throw new OpsError('challenge_failed',403);
}
export async function submitFeedback(request,env,user,transport=fetch){
 const {data:b,file}=await feedbackInput(request);
 if(!b||!uuid(b.request_id)||b.consent!==true||!Object.hasOwn(FEEDBACK_TYPES,b.category)||!Object.hasOwn(FEEDBACK_AREAS,b.area)||b.website)throw new OpsError('invalid_feedback');
 const message=text(b.message,3000,10),email=b.wants_reply?safeEmail(b.email):null;
 if(b.wants_reply&&!email)throw new OpsError('invalid_reply_email');
 const owner=user?await ownerKey(user):null,id=await sha256('feedback:'+env.AUTH_COOKIE_KEY+':'+b.request_id);
 let attachment=null;
 if(file&&typeof file.arrayBuffer==='function'&&file.size){
  if(!env.GALLERY_FILES?.put)throw new OpsError('attachment_unavailable',503);
  if(file.size>2*1024*1024||file.type!=='image/jpeg')throw new OpsError('invalid_attachment');
  try{attachment=cleanImage(new Uint8Array(await file.arrayBuffer()),'image/jpeg',false);}catch{throw new OpsError('invalid_attachment');}
  if(attachment.width*attachment.height>4_000_000||Math.max(attachment.width,attachment.height)>2500)throw new OpsError('invalid_attachment');
 }
 const attachmentBytes=attachment?.bytes||attachment?.data;
 const fingerprint=await sha256(JSON.stringify([owner,b.category,b.area,message,email,pagePath(b.page_path),attachmentBytes?await sha256(attachmentBytes):null]));
 const existing=await q(env,'SELECT fingerprint FROM ops_feedback WHERE id=?',id).first();
 if(existing){if(existing.fingerprint!==fingerprint)throw new OpsError('request_changed',409);return {id,saved:true};}
 await rateLimit(env,request,'feedback',5);
 await verifyTurnstile(request,env,b.turnstile,transport);
 const now=Date.now(),key=attachment?'feedback/'+id+'/'+fingerprint:null;
 if(key)await env.GALLERY_FILES.put(key,attachmentBytes,{httpMetadata:{contentType:'image/jpeg'}});
 try{
  await env.GALLERY_DB.batch([
   q(env,`INSERT INTO ops_feedback(id,user_key,request_id,fingerprint,category,area,message,reply_email,page_path,browser,device,attachment_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,id,owner,b.request_id,fingerprint,b.category,b.area,message,email,pagePath(b.page_path),['Chrome','Edge','Firefox','Safari','Other'].includes(b.browser)?b.browser:'Other',['desktop','mobile','tablet'].includes(b.device)?b.device:'desktop',key,now,now),
   q(env,'INSERT OR IGNORE INTO ops_outbox(id,kind,target,created_at) VALUES(?,?,?,?)','new:'+id,'feedback',id,now)
  ]);
 }catch(e){const found=await q(env,'SELECT fingerprint FROM ops_feedback WHERE id=?',id).first();if(found?.fingerprint===fingerprint)return {id,saved:true};if(key)await env.GALLERY_FILES.delete(key);throw e;}
 return {id,saved:true};
}
export async function updateFeedback(env,user,id,b){
 const status=text(b.status,30),priority=text(b.priority,12),note=text(b.internal_note,3000),response=text(b.response,3000);
 if(!FEEDBACK_STATES.includes(status)||!['low','normal','high'].includes(priority)||!Number.isInteger(b.revision)||typeof b.archived!=='boolean')throw new OpsError('invalid_feedback');
 const existing=await q(env,'SELECT * FROM ops_feedback WHERE id=?',id).first();if(!existing)throw new OpsError('not_found',404);
 const now=Date.now(),version=b.revision+1,replyChanged=response!==existing.response,token=crypto.randomUUID();
 const statements=[q(env,`UPDATE ops_feedback SET status=?,priority=?,internal_note=?,response=?,archived=?,updated_at=?,revision=revision+1,last_mutation=? WHERE id=? AND revision=?`,status,priority,note,response,b.archived?1:0,now,token,id,b.revision)];
 if(replyChanged&&response&&existing.reply_email)statements.push(q(env,"INSERT OR IGNORE INTO ops_outbox(id,kind,target,recipient,body,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM ops_feedback WHERE id=? AND last_mutation=?)",'reply:'+id+':'+version,'reply',id,existing.reply_email,response,now,id,token));
 statements.push(q(env,'INSERT INTO ops_audit SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM ops_feedback WHERE id=? AND last_mutation=?)',crypto.randomUUID(),await ownerKey(user),'feedback.update',id,JSON.stringify({status,priority,archived:b.archived,response_changed:replyChanged}),now,id,token));
 const result=await env.GALLERY_DB.batch(statements);if(!result[0].meta.changes)throw new OpsError('revision_conflict',409);
 return {saved:true};
}
export async function ownFeedback(env,owner){return rows(env,'SELECT id,category,area,message,status,response,created_at,updated_at,attachment_key IS NOT NULL has_attachment FROM ops_feedback WHERE user_key=? ORDER BY created_at DESC LIMIT 100',owner);}
export async function deliverNotifications(env,transport=fetch){
 if(!mailReady(env))return;
 const now=Date.now(),items=await rows(env,"SELECT * FROM ops_outbox WHERE status='pending' AND attempts<5 AND next_at<=? AND lease_until<=? ORDER BY created_at LIMIT 5",now,now);
 for(const item of items){
  const lease=crypto.randomUUID(),claim=await q(env,"UPDATE ops_outbox SET lease=?,lease_until=?,attempts=attempts+1 WHERE id=? AND status='pending' AND lease_until<=?",lease,now+120000,item.id,now).run();if(!claim.meta.changes)continue;
  try{
   const recipient=item.kind==='reply'?item.recipient:env.OPS_NOTIFY_EMAIL;
   const body=item.kind==='reply'?item.body:`A new ${item.kind==='refund'?'refund request':'feedback message'} is waiting in PosterTiler. Open https://postertiler.com/admin/${item.kind==='refund'?'refunds':'feedback'} . Reference: ${item.target}.`;
   const r=await transport('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':item.id},body:JSON.stringify({from:env.OPS_EMAIL_FROM,to:[recipient],subject:item.kind==='reply'?'Your PosterTiler feedback update':'PosterTiler · new '+item.kind,text:body})});
   if(!r.ok)throw new Error();await q(env,"UPDATE ops_outbox SET status='sent',sent_at=?,lease_until=0,lease=NULL,error_code=NULL WHERE id=? AND lease=?",Date.now(),item.id,lease).run();
  }catch{await q(env,"UPDATE ops_outbox SET status=CASE WHEN attempts>=5 THEN 'attention' ELSE 'pending' END,next_at=?,lease_until=0,lease=NULL,error_code='delivery_failed' WHERE id=? AND lease=?",Date.now()+300000,item.id,lease).run();}
 }
}
