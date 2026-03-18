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
  profile_picture TEXT
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
