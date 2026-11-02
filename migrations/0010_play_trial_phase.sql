-- Used only for verified Play trial display. The entitlement still depends on
-- Google subscription state and expiry, never on this display field.
ALTER TABLE billing_play_purchases ADD COLUMN trial_end INTEGER;
