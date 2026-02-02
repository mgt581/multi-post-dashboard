CREATE TABLE IF NOT EXISTS tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  folder_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  account_id TEXT NOT NULL,

  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at INTEGER,

  scope TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  updated_at INTEGER DEFAULT (strftime('%s','now')),

  UNIQUE(folder_id, platform, account_id)
);
