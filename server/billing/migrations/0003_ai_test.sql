-- Independent sandbox AI orders and credits. Cloud export balances are untouched.
CREATE TABLE IF NOT EXISTS ai_test_orders (
 id TEXT PRIMARY KEY,user_key TEXT NOT NULL,request_id TEXT NOT NULL,
 sku TEXT NOT NULL CHECK(sku IN ('ai40','ai100')),price_id TEXT NOT NULL,price_version TEXT NOT NULL,
 amount INTEGER NOT NULL CHECK(amount IN (499,999)),currency TEXT NOT NULL CHECK(currency='usd'),
 credits INTEGER NOT NULL CHECK(credits IN (40,100)),session_id TEXT UNIQUE,payment_intent_id TEXT UNIQUE,
 status TEXT NOT NULL DEFAULT 'created' CHECK(status IN ('created','pending','paid','expired','failed','partially_refunded','refunded')),
 paid INTEGER NOT NULL DEFAULT 0 CHECK(paid IN (0,1)),refunded_amount INTEGER NOT NULL DEFAULT 0 CHECK(refunded_amount>=0 AND refunded_amount<=amount),
 refunded_credits INTEGER NOT NULL DEFAULT 0 CHECK(refunded_credits>=0 AND refunded_credits<=credits),
 created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,UNIQUE(user_key,request_id)
);
CREATE INDEX IF NOT EXISTS ai_test_orders_owner ON ai_test_orders(user_key,created_at);
CREATE TABLE IF NOT EXISTS ai_test_events(event_id TEXT PRIMARY KEY,event_type TEXT NOT NULL,order_id TEXT NOT NULL REFERENCES ai_test_orders(id),processed_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ai_test_jobs (
 id TEXT PRIMARY KEY,user_key TEXT NOT NULL,request_id TEXT NOT NULL,fingerprint TEXT NOT NULL,
 spec_json TEXT NOT NULL,credits INTEGER NOT NULL CHECK(credits IN (3,8,16)),budget_cents INTEGER NOT NULL,
 source_hash TEXT,source_size INTEGER,source_type TEXT,
 status TEXT NOT NULL CHECK(status IN ('awaiting_upload','queued','submitting','processing','succeeded','failed','canceled','expired')),
 provider_request_id TEXT,result_url TEXT,status_url TEXT,cancel_url TEXT,result_key TEXT,width INTEGER,height INTEGER,
 error_code TEXT,lease TEXT,lease_until INTEGER NOT NULL DEFAULT 0,charged INTEGER NOT NULL DEFAULT 0 CHECK(charged IN (0,1)),
 budget_committed INTEGER NOT NULL DEFAULT 0 CHECK(budget_committed IN (0,1)),
 created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,UNIQUE(user_key,request_id)
);
CREATE INDEX IF NOT EXISTS ai_test_jobs_owner ON ai_test_jobs(user_key,created_at);
CREATE INDEX IF NOT EXISTS ai_test_jobs_pending ON ai_test_jobs(status,lease_until);
