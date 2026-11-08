-- Apply once after 0001, 0002 and 0003. Additive records and order timestamps; no money movement.
ALTER TABLE billing_test_orders ADD COLUMN paid_at INTEGER;
-- statement-break
ALTER TABLE ai_test_orders ADD COLUMN paid_at INTEGER;
-- statement-break
CREATE TABLE billing_credit_allocations(kind TEXT NOT NULL,job_id TEXT NOT NULL,order_id TEXT NOT NULL,units INTEGER NOT NULL CHECK(units>0),state TEXT NOT NULL CHECK(state IN ('held','consumed','released')),legacy INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(kind,job_id,order_id));
-- statement-break
CREATE INDEX billing_alloc_order ON billing_credit_allocations(kind,order_id,state);
-- statement-break
CREATE TABLE billing_refund_reviews(id TEXT PRIMARY KEY,user_key TEXT NOT NULL,mode TEXT NOT NULL DEFAULT 'test',kind TEXT NOT NULL,order_id TEXT NOT NULL,requested_amount INTEGER NOT NULL,reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'received',internal_note TEXT NOT NULL DEFAULT '',response TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,approved_amount INTEGER NOT NULL DEFAULT 0,approved_units INTEGER NOT NULL DEFAULT 0,hold_units INTEGER NOT NULL DEFAULT 0,baseline_refunded INTEGER NOT NULL DEFAULT 0,baseline_credits INTEGER NOT NULL DEFAULT 0,quote_json TEXT,decision_reason TEXT NOT NULL DEFAULT '',last_mutation TEXT,UNIQUE(mode,kind,order_id));
-- statement-break
CREATE TABLE billing_refund_audit(id TEXT PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,details TEXT NOT NULL,created_at INTEGER NOT NULL);
-- statement-break
CREATE TABLE billing_refund_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
-- statement-break
INSERT INTO billing_refund_meta VALUES('policy_version','refund-v1-2026-11-08');
-- statement-break
CREATE VIEW billing_refund_orders AS SELECT 'cloud' kind,id,user_key,credits,refunded_credits,amount,refunded_amount,paid,paid_at,created_at,status,payment_intent_id FROM billing_test_orders UNION ALL SELECT 'ai' kind,id,user_key,credits,refunded_credits,amount,refunded_amount,paid,paid_at,created_at,status,payment_intent_id FROM ai_test_orders;
-- statement-break
CREATE VIEW billing_credit_available AS SELECT o.*,COALESCE((SELECT SUM(units) FROM billing_credit_allocations a WHERE a.kind=o.kind AND a.order_id=o.id AND a.state='consumed'),0) consumed,COALESCE((SELECT SUM(units) FROM billing_credit_allocations a WHERE a.kind=o.kind AND a.order_id=o.id AND a.state='held'),0) task_held,COALESCE((SELECT SUM(hold_units) FROM billing_refund_reviews r WHERE r.kind=o.kind AND r.order_id=o.id AND r.status='approved'),0) refund_held,MAX(0,o.credits-o.refunded_credits-COALESCE((SELECT SUM(units) FROM billing_credit_allocations a WHERE a.kind=o.kind AND a.order_id=o.id AND a.state IN ('consumed','held')),0)-COALESCE((SELECT SUM(hold_units) FROM billing_refund_reviews r WHERE r.kind=o.kind AND r.order_id=o.id AND r.status='approved'),0)) free FROM billing_refund_orders o WHERE o.paid=1;
-- statement-break
INSERT INTO billing_credit_allocations(kind,job_id,order_id,units,state,legacy)
 SELECT 'cloud',j.id,o.id,MIN(j.stop,o.stop)-MAX(j.start,o.start),j.state,1 FROM
 (SELECT id,CASE WHEN credit_state='consumed' THEN 'consumed' ELSE 'held' END state,SUM(1) OVER(PARTITION BY user_key ORDER BY CASE WHEN credit_state='consumed' THEN 0 ELSE 1 END,created_at,id)-1 start,SUM(1) OVER(PARTITION BY user_key ORDER BY CASE WHEN credit_state='consumed' THEN 0 ELSE 1 END,created_at,id) stop,user_key FROM cloud_test_jobs WHERE (credit_state='consumed') OR (credit_state='held')) j
 JOIN (SELECT id,user_key,SUM(credits-refunded_credits) OVER(PARTITION BY user_key ORDER BY COALESCE(paid_at,created_at),id)-(credits-refunded_credits) start,SUM(credits-refunded_credits) OVER(PARTITION BY user_key ORDER BY COALESCE(paid_at,created_at),id) stop FROM billing_refund_orders WHERE kind='cloud' AND paid=1) o ON o.user_key=j.user_key AND MIN(j.stop,o.stop)>MAX(j.start,o.start);
