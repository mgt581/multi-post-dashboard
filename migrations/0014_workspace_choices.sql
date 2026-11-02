-- Apply after 0013. A downgrade keeps all folders, but only the selected
-- paid number are usable. Preferences belong to the verified Firebase UID.
CREATE TABLE IF NOT EXISTS billing_workspace_choices (
  user_id TEXT NOT NULL,
  folder_id INTEGER NOT NULL,
  priority INTEGER NOT NULL,
  PRIMARY KEY (user_id, folder_id)
);
CREATE INDEX IF NOT EXISTS idx_billing_workspace_choices_order ON billing_workspace_choices (user_id, priority);
