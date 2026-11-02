-- Apply after 0011. A reservation prevents concurrent publication attempts
-- from exceeding the monthly allowance before a provider confirms success.
CREATE TABLE IF NOT EXISTS billing_publish_slots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('youtube', 'facebook', 'tiktok')),
  month_start INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_billing_publish_month ON billing_publish_slots (user_id, month_start, status);

CREATE TABLE IF NOT EXISTS billing_publish_sessions (
  session_id TEXT PRIMARY KEY,
  slot_id TEXT NOT NULL UNIQUE REFERENCES billing_publish_slots(id)
);
