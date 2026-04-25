-- google_sub already exists in this production DB
-- so we only keep idempotent objects here.

CREATE INDEX IF NOT EXISTS idx_accounts_google_sub ON accounts (google_sub);

CREATE TABLE IF NOT EXISTS risc_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jti TEXT NOT NULL UNIQUE,
  event_type TEXT,
  google_sub TEXT,
  received_at INTEGER DEFAULT (strftime('%s','now'))
);
