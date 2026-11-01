CREATE TABLE IF NOT EXISTS billing_play_purchases (
  user_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  encrypted_token TEXT NOT NULL,
  product_id TEXT NOT NULL,
  base_plan_id TEXT NOT NULL,
  subscription_state TEXT NOT NULL,
  expiry_time INTEGER NOT NULL,
  last_verified_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_billing_play_expiry ON billing_play_purchases (expiry_time);
