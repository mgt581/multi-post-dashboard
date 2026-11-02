-- Apply after 0010. Existing subscribers and workspaces are retained.
ALTER TABLE billing_play_purchases ADD COLUMN workspace_quantity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE billing_play_purchases ADD COLUMN workspace_expiry INTEGER;

CREATE TABLE IF NOT EXISTS billing_play_token_claims (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
INSERT OR IGNORE INTO billing_play_token_claims (token_hash, user_id)
SELECT token_hash, user_id FROM billing_play_purchases;

CREATE TABLE IF NOT EXISTS billing_ai_requests (
  user_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  month_start INTEGER NOT NULL,
  credits INTEGER NOT NULL CHECK (credits IN (0, 1, 2)),
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  result_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  PRIMARY KEY (user_id, request_id)
);
CREATE INDEX IF NOT EXISTS idx_billing_ai_month ON billing_ai_requests (user_id, month_start, status);
