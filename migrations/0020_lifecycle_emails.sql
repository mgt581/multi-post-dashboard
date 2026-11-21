-- Free plan lifecycle emails (welcome, day-2 nudge, free posts used).
-- One row per verified account, created the first time it opens the app.
CREATE TABLE IF NOT EXISTS lifecycle_emails (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  first_name TEXT,
  signed_up_at INTEGER NOT NULL,
  unsubscribe_token TEXT NOT NULL,
  welcome_sent_at INTEGER,
  nudge_sent_at INTEGER,
  free_used_sent_at INTEGER,
  unsubscribed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_lifecycle_emails_signup ON lifecycle_emails (signed_up_at);
