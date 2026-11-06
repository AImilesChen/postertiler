import { AI_LIMITS,AI_VERSION,MODERATION_VERSION } from './contract.mjs';
const ACTIVE="'awaiting_upload','queued','submitting','processing'";
const GRANTED="(SELECT COALESCE(SUM(credits-refunded_credits),0) FROM ai_test_orders WHERE user_key=? AND paid=1)";
const USED=`(SELECT COALESCE(SUM(credits),0) FROM ai_test_jobs WHERE user_key=? AND (charged=1 OR status IN (${ACTIVE})))`;
export class AiStore {
 constructor(db,now=()=>Date.now()){this.db=db;this.now=now;}
 find(id){return this.db.prepare('SELECT * FROM ai_test_jobs WHERE id=?').bind(id).first();}
 request(owner,id){return this.db.prepare('SELECT * FROM ai_test_jobs WHERE user_key=? AND request_id=?').bind(owner,id).first();}
 async balance(owner){
  const grant=await this.db.prepare('SELECT COALESCE(SUM(credits-refunded_credits),0) AS n FROM ai_test_orders WHERE user_key=? AND paid=1').bind(owner).first();
  const use=await this.db.prepare(`SELECT COALESCE(SUM(CASE WHEN charged=1 THEN credits ELSE 0 END),0) AS used,COALESCE(SUM(CASE WHEN status IN (${ACTIVE}) THEN credits ELSE 0 END),0) AS reserved FROM ai_test_jobs WHERE user_key=?`).bind(owner).first();
  const n=Number(grant.n)-Number(use.used)-Number(use.reserved);
  return {granted:Number(grant.n),used:Number(use.used),reserved:Number(use.reserved),available:Math.max(0,n),debt:Math.max(0,-n)};
 }
 async list(owner){return (await this.db.prepare('SELECT * FROM ai_test_jobs WHERE user_key=? ORDER BY created_at DESC,id DESC LIMIT 20').bind(owner).all()).results;}
 async create(owner,body,spec,fingerprint){
  const n=this.now(),id=crypto.randomUUID();
  await this.db.prepare(`INSERT INTO ai_test_jobs(id,user_key,request_id,fingerprint,spec_json,credits,budget_cents,source_hash,source_size,source_type,status,created_at,updated_at,expires_at)
   SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${GRANTED}-${USED}>=?
   AND NOT EXISTS(SELECT 1 FROM ai_test_jobs WHERE user_key=? AND status IN (${ACTIVE}))
   AND (SELECT COUNT(*) FROM ai_test_jobs WHERE user_key=? AND created_at>?)<12
   ON CONFLICT(user_key,request_id) DO NOTHING`).bind(id,owner,body.request_id,fingerprint,JSON.stringify({...spec,price_version:AI_VERSION,moderation_consent:body.moderation_consent===MODERATION_VERSION?MODERATION_VERSION:null}),spec.credits,spec.budget_cents,body.source_hash||null,body.source_size||null,body.source_type||null,spec.kind==='generate'?'queued':'awaiting_upload',n,n,n+AI_LIMITS.retentionMs,owner,owner,spec.credits,owner,owner,n-3600000).run();
  return this.request(owner,body.request_id);
 }
 async uploaded(id){await this.db.prepare("UPDATE ai_test_jobs SET status='queued',updated_at=? WHERE id=? AND status='awaiting_upload'").bind(this.now(),id).run();return this.find(id);}
 async claim(id){const token=crypto.randomUUID();await this.db.prepare("UPDATE ai_test_jobs SET lease=?,lease_until=?,updated_at=? WHERE id=? AND status IN ('queued','processing') AND lease_until<=?").bind(token,this.now()+AI_LIMITS.leaseMs,this.now(),id,this.now()).run();const job=await this.find(id);return job?.lease===token?job:null;}
 async submitting(job,dailyLimit){
  await this.db.prepare(`UPDATE ai_test_jobs SET status='submitting',budget_committed=1,updated_at=? WHERE id=? AND lease=? AND status='queued'
   AND json_extract(spec_json,'$.moderation_input')=? AND lease_until>?
   AND COALESCE((SELECT SUM(budget_cents) FROM ai_test_jobs WHERE budget_committed=1 AND created_at>=?),0)+budget_cents<=?`).bind(this.now(),job.id,job.lease,MODERATION_VERSION+':'+job.fingerprint,this.now(),this.now()-86400000,dailyLimit).run();
  return (await this.find(job.id))?.status==='submitting';
 }
 async submitted(job,provider){
  await this.db.prepare("UPDATE ai_test_jobs SET status='processing',provider_request_id=?,result_url=?,status_url=?,cancel_url=?,lease=NULL,lease_until=0,updated_at=? WHERE id=? AND lease=? AND status='submitting'").bind(provider.request_id,provider.response_url,provider.status_url,provider.cancel_url,this.now(),job.id,job.lease).run();return this.find(job.id);
 }
 async release(job){await this.db.prepare('UPDATE ai_test_jobs SET lease=NULL,lease_until=0,updated_at=? WHERE id=? AND lease=?').bind(this.now(),job.id,job.lease).run();}
 async reviewed(job,stage,hash){
  if(!['input','output'].includes(stage))throw new Error('invalid_review_stage');
  await this.db.prepare("UPDATE ai_test_jobs SET spec_json=json_set(spec_json,?,?),updated_at=? WHERE id=? AND lease=? AND lease_until>? AND status IN ('queued','processing')").bind('$.moderation_'+stage,MODERATION_VERSION+':'+hash,this.now(),job.id,job.lease,this.now()).run();
  const fresh=await this.find(job.id);return fresh?.lease===job.lease&&JSON.parse(fresh.spec_json)['moderation_'+stage]===MODERATION_VERSION+':'+hash;
 }
 async fail(id,error){await this.db.prepare(`UPDATE ai_test_jobs SET status='failed',error_code=?,lease=NULL,lease_until=0,updated_at=? WHERE id=? AND status IN (${ACTIVE})`).bind(error,this.now(),id).run();return this.find(id);}
 async cancel(id){await this.db.prepare(`UPDATE ai_test_jobs SET status='canceled',error_code=NULL,lease=NULL,lease_until=0,updated_at=? WHERE id=? AND status IN (${ACTIVE})`).bind(this.now(),id).run();return this.find(id);}
 async finish(job,key,image){
  await this.db.prepare(`UPDATE ai_test_jobs SET status='succeeded',charged=1,result_key=?,width=?,height=?,lease=NULL,lease_until=0,updated_at=?
   WHERE id=? AND lease=? AND status='processing' AND expires_at>? AND json_extract(spec_json,'$.moderation_output') LIKE ? AND ${GRANTED}-${USED}>=0`).bind(key,image.width,image.height,this.now(),job.id,job.lease,this.now(),MODERATION_VERSION+':%',job.user_key,job.user_key).run();return this.find(job.id);
 }
 async pending(){return (await this.db.prepare("SELECT * FROM ai_test_jobs WHERE status IN ('queued','processing') AND lease_until<=? LIMIT 30").bind(this.now()).all()).results;}
 async recover(){
  const n=this.now();
  await this.db.prepare(`UPDATE ai_test_jobs SET status='failed',error_code=CASE WHEN status='submitting' THEN 'submission_uncertain' ELSE 'task_timeout' END,lease=NULL,lease_until=0,updated_at=?
   WHERE (status='submitting' AND lease_until<?) OR (status IN (${ACTIVE}) AND created_at<?) OR (status='awaiting_upload' AND created_at<?)`).bind(n,n,n-AI_LIMITS.taskMs,n-AI_LIMITS.uploadMs).run();
 }
 async expired(){return (await this.db.prepare("SELECT id,result_key FROM ai_test_jobs WHERE expires_at<=? AND status!='expired' LIMIT 50").bind(this.now()).all()).results;}
 async expire(id){await this.db.prepare("UPDATE ai_test_jobs SET status='expired',result_key=NULL,result_url=NULL,status_url=NULL,cancel_url=NULL,spec_json=json_remove(spec_json,'$.prompt') WHERE id=? AND expires_at<=?").bind(id,this.now()).run();}
}