-- statement-break
CREATE TRIGGER billing_cloud_allocate_insert AFTER INSERT ON cloud_test_jobs WHEN NEW.credit_state='held' BEGIN INSERT INTO billing_credit_allocations(kind,job_id,order_id,units,state,legacy)
 SELECT 'cloud',NEW.id,id,MIN(free,MAX(0,1-prior)),'held',0 FROM
 (SELECT id,free,COALESCE(SUM(free) OVER(ORDER BY COALESCE(paid_at,created_at),id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) prior FROM billing_credit_available WHERE kind='cloud' AND user_key=NEW.user_key AND free>0)
 WHERE MIN(free,MAX(0,1-prior))>0
 ON CONFLICT(kind,job_id,order_id) DO UPDATE SET units=excluded.units,state='held',legacy=0 WHERE billing_credit_allocations.state='released';
 SELECT CASE WHEN COALESCE((SELECT SUM(units) FROM billing_credit_allocations WHERE kind='cloud' AND job_id=NEW.id AND state='held'),0)!=1 THEN RAISE(ABORT,'insufficient_allocatable_credits') END; END;
-- statement-break
CREATE TRIGGER billing_cloud_allocate_retry AFTER UPDATE ON cloud_test_jobs WHEN (NEW.credit_state='held') AND NOT (OLD.credit_state='held') BEGIN INSERT INTO billing_credit_allocations(kind,job_id,order_id,units,state,legacy)
 SELECT 'cloud',NEW.id,id,MIN(free,MAX(0,1-prior)),'held',0 FROM
 (SELECT id,free,COALESCE(SUM(free) OVER(ORDER BY COALESCE(paid_at,created_at),id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) prior FROM billing_credit_available WHERE kind='cloud' AND user_key=NEW.user_key AND free>0)
 WHERE MIN(free,MAX(0,1-prior))>0
 ON CONFLICT(kind,job_id,order_id) DO UPDATE SET units=excluded.units,state='held',legacy=0 WHERE billing_credit_allocations.state='released';
 SELECT CASE WHEN COALESCE((SELECT SUM(units) FROM billing_credit_allocations WHERE kind='cloud' AND job_id=NEW.id AND state='held'),0)!=1 THEN RAISE(ABORT,'insufficient_allocatable_credits') END; END;
-- statement-break
CREATE TRIGGER billing_cloud_settle AFTER UPDATE ON cloud_test_jobs WHEN NOT (NEW.credit_state='held') BEGIN UPDATE billing_credit_allocations SET state=CASE WHEN NEW.credit_state='consumed' THEN 'consumed' ELSE 'released' END WHERE kind='cloud' AND job_id=NEW.id AND state='held'; END;
-- statement-break
CREATE TRIGGER billing_cloud_refund_reconcile AFTER UPDATE OF refunded_credits,refunded_amount ON billing_test_orders BEGIN UPDATE billing_refund_reviews SET hold_units=CASE WHEN NEW.refunded_amount>=baseline_refunded+approved_amount THEN 0 ELSE MAX(0,approved_units-MAX(0,NEW.refunded_credits-baseline_credits)) END WHERE kind='cloud' AND order_id=NEW.id AND status='approved'; END;
-- statement-break
INSERT INTO billing_credit_allocations(kind,job_id,order_id,units,state,legacy)
 SELECT 'ai',j.id,o.id,MIN(j.stop,o.stop)-MAX(j.start,o.start),j.state,1 FROM
 (SELECT id,CASE WHEN charged=1 THEN 'consumed' ELSE 'held' END state,SUM(credits) OVER(PARTITION BY user_key ORDER BY CASE WHEN charged=1 THEN 0 ELSE 1 END,created_at,id)-credits start,SUM(credits) OVER(PARTITION BY user_key ORDER BY CASE WHEN charged=1 THEN 0 ELSE 1 END,created_at,id) stop,user_key FROM ai_test_jobs WHERE (charged=1) OR (charged=0 AND status IN ('awaiting_upload','queued','submitting','processing'))) j
 JOIN (SELECT id,user_key,SUM(credits-refunded_credits) OVER(PARTITION BY user_key ORDER BY COALESCE(paid_at,created_at),id)-(credits-refunded_credits) start,SUM(credits-refunded_credits) OVER(PARTITION BY user_key ORDER BY COALESCE(paid_at,created_at),id) stop FROM billing_refund_orders WHERE kind='ai' AND paid=1) o ON o.user_key=j.user_key AND MIN(j.stop,o.stop)>MAX(j.start,o.start);
-- statement-break
CREATE TRIGGER billing_ai_allocate_insert AFTER INSERT ON ai_test_jobs WHEN NEW.charged=0 AND NEW.status IN ('awaiting_upload','queued','submitting','processing') BEGIN INSERT INTO billing_credit_allocations(kind,job_id,order_id,units,state,legacy)
 SELECT 'ai',NEW.id,id,MIN(free,MAX(0,NEW.credits-prior)),'held',0 FROM
 (SELECT id,free,COALESCE(SUM(free) OVER(ORDER BY COALESCE(paid_at,created_at),id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) prior FROM billing_credit_available WHERE kind='ai' AND user_key=NEW.user_key AND free>0)
 WHERE MIN(free,MAX(0,NEW.credits-prior))>0
 ON CONFLICT(kind,job_id,order_id) DO UPDATE SET units=excluded.units,state='held',legacy=0 WHERE billing_credit_allocations.state='released';
 SELECT CASE WHEN COALESCE((SELECT SUM(units) FROM billing_credit_allocations WHERE kind='ai' AND job_id=NEW.id AND state='held'),0)!=NEW.credits THEN RAISE(ABORT,'insufficient_allocatable_credits') END; END;
-- statement-break
CREATE TRIGGER billing_ai_allocate_retry AFTER UPDATE ON ai_test_jobs WHEN (NEW.charged=0 AND NEW.status IN ('awaiting_upload','queued','submitting','processing')) AND NOT (OLD.charged=0 AND OLD.status IN ('awaiting_upload','queued','submitting','processing')) BEGIN INSERT INTO billing_credit_allocations(kind,job_id,order_id,units,state,legacy)
 SELECT 'ai',NEW.id,id,MIN(free,MAX(0,NEW.credits-prior)),'held',0 FROM
 (SELECT id,free,COALESCE(SUM(free) OVER(ORDER BY COALESCE(paid_at,created_at),id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) prior FROM billing_credit_available WHERE kind='ai' AND user_key=NEW.user_key AND free>0)
 WHERE MIN(free,MAX(0,NEW.credits-prior))>0
 ON CONFLICT(kind,job_id,order_id) DO UPDATE SET units=excluded.units,state='held',legacy=0 WHERE billing_credit_allocations.state='released';
 SELECT CASE WHEN COALESCE((SELECT SUM(units) FROM billing_credit_allocations WHERE kind='ai' AND job_id=NEW.id AND state='held'),0)!=NEW.credits THEN RAISE(ABORT,'insufficient_allocatable_credits') END; END;
-- statement-break
CREATE TRIGGER billing_ai_settle AFTER UPDATE ON ai_test_jobs WHEN NOT (NEW.charged=0 AND NEW.status IN ('awaiting_upload','queued','submitting','processing')) BEGIN UPDATE billing_credit_allocations SET state=CASE WHEN NEW.charged=1 THEN 'consumed' ELSE 'released' END WHERE kind='ai' AND job_id=NEW.id AND state='held'; END;
-- statement-break
CREATE TRIGGER billing_ai_refund_reconcile AFTER UPDATE OF refunded_credits,refunded_amount ON ai_test_orders BEGIN UPDATE billing_refund_reviews SET hold_units=CASE WHEN NEW.refunded_amount>=baseline_refunded+approved_amount THEN 0 ELSE MAX(0,approved_units-MAX(0,NEW.refunded_credits-baseline_credits)) END WHERE kind='ai' AND order_id=NEW.id AND status='approved'; END;
