ALTER TABLE billing_subscriptions ADD COLUMN is_owner INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_is_owner
ON billing_subscriptions (is_owner);
