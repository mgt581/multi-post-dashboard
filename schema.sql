CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  name TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  folder_id INTEGER,
  platform TEXT,
  nickname TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at INTEGER,
  facebook_user_id TEXT,
  facebook_user_name TEXT,
  facebook_user_access_token TEXT,
  facebook_page_id TEXT,
  facebook_page_name TEXT,
  facebook_page_access_token TEXT,
  facebook_page_picture TEXT,
  profile_picture TEXT,
  tiktok_open_id TEXT
);

CREATE TABLE IF NOT EXISTS tokens (
  folder_id INTEGER,
  platform TEXT,
  account_id TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at INTEGER,
  scope TEXT,
  updated_at INTEGER,
  PRIMARY KEY (folder_id, platform, account_id)
);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  user_id TEXT PRIMARY KEY,
  user_email TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  plan_key TEXT,
  billing_interval TEXT,
  is_owner INTEGER DEFAULT 0,
  subscription_status TEXT,
  current_period_end INTEGER,
  trial_end INTEGER,
  trial_used INTEGER DEFAULT 0,
  stripe_pro_paid_at INTEGER,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  updated_at INTEGER DEFAULT (strftime('%s','now'))
);

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

CREATE TABLE IF NOT EXISTS billing_usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  platform TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS billing_workspace_choices (
  user_id TEXT NOT NULL,
  folder_id INTEGER NOT NULL,
  priority INTEGER NOT NULL,
  PRIMARY KEY (user_id, folder_id)
);

CREATE TABLE IF NOT EXISTS tiktok_oauth_states (
  state TEXT PRIMARY KEY, browser_nonce TEXT NOT NULL, folder_id TEXT NOT NULL,
  user_id TEXT NOT NULL, expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS android_oauth_handoffs (
  ticket_hash TEXT PRIMARY KEY, authorization_url TEXT NOT NULL, browser_nonce TEXT,
  folder_id TEXT NOT NULL, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL
);
