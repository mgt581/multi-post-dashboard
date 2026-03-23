-- Upload sessions table for Facebook chunked-upload proxy.
-- Each row stores the platform upload URL and access credentials for a
-- multi-chunk upload that flows through the Worker so that the browser
-- never needs to hold the page access token.
CREATE TABLE IF NOT EXISTS upload_sessions (
  id          TEXT    PRIMARY KEY,
  platform    TEXT    NOT NULL,
  upload_url  TEXT    NOT NULL,
  access_token TEXT   NOT NULL,
  video_id    TEXT,
  page_id     TEXT,
  title       TEXT,
  description TEXT,
  file_size   INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  expires_at  INTEGER NOT NULL
);
