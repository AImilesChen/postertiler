import { CLOUD_LIMITS } from './contract.mjs';

export class CloudStore {
  constructor(db,now=()=>Date.now()) {this.db=db;this.now=now;}
  find(id) {return this.db.prepare('SELECT * FROM cloud_test_jobs WHERE id=?').bind(id).first();}
  findRequest(user,request) {return this.db.prepare('SELECT * FROM cloud_test_jobs WHERE user_key=? AND request_id=?').bind(user,request).first();}
  same(user,fingerprint) {return this.db.prepare("SELECT * FROM cloud_test_jobs WHERE user_key=? AND fingerprint=? AND status IN ('awaiting_upload','queued','processing','succeeded') AND expires_at>?").bind(user,fingerprint,this.now()).first();}
  async balance(user) {
    const b=await this.db.prepare('SELECT granted,reserved,used FROM cloud_test_balances WHERE user_key=?').bind(user).first() || {granted:0,reserved:0,used:0};
    return {...b,available:Math.max(0,b.granted-b.reserved-b.used),debt:Math.max(0,b.used+b.reserved-b.granted)};
  }
  async list(user) {return (await this.db.prepare('SELECT * FROM cloud_test_jobs WHERE user_key=? ORDER BY created_at DESC LIMIT 30').bind(user).all()).results;}
  async create(user,body,fingerprint,settings,pages) {
    const now=this.now(),id=crypto.randomUUID();
    // One SQLite statement makes the balance check and reservation indivisible.
    await this.db.prepare(`INSERT OR IGNORE INTO cloud_test_jobs
      (id,user_key,request_id,fingerprint,source_hash,source_size,source_type,settings_json,status,credit_state,page_count,created_at,updated_at,expires_at,upload_until,deadline)
      SELECT ?,?,?,?,?,?,?,?,'awaiting_upload','held',?,?,?,?,?,?
      WHERE COALESCE((SELECT granted-reserved-used FROM cloud_test_balances WHERE user_key=?),0)>0
      AND (SELECT COUNT(*) FROM cloud_test_jobs WHERE user_key=? AND credit_state='held')=0
      AND (SELECT COUNT(*) FROM cloud_test_jobs WHERE user_key=? AND created_at>?)<20`)
      .bind(id,user,body.request_id,fingerprint,body.source_hash,body.source_size,body.source_type,JSON.stringify(settings),pages,now,now,now+CLOUD_LIMITS.retentionMs,now+CLOUD_LIMITS.uploadMs,now+CLOUD_LIMITS.taskMs,user,user,user,now-3600000).run();
    return this.findRequest(user,body.request_id) || null;
  }
  async uploaded(id,settings,pages) {
    await this.db.prepare("UPDATE cloud_test_jobs SET source_ready=1,status='queued',settings_json=COALESCE(?,settings_json),page_count=COALESCE(?,page_count),updated_at=? WHERE id=? AND status='awaiting_upload' AND upload_until>?")
      .bind(settings?JSON.stringify(settings):null,pages??null,this.now(),id,this.now()).run();return this.find(id);
  }
  async claim(id) {
    const token=crypto.randomUUID(),now=this.now();
    await this.db.prepare(`UPDATE cloud_test_jobs SET status='processing',lease_token=?,lease_until=?,attempts=attempts+1,updated_at=?
      WHERE id=? AND status='queued' AND source_ready=1 AND deadline>? AND attempts<3`).bind(token,now+CLOUD_LIMITS.leaseMs,now,id,now).run();
    const row=await this.find(id);return row?.lease_token===token?row:null;
  }
  async finish(id,token,key,size) {
    await this.db.prepare(`UPDATE cloud_test_jobs SET status='succeeded',credit_state='consumed',result_key=?,result_size=?,error_code=NULL,retryable=0,lease_token=NULL,lease_until=0,updated_at=?
      WHERE id=? AND status='processing' AND lease_token=? AND lease_until>? AND deadline>?
      AND (SELECT granted-reserved-used FROM cloud_test_balances WHERE user_key=cloud_test_jobs.user_key)>=0`)
      .bind(key,size,this.now(),id,token,this.now(),this.now()).run();return (await this.find(id))?.result_key===key;
  }
  async fail(id,code,retryable=false,token=null) {
    await this.db.prepare(`UPDATE cloud_test_jobs SET status='failed',credit_state='released',error_code=?,retryable=?,lease_token=NULL,lease_until=0,updated_at=?
      WHERE id=? AND credit_state='held' ${token?'AND lease_token=?':''}`)
      .bind(code,retryable?1:0,this.now(),id,...(token?[token]:[])).run();
  }
  async requeue(id,token) {
    await this.db.prepare("UPDATE cloud_test_jobs SET status='queued',lease_token=NULL,lease_until=0,updated_at=? WHERE id=? AND status='processing' AND lease_token=? AND attempts<3 AND deadline>?")
      .bind(this.now(),id,token,this.now()).run();
  }
  async cancel(id) {
    await this.db.prepare("UPDATE cloud_test_jobs SET status='canceled',credit_state='released',error_code=NULL,lease_token=NULL,lease_until=0,updated_at=? WHERE id=? AND credit_state='held'").bind(this.now(),id).run();return this.find(id);
  }
  async retry(id,user) {
    const now=this.now();
    await this.db.prepare(`UPDATE cloud_test_jobs SET status='queued',credit_state='held',attempts=0,retries=retries+1,error_code=NULL,retryable=0,deadline=?,updated_at=?
      WHERE id=? AND user_key=? AND status='failed' AND retryable=1 AND source_ready=1 AND expires_at>? AND retries<3
      AND COALESCE((SELECT granted-reserved-used FROM cloud_test_balances WHERE user_key=?),0)>0
      AND (SELECT COUNT(*) FROM cloud_test_jobs WHERE user_key=? AND credit_state='held')=0
      AND NOT EXISTS(SELECT 1 FROM cloud_test_jobs j WHERE j.user_key=cloud_test_jobs.user_key AND j.fingerprint=cloud_test_jobs.fingerprint AND j.id!=cloud_test_jobs.id AND j.status IN ('awaiting_upload','queued','processing','succeeded'))`)
      .bind(Math.min(now+CLOUD_LIMITS.taskMs,now+CLOUD_LIMITS.retentionMs),now,id,user,now+CLOUD_LIMITS.taskMs,user,user).run();return this.find(id);
  }
  async recover() {
    const now=this.now();
    await this.db.batch([
      this.db.prepare("UPDATE cloud_test_jobs SET status='failed',credit_state='released',error_code='upload_timeout',retryable=0,updated_at=? WHERE status='awaiting_upload' AND upload_until<=?").bind(now,now),
      this.db.prepare("UPDATE cloud_test_jobs SET status='failed',credit_state='released',error_code='processing_timeout',retryable=source_ready,lease_token=NULL,lease_until=0,updated_at=? WHERE status IN ('queued','processing') AND (deadline<=? OR (status='processing' AND lease_until<=? AND attempts>=3))").bind(now,now,now),
      this.db.prepare("UPDATE cloud_test_jobs SET status='queued',lease_token=NULL,lease_until=0,updated_at=? WHERE status='processing' AND lease_until<=? AND deadline>? AND attempts<3").bind(now,now,now),
      this.db.prepare("UPDATE cloud_test_jobs SET status='expired',credit_state=CASE WHEN credit_state='held' THEN 'released' ELSE credit_state END,lease_token=NULL,lease_until=0,updated_at=? WHERE expires_at<=? AND status!='expired'").bind(now,now),
    ]);
  }
  async queued() {return (await this.db.prepare("SELECT id FROM cloud_test_jobs WHERE status='queued' ORDER BY created_at LIMIT 25").all()).results;}
  async expired() {return (await this.db.prepare('SELECT id FROM cloud_test_jobs WHERE expires_at<=? AND cleaned_at IS NULL LIMIT 25').bind(this.now()).all()).results;}
  async cleaned(id) {await this.db.prepare('UPDATE cloud_test_jobs SET cleaned_at=? WHERE id=?').bind(this.now(),id).run();}
}
