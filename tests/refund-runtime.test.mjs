import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import miniflare from 'miniflare';
import {ownerKey} from '../server/operations/core.mjs';
const {Miniflare,convertV4MiniflareOptions}=miniflare;
test('workerd D1 triggers allocate FIFO and atomically freeze, reconcile and audit an approved refund',async t=>{
 const entry=`import {createOperationsHandler} from './server/operations/handler.mjs';const h=createOperationsHandler({authenticate:async r=>({id:r.headers.get('x-fixture-user')||'member',email:(r.headers.get('x-fixture-user')||'member')+'@example.invalid'})});export default {fetch:(r,e,c)=>h(r,e,c)};`;
 const bundle=await build({stdin:{contents:entry,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser'});
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-11-04',cf:false,d1Databases:['GALLERY_DB','BILLING_TEST_DB'],bindings:{AUTH_ORIGIN:'https://postertiler.com',AUTH_COOKIE_KEY:'runtime-fixture',GALLERY_ADMIN_EMAILS:'admin@example.invalid'},outboundService:()=>{throw new Error('No external calls');}}));t.after(()=>mf.dispose());
 const gallery=await mf.getD1Database('GALLERY_DB'),billing=await mf.getD1Database('BILLING_TEST_DB');
 for(const file of ['0001_gallery.sql','0002_operations.sql'])for(const sql of (await readFile('server/gallery/migrations/'+file,'utf8')).replace(/^--.*$/gm,'').split(';').filter(x=>x.trim()))await gallery.prepare(sql).run();
 for(const file of ['0001_billing_test.sql','0002_cloud_jobs.sql','0003_ai_test.sql'])for(const sql of (await readFile('server/billing/migrations/'+file,'utf8')).replace(/^--.*$/gm,'').split(';').filter(x=>x.trim()))await billing.prepare(sql).run();
 for(const sql of (await readFile('server/billing/migrations/0004_refund_ledger.sql','utf8')).split('-- statement-break').map(s=>s.replace(/^--.*$/gm,'').trim()).filter(Boolean))await billing.prepare(sql).run();
 const id=crypto.randomUUID(),owner=await ownerKey({id:'member'}),at=Date.now();await billing.prepare("INSERT INTO billing_test_orders(id,user_key,request_id,sku,price_id,price_version,amount,currency,credits,paid,status,created_at,updated_at,paid_at) VALUES(?,?,?,'pack5','price_fixture','fixture',599,'usd',5,1,'paid',?,?,?)").bind(id,owner,crypto.randomUUID(),at,at,at).run();
 for(let i=0;i<2;i++){const job=crypto.randomUUID();await billing.prepare("INSERT INTO cloud_test_jobs(id,user_key,request_id,fingerprint,source_hash,source_size,source_type,settings_json,status,credit_state,page_count,created_at,updated_at,expires_at,upload_until,deadline) VALUES(?,?,?,?, 'fixture',1,'image/jpeg','{}','awaiting_upload','held',1,?,?,?,?,?)").bind(job,owner,crypto.randomUUID(),job,at,at,at+86400000,at+600000,at+1200000).run();await billing.prepare("UPDATE cloud_test_jobs SET status='succeeded',credit_state='consumed' WHERE id=?").bind(job).run();}
 const request=(path,body,user='member')=>mf.dispatchFetch('https://postertiler.com'+path,{method:body?'POST':'GET',headers:{Origin:'https://postertiler.com','Content-Type':'application/json','x-fixture-user':user},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await request('/api/ops/refunds',{mode:'test',kind:'cloud',order_id:id,reason:'Local workerd unused pack fixture.'})).status,201);
 const r=(await(await request('/api/admin/refunds',null,'admin')).json()).items[0];assert.equal(r.quote.suggested_amount,359);
 const approved=await request('/api/admin/refunds/'+r.id,{status:'approved',revision:0,internal_note:'private',response:'Reviewed.',approved_amount:359,quote_token:r.quote.quote_token},'admin');assert.equal(approved.status,200,await approved.text());assert.equal((await billing.prepare('SELECT hold_units FROM billing_refund_reviews').first()).hold_units,3);
 await billing.prepare('UPDATE billing_test_orders SET refunded_amount=359,refunded_credits=3 WHERE id=?').bind(id).run();assert.equal((await billing.prepare('SELECT hold_units FROM billing_refund_reviews').first()).hold_units,0);assert.equal((await billing.prepare('SELECT COUNT(*) n FROM billing_refund_audit').first()).n,1);
});
