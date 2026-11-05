// Isolated local runtime fixture: no remote bindings, real credentials or money.
import { mkdir,writeFile } from 'node:fs/promises';
import { base64url } from 'jose';
import { sealCookie } from '../server/auth.mjs';
import { ownerKey } from '../server/cloud/contract.mjs';
const directory='verification/cloud',origin='http://127.0.0.1:4181';await mkdir(directory,{recursive:true});
const key=crypto.getRandomValues(new Uint8Array(32)),user={id:'cloud-local-fixture',name:'Cloud Tester',email:'fixture@example.invalid'};
const config={name:'postertiler-cloud-local',main:'../../server/worker.mjs',compatibility_date:'2026-11-04',dev:{ip:'127.0.0.1',port:4181},
 assets:{binding:'ASSETS',directory:'../../dist',run_worker_first:['/api/*','/account','/account/*'],html_handling:'drop-trailing-slash',not_found_handling:'404-page'},
 vars:{AUTH_ORIGIN:origin,GOOGLE_CLIENT_ID:'local.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'local-fixture-only',AUTH_COOKIE_KEY:base64url.encode(key),CLOUD_TEST_ENABLED:'true',BILLING_TEST_ENABLED:'false'},
 d1_databases:[{binding:'BILLING_TEST_DB',database_name:'postertiler-cloud-local',database_id:'00000000-0000-4000-8000-000000000001'}],
 r2_buckets:[{binding:'CLOUD_TEST_FILES',bucket_name:'postertiler-cloud-local'}],
 queues:{producers:[{binding:'CLOUD_TEST_QUEUE',queue:'postertiler-cloud-local'}],consumers:[{queue:'postertiler-cloud-local',max_batch_size:1,max_batch_timeout:1,max_retries:3,max_concurrency:1,retry_delay:1}]}};
await writeFile(directory+'/wrangler.local.json',JSON.stringify(config,null,2));
await writeFile(directory+'/local-session.json',JSON.stringify({origin,user,token:await sealCookie({origin,key},'session',{user},3600)}));
const owner=await ownerKey(user);
await writeFile(directory+'/seed.sql',`INSERT OR IGNORE INTO billing_test_orders(id,user_key,request_id,sku,price_id,price_version,amount,currency,credits,paid,status,created_at,updated_at) VALUES('local-fixture-5','${owner}','local-fixture-5','pack5','price_fixture','local-fixture',599,'usd',5,1,'paid',${Date.now()},${Date.now()});`);
console.log('Prepared isolated local D1/R2/Queue fixture and test session. No remote operations.');
