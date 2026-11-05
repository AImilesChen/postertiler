-- Test-only orders. Never bind this database to a live-money integration.
CREATE TABLE IF NOT EXISTS billing_test_orders (
  id TEXT PRIMARY KEY,
  user_key TEXT NOT NULL,
  request_id TEXT NOT NULL,
  sku TEXT NOT NULL CHECK (sku IN ('single', 'pack5')),
  price_id TEXT NOT NULL,
  price_version TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL CHECK (currency = 'usd'),
  credits INTEGER NOT NULL CHECK (credits IN (1, 5)),
  session_id TEXT UNIQUE,
  payment_intent_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','pending','paid','expired','failed','partially_refunded','refunded')),
  paid INTEGER NOT NULL DEFAULT 0 CHECK (paid IN (0,1)),
  refunded_amount INTEGER NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0 AND refunded_amount <= amount),
  refunded_credits INTEGER NOT NULL DEFAULT 0 CHECK (refunded_credits >= 0 AND refunded_credits <= credits),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (user_key, request_id)
);
CREATE INDEX IF NOT EXISTS billing_test_orders_owner ON billing_test_orders(user_key, created_at);
CREATE TABLE IF NOT EXISTS billing_test_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  order_id TEXT NOT NULL REFERENCES billing_test_orders(id),
  processed_at INTEGER NOT NULL
);
