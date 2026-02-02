CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  nickname TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at INTEGER,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  FOREIGN KEY (folder_id) REFERENCES folders(id)
);

CREATE TABLE IF NOT EXISTS tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_id INTEGER NOT NULL,
  platform TEXT NOT NULL,
  account_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at INTEGER,
  scope TEXT,
  updated_at INTEGER DEFAULT (strftime('%s','now')),
  user_id TEXT,
  UNIQUE(folder_id, platform, account_id),
  FOREIGN KEY (folder_id) REFERENCES folders(id)
);
