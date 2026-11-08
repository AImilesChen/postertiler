import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {createOperationsHandler} from '../server/operations/handler.mjs';
export const operator={id:'ops-admin-fixture',email:'admin@example.invalid',name:'Local operator'},member={id:'ops-member-fixture',email:'member@example.invalid',name:'Local member'};
export function d1(sqlite){return {prepare(sql){let args=[];const s={bind(...v){args=v;return s;},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){return {meta:sqlite.prepare(sql).run(...args)};}};return s;},async batch(statements){sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};}
export async function operationFixture(t){const db=new DatabaseSync(':memory:'),billing=new DatabaseSync(':memory:');
 for(const p of ['server/gallery/migrations/0001_gallery.sql','server/gallery/migrations/0002_operations.sql'])db.exec(await readFile(p,'utf8'));
 for(const p of ['server/billing/migrations/0001_billing_test.sql','server/billing/migrations/0002_cloud_jobs.sql','server/billing/migrations/0003_ai_test.sql','server/billing/migrations/0004_refund_ledger.sql'])billing.exec(await readFile(p,'utf8'));
 t?.after(()=>{db.close();billing.close();});let user=member,clock=Date.now();const files=new Map(),calls=[];
 const env={AUTH_ORIGIN:'https://postertiler.com',AUTH_COOKIE_KEY:'local-operations-fixture-not-a-production-key',GALLERY_ADMIN_EMAILS:operator.email,GALLERY_DB:d1(db),BILLING_TEST_DB:d1(billing),GALLERY_FILES:{async put(k,v){files.set(k,new Uint8Array(v));},async get(k){return files.has(k)?{body:files.get(k)}:null;},async delete(k){files.delete(k);}},ASSETS:{fetch:async()=>new Response('local admin fixture')}};
 const handler=createOperationsHandler({authenticate:async()=>user,now:()=>clock,transport:async(url)=>{calls.push(url);throw new Error('External calls disabled in fixture');}});
 const f={db,billing,env,files,calls,handler,setUser:v=>{user=v;},tick:ms=>{clock+=ms;},getUser:()=>user,request:async(path,method='GET',body,headers={})=>{
  const form=body instanceof FormData;
  const r=new Request(env.AUTH_ORIGIN+path,{method,headers:{Origin:env.AUTH_ORIGIN,'User-Agent':'Operations fixture browser','CF-Connecting-IP':'192.0.2.8',...(body&&!form?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:form?body:JSON.stringify(body)}:{})});
  Object.defineProperty(r,'cf',{value:{country:'DE'}});return handler(r,env);
 }};return f;
}
