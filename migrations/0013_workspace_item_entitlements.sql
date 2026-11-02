-- Apply after 0012; keep per-item expiry through scheduled removals.
ALTER TABLE billing_play_purchases ADD COLUMN workspace_items_json TEXT NOT NULL DEFAULT '[]';
