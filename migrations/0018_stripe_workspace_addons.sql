ALTER TABLE billing_subscriptions ADD COLUMN stripe_pro_paid_at INTEGER;

CREATE TABLE IF NOT EXISTS billing_stripe_workspace_addons (
  stripe_subscription_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  stripe_price_id TEXT NOT NULL,
  subscription_status TEXT NOT NULL,
  paid_through INTEGER NOT NULL DEFAULT 0,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_stripe_workspace_addons_user
  ON billing_stripe_workspace_addons (user_id, paid_through);

CREATE TABLE IF NOT EXISTS billing_stripe_workspace_checkout_locks (
  user_id TEXT PRIMARY KEY,
  stripe_session_id TEXT,
  stripe_subscription_id TEXT,
  expires_at INTEGER NOT NULL
);
