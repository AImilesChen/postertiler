-- Additive sandbox migration. Existing purchased credits remain in the order table.
CREATE TABLE IF NOT EXISTS cloud_test_jobs (
  id TEXT PRIMARY KEY,
  user_key TEXT NOT NULL,
  request_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  source_size INTEGER NOT NULL CHECK(source_size > 0),
  source_type TEXT NOT NULL CHECK(source_type IN ('image/jpeg','image/png')),
  settings_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('awaiting_upload','queued','processing','succeeded','failed','canceled','expired')),
  credit_state TEXT NOT NULL CHECK(credit_state IN ('held','consumed','released')),
  source_ready INTEGER NOT NULL DEFAULT 0 CHECK(source_ready IN (0,1)),
  attempts INTEGER NOT NULL DEFAULT 0,
  retries INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  retryable INTEGER NOT NULL DEFAULT 0,
  result_key TEXT,
  result_size INTEGER,
  page_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  upload_until INTEGER NOT NULL,
  deadline INTEGER NOT NULL,
  cleaned_at INTEGER,
  UNIQUE(user_key,request_id),
  CHECK((status = 'succeeded' AND credit_state = 'consumed') OR
        (status IN ('awaiting_upload','queued','processing') AND credit_state = 'held') OR
        (status IN ('failed','canceled') AND credit_state = 'released') OR status = 'expired')
);
CREATE INDEX IF NOT EXISTS cloud_test_owner ON cloud_test_jobs(user_key,created_at DESC);
CREATE INDEX IF NOT EXISTS cloud_test_recovery ON cloud_test_jobs(status,lease_until,deadline);
CREATE INDEX IF NOT EXISTS cloud_test_cleanup ON cloud_test_jobs(cleaned_at,expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS cloud_test_same_result ON cloud_test_jobs(user_key,fingerprint)
 WHERE status IN ('awaiting_upload','queued','processing','succeeded');
CREATE VIEW IF NOT EXISTS cloud_test_balances AS
 SELECT owners.user_key,
   COALESCE((SELECT SUM(credits-refunded_credits) FROM billing_test_orders o WHERE o.user_key=owners.user_key AND o.paid=1),0) AS granted,
   (SELECT COUNT(*) FROM cloud_test_jobs j WHERE j.user_key=owners.user_key AND j.credit_state='held') AS reserved,
   (SELECT COUNT(*) FROM cloud_test_jobs j WHERE j.user_key=owners.user_key AND j.credit_state='consumed') AS used
 FROM (SELECT user_key FROM billing_test_orders UNION SELECT user_key FROM cloud_test_jobs) owners;
