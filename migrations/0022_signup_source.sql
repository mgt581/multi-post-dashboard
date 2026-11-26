-- Where a sign-up came from (e.g. 'card' for the business card QR code) and daily visit counts per source.
ALTER TABLE lifecycle_emails ADD COLUMN signup_source TEXT;
CREATE TABLE IF NOT EXISTS source_visits (
  source TEXT NOT NULL,
  day TEXT NOT NULL,
  visits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (source, day)
);
