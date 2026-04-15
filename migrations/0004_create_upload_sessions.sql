CREATE TABLE IF NOT EXISTS upload_sessions (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  upload_url TEXT,
  access_token TEXT,
  video_id TEXT,
  page_id TEXT,
  title TEXT,
  description TEXT,
  file_size INTEGER,
  expires_at INTEGER
);
