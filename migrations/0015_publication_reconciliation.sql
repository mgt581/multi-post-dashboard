-- Apply after 0014. Cycle through pending provider sessions without
-- allowing a permanently processing upload to starve newer confirmations.
ALTER TABLE billing_publish_slots ADD COLUMN reconciled_at INTEGER;
