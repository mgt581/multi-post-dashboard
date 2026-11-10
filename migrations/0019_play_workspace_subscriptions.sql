-- Android extra workspaces bought as standalone Google Play subscriptions
-- (one purchase token per workspace), instead of add-on lines on the Pro token.
-- Additive only: existing Pro and add-on rows are unchanged.
CREATE TABLE IF NOT EXISTS billing_play_workspace_purchases (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  encrypted_token TEXT NOT NULL,
  product_id TEXT NOT NULL,
  base_plan_id TEXT NOT NULL,
  subscription_state TEXT NOT NULL,
  expiry_time INTEGER NOT NULL,
  renewing INTEGER NOT NULL DEFAULT 1,
  order_id TEXT,
  last_verified_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_play_workspace_user ON billing_play_workspace_purchases (user_id, expiry_time);
