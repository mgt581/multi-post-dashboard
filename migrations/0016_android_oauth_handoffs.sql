CREATE TABLE IF NOT EXISTS android_oauth_handoffs (
  ticket_hash TEXT PRIMARY KEY,
  authorization_url TEXT NOT NULL,
  browser_nonce TEXT,
  folder_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS android_oauth_handoffs_expiry ON android_oauth_handoffs(expires_at);
