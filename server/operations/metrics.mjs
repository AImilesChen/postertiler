import {OPS_CONSENT,METRIC_EVENTS} from '../../src/operations-contract.js';
import {OpsError,q,rows,uuid,pagePath,sha256,rateLimit,isOperator} from './core.mjs';
import {routeSpecs} from '../../src/data.js';
const publicPaths=new Set(routeSpecs.map(r=>r.path));
const cookieName='__Host-postertiler-metrics';
const day=now=>new Date(now).toISOString().slice(0,10);
async function signature(env,value){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.AUTH_COOKIE_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('ops-visitor:'+value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function visitor(request,env,now){
 const raw=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
 const [id,expires,sig]=raw.split('.');let value=raw;
 if(!uuid(id)||!/^\d{13}$/.test(expires||'')||Number(expires)<=now||Number(expires)>now+31*86400000||sig!==await signature(env,id+'.'+expires)){value=crypto.randomUUID()+'.'+(now+30*86400000);value+='.'+await signature(env,value);}
 return {key:await sha256(value.split('.')[0]),cookie:`${cookieName}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`};
}
const sources=new Set(['direct','google','bing','social','referral','other']);
export async function recordMetric(request,env,user,b,now=Date.now()){
 if(isOperator(env,user)||/bot|crawler|spider|headless|preview|lighthouse/i.test(request.headers.get('User-Agent')||''))return {recorded:false};
 if(b?.consent!==OPS_CONSENT||!uuid(b.id)||!uuid(b.session)||!METRIC_EVENTS.includes(b.event)||!pagePath(b.path)||!publicPaths.has(b.path)||!Number.isInteger(b.seconds??0)||(b.seconds??0)<0||(b.seconds??0)>30)throw new OpsError('invalid_metric');
 if(!env.AUTH_COOKIE_KEY)throw new OpsError('metrics_unavailable',503);
 await rateLimit(env,request,'metrics',200,300);
 const v=await visitor(request,env,now),d=day(now),country=/^[A-Z]{2}$/.test(request.cf?.country||'')?request.cf.country:'XX',source=sources.has(b.source)?b.source:'other';
 const old=await q(env,'SELECT id FROM ops_metric_events WHERE id=?',b.id).first();if(old)return {recorded:true,cookie:v.cookie};
 const seconds=b.event==='pulse'?b.seconds:0;
 const tool=['image_poster','image_pdf','pdf_poster','life_size','halftone','dither'].includes(b.tool)?b.tool:'';
 await env.GALLERY_DB.batch([
  q(env,'INSERT OR IGNORE INTO ops_metric_events(id,day,visitor_key,session_key,path,event,tool,created_at) VALUES(?,?,?,?,?,?,?,?)',b.id,d,v.key,b.session,b.path,b.event,tool,now),
  q(env,`INSERT OR IGNORE INTO ops_visits VALUES(?,?,?,?,?,?,0,0,?)`,d,v.key,b.session,b.path,country,source,now),
  q(env,`UPDATE ops_visits SET page_views=page_views+?,active_seconds=MIN(43200,active_seconds+MIN(?,MAX(0,CAST((?-last_seen)/1000 AS INTEGER)))),last_seen=?
    WHERE day=? AND visitor_key=? AND session_key=? AND path=? AND EXISTS(SELECT 1 FROM ops_metric_events WHERE id=? AND visitor_key=? AND applied=0)`,b.event==='page_view'?1:0,seconds,now,now,d,v.key,b.session,b.path,b.id,v.key),
  q(env,'UPDATE ops_metric_events SET applied=1 WHERE id=? AND visitor_key=? AND applied=0',b.id,v.key)
 ]);
 return {recorded:true,cookie:v.cookie};
}
export async function metricsReport(env,r){
 const args=[r.from,r.to],where='day BETWEEN ? AND ?';
 const [summary,daily,countries,sourcesList,pages,events]=await Promise.all([
 q(env,`SELECT COUNT(DISTINCT visitor_key) visitors,COUNT(DISTINCT visitor_key||':'||session_key) sessions,COALESCE(SUM(page_views),0) page_views,COALESCE(SUM(active_seconds),0) active_seconds FROM ops_visits WHERE ${where}`,...args).first(),
 rows(env,`SELECT day,COUNT(DISTINCT visitor_key) visitors,COUNT(DISTINCT visitor_key||':'||session_key) sessions,SUM(page_views) page_views,SUM(active_seconds) active_seconds FROM ops_visits WHERE ${where} GROUP BY day ORDER BY day`,...args),
 rows(env,`SELECT country,COUNT(DISTINCT visitor_key) visitors,SUM(active_seconds) active_seconds FROM ops_visits WHERE ${where} GROUP BY country ORDER BY visitors DESC LIMIT 40`,...args),
 rows(env,`SELECT source,COUNT(DISTINCT visitor_key) visitors FROM ops_visits WHERE ${where} GROUP BY source ORDER BY visitors DESC`,...args),
 rows(env,`SELECT path,SUM(page_views) page_views,SUM(active_seconds) active_seconds FROM ops_visits WHERE ${where} GROUP BY path ORDER BY page_views DESC LIMIT 30`,...args),
 rows(env,`SELECT event,tool,COUNT(*) count FROM ops_metric_events WHERE ${where} AND event!='pulse' GROUP BY event,tool ORDER BY count DESC`,...args)
 ]);
 return {range:r,...summary,average_active_seconds:summary.sessions?Math.round(summary.active_seconds/summary.sessions):0,daily,countries,sources:sourcesList,pages,events,coverage:'Consented public-page browsers only. Excludes this operator and recognizable bots; browser blocking, shared devices and deleted cookies affect estimates. Country is network location, not nationality. Foreground time stops on hidden pages or after 60 seconds without activity. Country/source counts can overlap across the selected period.'};
}
export const clearMetricCookie=`${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
