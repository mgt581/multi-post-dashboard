ALTER TABLE billing_subscriptions ADD COLUMN stripe_price_id TEXT;
ALTER TABLE billing_subscriptions ADD COLUMN plan_key TEXT;
ALTER TABLE billing_subscriptions ADD COLUMN billing_interval TEXT;

CREATE TABLE IF NOT EXISTS billing_usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  platform TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE INDEX IF NOT EXISTS idx_billing_usage_user_time
ON billing_usage_events (user_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_subscriptions_customer
ON billing_subscriptions (stripe_customer_id);
