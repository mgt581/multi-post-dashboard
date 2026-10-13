-- Additive: preserve existing TikTok credentials; their identity is filled on reconnect.
ALTER TABLE accounts ADD COLUMN tiktok_open_id TEXT;
ALTER TABLE upload_sessions ADD COLUMN folder_id TEXT;
ALTER TABLE upload_sessions ADD COLUMN user_id TEXT;
CREATE TABLE tiktok_oauth_states (
  state TEXT PRIMARY KEY,
  browser_nonce TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX tiktok_oauth_expiry ON tiktok_oauth_states(expires_at);
