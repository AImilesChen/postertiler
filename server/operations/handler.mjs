import {getSessionUser} from '../auth.mjs';
import {boundedBytes} from '../ai/provider.mjs';
import {isOperator,ready,OpsError,q,rows,ownerKey,rateLimit,dateRange,listing,text,audit} from './core.mjs';
import {submitFeedback,updateFeedback,ownFeedback,mailReady,deliverNotifications} from './feedback.mjs';
import {recordMetric,metricsReport,clearMetricCookie} from './metrics.mjs';
import {orderList,paymentSummary,requestRefund,refundList,updateRefund,taskReport} from './data.mjs';
const privateHeaders={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const json=(v,status=200,headers={})=>Response.json(v,{status,headers:{...privateHeaders,...headers}});
async function body(request){if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new OpsError('invalid_content_type',415);try{return JSON.parse(new TextDecoder().decode(await boundedBytes(new Response(request.body),16000)));}catch{throw new OpsError('invalid_input');}}
const adminPages=new Set(['/admin','/admin/gallery','/admin/feedback','/admin/users','/admin/orders','/admin/refunds','/admin/analytics','/admin/tasks','/admin/settings','/admin/logs']);
export function createOperationsHandler({authenticate=getSessionUser,transport=fetch,now=()=>Date.now()}={}){
 return async(request,env,ctx)=>{
 const url=new URL(request.url),path=url.pathname.replace(/\.html$/,'').replace(/\/$/,'')||'/';
 if(!path.startsWith('/api/ops/')&&!path.startsWith('/api/admin/')&&!/^\/admin(?:\/|$)/.test(path))return null;
 try{
  const origin=new URL(env.AUTH_ORIGIN||'https://postertiler.com').origin;
  if(url.origin!==origin)throw new OpsError('invalid_origin',403);
  if(!['GET','HEAD'].includes(request.method)&&request.headers.get('Origin')!==origin)throw new OpsError('invalid_origin',403);
  const user=await authenticate(request,env),admin=isOperator(env,user);
  if(/^\/admin(?:\/|$)/.test(path)){
   if(!['GET','HEAD'].includes(request.method))throw new OpsError('method_not_allowed',405);
   if(!adminPages.has(path))throw new OpsError('not_found',404);
   if(!user)return new Response(null,{status:303,headers:{...privateHeaders,Location:'/account?return_to='+encodeURIComponent(path)}});
   if(!admin)return new Response('This account does not have management access.',{status:403,headers:privateHeaders});
   const asset=await env.ASSETS.fetch(request);return new Response(request.method==='HEAD'?null:asset.body,{status:asset.status,headers:{...Object.fromEntries(asset.headers),...privateHeaders}});
  }
  if(path==='/api/ops/capabilities'&&request.method==='GET')return json({enabled:ready(env),admin,turnstile_sitekey:env.TURNSTILE_SITE_KEY||null,mail_ready:mailReady(env)});
  if(path==='/api/ops/metrics/clear'&&request.method==='POST')return json({cleared:true},200,{'Set-Cookie':clearMetricCookie});
  if(!ready(env))throw new OpsError('operations_unavailable',503);
  if(path==='/api/ops/metrics'&&request.method==='POST'){
   const result=await recordMetric(request,env,user,await body(request),now());const {cookie,...data}=result;return json(data,200,cookie?{'Set-Cookie':cookie}:{});
  }
  if(path==='/api/ops/feedback'&&request.method==='POST'){
   const data=await submitFeedback(request,env,user,transport);ctx?.waitUntil?.(deliverNotifications(env,transport));return json(data,201);
  }
  if(path.startsWith('/api/ops/')){
   if(!user)throw new OpsError('sign_in_required',401);const owner=await ownerKey(user);
   if(path==='/api/ops/feedback'&&request.method==='GET')return json({items:await ownFeedback(env,owner)});
   if(path==='/api/ops/orders'&&request.method==='GET')return json(await orderList(env,url.searchParams,owner));
   if(path==='/api/ops/refunds'&&request.method==='GET')return json(await refundList(env,url.searchParams,owner));
   if(path==='/api/ops/refunds'&&request.method==='POST'){await rateLimit(env,request,'refund',6);const data=await requestRefund(env,user,await body(request));ctx?.waitUntil?.(deliverNotifications(env,transport));return json(data,201);}
   const image=path.match(/^\/api\/ops\/feedback\/([a-f0-9]{64})\/attachment$/);
   if(image&&request.method==='GET')return await attachment(env,image[1],admin?null:owner);
   throw new OpsError('not_found',404);
  }
  if(!admin)throw new OpsError('admin_required',user?403:401);
  const r=dateRange(url.searchParams),db=env.GALLERY_DB;
  if(path==='/api/admin/summary'&&request.method==='GET'){
   const [traffic,payments,users,todo,started]=await Promise.all([metricsReport(env,r),paymentSummary(env,r),q(env,'SELECT COUNT(*) total,SUM(CASE WHEN first_recorded>=? AND first_recorded<? THEN 1 ELSE 0 END) new_records FROM ops_users WHERE is_operator=0',r.start,r.end).first(),q(env,`SELECT (SELECT COUNT(*) FROM ops_feedback WHERE status IN ('new','in_progress','awaiting_user') AND archived=0) feedback,(SELECT COUNT(*) FROM ops_refund_requests WHERE status IN ('received','reviewing','approved')) refunds,(SELECT COUNT(*) FROM gallery_entries WHERE status='pending') gallery,(SELECT COUNT(*) FROM ops_outbox WHERE status='attention') notification_errors`).first(),q(env,"SELECT value FROM ops_meta WHERE key='started_at'").first()]);
   return json({traffic,payments,users,todo,started_at:Number(started?.value),timezone:'UTC',updated_at:now()});
  }
  if(path==='/api/admin/analytics'&&request.method==='GET')return json(await metricsReport(env,r));
  if(path==='/api/admin/orders'&&request.method==='GET')return json(await orderList(env,url.searchParams));
  if(path==='/api/admin/refunds'&&request.method==='GET')return json(await refundList(env,url.searchParams));
  if(path==='/api/admin/tasks'&&request.method==='GET')return json(await taskReport(env,r,url.searchParams));
  if(path==='/api/admin/users'&&request.method==='GET'){
   const search=(url.searchParams.get('q')||'').slice(0,100),where=search?' WHERE email LIKE ? OR user_key=?':'',args=search?['%'+search.replaceAll('%','').replaceAll('_','')+'%',search]:[];
   return json(await listing(env,'SELECT * FROM ops_users'+where+' ORDER BY first_recorded DESC',args,url.searchParams));
  }
  if(path==='/api/admin/feedback'&&request.method==='GET'){
   const args=[],w=[];const status=url.searchParams.get('status');if(status&&status!=='all'){if(!['new','in_progress','awaiting_user','resolved','closed'].includes(status))throw new OpsError('invalid_status');w.push('status=?');args.push(status);}
   w.push('archived=?');args.push(url.searchParams.get('archived')==='yes'?1:0);
   const search=(url.searchParams.get('q')||'').slice(0,100);if(search){w.push('(message LIKE ? OR id=?)');args.push('%'+search.replaceAll('%','').replaceAll('_','')+'%',search);}
   const data=await listing(env,`SELECT id,user_key,category,area,message,reply_email,page_path,browser,device,status,priority,internal_note,response,revision,archived,attachment_key IS NOT NULL has_attachment,created_at,updated_at FROM ops_feedback WHERE ${w.join(' AND ')} ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,created_at DESC`,args,url.searchParams);
   return json(data);
  }
  const editFeedback=path.match(/^\/api\/admin\/feedback\/([a-f0-9]{64})$/);
  if(editFeedback&&request.method==='POST')return json(await updateFeedback(env,user,editFeedback[1],await body(request)));
  const editRefund=path.match(/^\/api\/admin\/refunds\/([a-f0-9-]{36})$/);
  if(editRefund&&request.method==='POST')return json(await updateRefund(env,user,editRefund[1],await body(request)));
  if(path==='/api/admin/logs'&&request.method==='GET')return json(await listing(env,"SELECT * FROM (SELECT * FROM ops_audit UNION ALL SELECT id,actor,'gallery.'||action action,entry_id target,json_object('note',note) details,created_at FROM gallery_audit) ORDER BY created_at DESC",[],url.searchParams));
  if(path==='/api/admin/settings'&&request.method==='GET'){
   const [notifications,meta]=await Promise.all([rows(env,'SELECT id,kind,target,recipient,status,attempts,error_code,created_at,sent_at FROM ops_outbox ORDER BY created_at DESC LIMIT 40'),q(env,"SELECT value FROM ops_meta WHERE key='started_at'").first()]);
   return json({started_at:Number(meta?.value),timezone:'UTC',connections:{operations:true,gallery:env.GALLERY_ENABLED==='true',stripe_test:!!env.STRIPE_TEST_SECRET_KEY&&!!env.STRIPE_TEST_WEBHOOK_SECRET,stripe_live:false,mail:mailReady(env),turnstile:!!env.TURNSTILE_SITE_KEY&&!!env.TURNSTILE_SECRET_KEY,ga4:'Existing browser tags retained. GA4 reporting API intentionally not integrated.',fal:!!env.FAL_KEY,sightengine:!!env.SIGHTENGINE_API_USER&&!!env.SIGHTENGINE_API_SECRET},notifications,mail_configuration:mailReady(env)?null:'Feedback is saved. To enable notifications: verified OPS_EMAIL_FROM, OPS_NOTIFY_EMAIL and RESEND_API_KEY in Worker secrets; existing SMTP service requires a compatible sending adapter.',retention:{metrics_days:90,heartbeat_days:7,feedback_days_after_close:365,audit_days:365}});
  }
  const retry=path.match(/^\/api\/admin\/notifications\/([a-z0-9:-]+)\/retry$/);
  if(retry&&request.method==='POST'){
   if(!mailReady(env))throw new OpsError('mail_not_configured',409);
   await q(env,"UPDATE ops_outbox SET status='pending',attempts=0,next_at=0,lease_until=0 WHERE id=? AND status='attention'",retry[1]).run();await audit(env,user,'notification.retry',retry[1]);ctx?.waitUntil?.(deliverNotifications(env,transport));return json({saved:true});
  }
  throw new OpsError('not_found',404);
 }catch(e){if(e instanceof OpsError)return json({error:e.code},e.status);return json({error:'operations_temporarily_unavailable'},503);}
 };
}
async function attachment(env,id,owner){const row=await q(env,'SELECT attachment_key,user_key FROM ops_feedback WHERE id=?',id).first();if(!row?.attachment_key||owner&&row.user_key!==owner)throw new OpsError('not_found',404);const file=await env.GALLERY_FILES.get(row.attachment_key);if(!file)throw new OpsError('not_found',404);return new Response(file.body,{headers:{...privateHeaders,'Content-Type':'image/jpeg','Content-Security-Policy':"default-src 'none'; sandbox"}});}
export const handleOperations=createOperationsHandler();
export async function maintainOperations(env){
 if(!ready(env))return;try{
  await deliverNotifications(env);
  const n=Date.now(),cutoff=new Date(n-90*86400000).toISOString().slice(0,10);
  await env.GALLERY_DB.batch([q(env,'DELETE FROM ops_limits WHERE expires_at<?',n),q(env,"DELETE FROM ops_metric_events WHERE (event='pulse' AND created_at<?) OR created_at<?",n-7*86400000,n-90*86400000),q(env,'DELETE FROM ops_visits WHERE day<?',cutoff),q(env,'DELETE FROM ops_audit WHERE created_at<?',n-365*86400000)]);
  const closed=await rows(env,"SELECT id,attachment_key FROM ops_feedback WHERE status IN ('closed','resolved') AND updated_at<? LIMIT 20",n-365*86400000);
  for(const row of closed){if(row.attachment_key)await env.GALLERY_FILES.delete(row.attachment_key);await env.GALLERY_DB.batch([q(env,'DELETE FROM ops_outbox WHERE target=?',row.id),q(env,'DELETE FROM ops_feedback WHERE id=?',row.id)]);}
 }catch{/* Maintenance retries at next scheduled tick; no private text in logs. */}
}
