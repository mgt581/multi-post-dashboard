-- One-off win-back email for people who signed up before the Free plan (they hit a trial wall).
-- Rows with winback_due = 1 get the win-back email once; winback_sent_at records when.
ALTER TABLE lifecycle_emails ADD COLUMN winback_due INTEGER;
ALTER TABLE lifecycle_emails ADD COLUMN winback_sent_at INTEGER;
