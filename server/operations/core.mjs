import {galleryAdmin,ownerKey,sha256 as digest} from '../gallery/contract.mjs';
export {ownerKey};
export const sha256=value=>digest(typeof value==='string'?new TextEncoder().encode(value):value);
export const isOperator=(env,user)=>typeof user?.id==='string'&&typeof user?.email==='string'&&galleryAdmin(env,user);
export class OpsError extends Error{constructor(code,status=400){super(code);this.code=code;this.status=status;}}
export const ready=env=>!!env.GALLERY_DB?.prepare;
export const q=(env,sql,...args)=>env.GALLERY_DB.prepare(sql).bind(...args);
export const rows=async(env,sql,...args)=>(await q(env,sql,...args).all()).results||[];
export const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export function text(v,max,min=0){if(typeof v!=='string'||v.length>max||v.trim().length<min||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))throw new OpsError('invalid_input');return v.trim();}
export function pagePath(v){if(typeof v!=='string'||!/^\/(?:[a-z0-9/-]*)$/.test(v)||v.length>150||/^\/(?:api|admin|account)(?:\/|$)/.test(v))return '';return v;}
export const safeEmail=v=>typeof v==='string'&&v.length<=254&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v)?v.toLowerCase():null;
export async function audit(env,user,action,target,details={}){await q(env,'INSERT INTO ops_audit VALUES(?,?,?,?,?,?)',crypto.randomUUID(),await ownerKey(user),action,target,JSON.stringify(details),Date.now()).run();}
export async function recordProfile(env,user,login=false){
 if(!ready(env)||!user?.id)return;
 const now=Date.now();await q(env,`INSERT INTO ops_users(user_key,email,name,is_operator,first_recorded,last_login,last_seen) VALUES(?,?,?,?,?,?,?)
 ON CONFLICT(user_key) DO UPDATE SET email=excluded.email,name=excluded.name,is_operator=excluded.is_operator,last_login=COALESCE(excluded.last_login,ops_users.last_login),last_seen=excluded.last_seen`,await ownerKey(user),user.email,user.name||'',galleryAdmin(env,user)?1:0,now,login?now:null,now).run();
}
export async function rateLimit(env,request,scope,limit,seconds=600){
 const now=Date.now(),ip=request.headers.get('CF-Connecting-IP')||'unknown';
 const bucket=await sha256(`${env.AUTH_COOKIE_KEY}|${scope}|${Math.floor(now/(seconds*1000))}|${ip}`);
 const row=await q(env,'INSERT INTO ops_limits VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET hits=hits+1 WHERE hits<? RETURNING hits',bucket,now+seconds*2000,limit).first();
 if(!row)throw new OpsError('rate_limited',429);
}
export function dateRange(params){const to=params.get('to')||new Date().toISOString().slice(0,10),from=params.get('from')||new Date(Date.now()-6*86400000).toISOString().slice(0,10);
 const valid=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
 if(!valid(from)||!valid(to)||from>to||to>new Date().toISOString().slice(0,10)||Date.parse(to)-Date.parse(from)>89*86400000)throw new OpsError('invalid_dates');
 return {from,to,start:Date.parse(from),end:Date.parse(to)+86400000,timezone:'UTC'};
}
export function pagination(params){const p=params.get('page')||'1';if(!/^[1-9]\d{0,3}$/.test(p))throw new OpsError('invalid_page');return {page:Number(p),limit:25,offset:(Number(p)-1)*25};}
export async function listing(env,sql,args,params){const p=pagination(params),n=await q(env,`SELECT COUNT(*) n FROM (${sql})`,...args).first();return {items:await rows(env,sql+' LIMIT ? OFFSET ?',...args,p.limit,p.offset),total:n.n,page:p.page,pages:Math.max(1,Math.ceil(n.n/p.limit))};}
