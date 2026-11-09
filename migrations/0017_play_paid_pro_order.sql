-- A successful zero-value trial order is not proof of the first Pro payment.
ALTER TABLE billing_play_purchases ADD COLUMN pro_paid_order_id TEXT;
