-- Additive operations tables; existing gallery, billing and credit records are untouched.
CREATE TABLE IF NOT EXISTS ops_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);
INSERT OR IGNORE INTO ops_meta VALUES('started_at',strftime('%s','now')||'000');
CREATE TABLE IF NOT EXISTS ops_users (
 user_key TEXT PRIMARY KEY,email TEXT NOT NULL,name TEXT NOT NULL DEFAULT '',is_operator INTEGER NOT NULL DEFAULT 0,
 first_recorded INTEGER NOT NULL,last_login INTEGER,last_seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ops_users_seen ON ops_users(first_recorded);
CREATE TABLE IF NOT EXISTS ops_feedback (
 id TEXT PRIMARY KEY,user_key TEXT,request_id TEXT NOT NULL,fingerprint TEXT NOT NULL,
 category TEXT NOT NULL,area TEXT NOT NULL,message TEXT NOT NULL,reply_email TEXT,
 page_path TEXT NOT NULL DEFAULT '',browser TEXT NOT NULL DEFAULT '',device TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'new',priority TEXT NOT NULL DEFAULT 'normal',internal_note TEXT NOT NULL DEFAULT '',
 response TEXT NOT NULL DEFAULT '',attachment_key TEXT,revision INTEGER NOT NULL DEFAULT 0,archived INTEGER NOT NULL DEFAULT 0,last_mutation TEXT,
 created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ops_feedback_owner ON ops_feedback(user_key,created_at);
CREATE INDEX IF NOT EXISTS ops_feedback_status ON ops_feedback(status,archived,created_at);
CREATE TABLE IF NOT EXISTS ops_refund_requests (
 id TEXT PRIMARY KEY,user_key TEXT NOT NULL,mode TEXT NOT NULL,kind TEXT NOT NULL,order_id TEXT NOT NULL,
 requested_amount INTEGER NOT NULL,reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'received',
 internal_note TEXT NOT NULL DEFAULT '',response TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,UNIQUE(mode,kind,order_id)
);
CREATE TABLE IF NOT EXISTS ops_audit (
 id TEXT PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,details TEXT NOT NULL DEFAULT '{}',created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ops_audit_created ON ops_audit(created_at);
CREATE TABLE IF NOT EXISTS ops_limits (bucket TEXT PRIMARY KEY,hits INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ops_visits (
 day TEXT NOT NULL,visitor_key TEXT NOT NULL,session_key TEXT NOT NULL,path TEXT NOT NULL,country TEXT NOT NULL,source TEXT NOT NULL,
 page_views INTEGER NOT NULL DEFAULT 0,active_seconds INTEGER NOT NULL DEFAULT 0,last_seen INTEGER NOT NULL,
 PRIMARY KEY(day,visitor_key,session_key,path)
);
CREATE INDEX IF NOT EXISTS ops_visits_day ON ops_visits(day,country);
CREATE TABLE IF NOT EXISTS ops_metric_events (
 id TEXT PRIMARY KEY,day TEXT NOT NULL,visitor_key TEXT NOT NULL,session_key TEXT NOT NULL,path TEXT NOT NULL,
 event TEXT NOT NULL,tool TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL,applied INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ops_metric_day ON ops_metric_events(day,event);
CREATE TABLE IF NOT EXISTS ops_outbox (
 id TEXT PRIMARY KEY,kind TEXT NOT NULL,target TEXT NOT NULL,recipient TEXT NOT NULL DEFAULT '',body TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0,
 lease_until INTEGER NOT NULL DEFAULT 0,lease TEXT,error_code TEXT,created_at INTEGER NOT NULL,sent_at INTEGER
);
CREATE TABLE IF NOT EXISTS ops_payment_facts (
 mode TEXT NOT NULL,kind TEXT NOT NULL,order_id TEXT NOT NULL,paid_at INTEGER NOT NULL,PRIMARY KEY(mode,kind,order_id)
);
