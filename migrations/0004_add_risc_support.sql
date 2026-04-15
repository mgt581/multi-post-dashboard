-- Add Google Account subject identifier for Cross-Account Protection (RISC)
ALTER TABLE accounts ADD COLUMN google_sub TEXT;

-- Index for efficient RISC event lookups by Google Account ID
CREATE INDEX IF NOT EXISTS idx_accounts_google_sub ON accounts (google_sub);

-- Log table for received RISC security event tokens (used for de-duplication and audit)
CREATE TABLE IF NOT EXISTS risc_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jti TEXT NOT NULL UNIQUE,
  event_type TEXT,
  google_sub TEXT,
  received_at INTEGER DEFAULT (strftime('%s','now'))
);
