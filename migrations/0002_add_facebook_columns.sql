-- Add Facebook-specific columns to accounts table
ALTER TABLE accounts ADD COLUMN facebook_user_id TEXT;
ALTER TABLE accounts ADD COLUMN facebook_user_name TEXT;
ALTER TABLE accounts ADD COLUMN facebook_user_access_token TEXT;
ALTER TABLE accounts ADD COLUMN facebook_page_id TEXT;
ALTER TABLE accounts ADD COLUMN facebook_page_name TEXT;
ALTER TABLE accounts ADD COLUMN facebook_page_access_token TEXT;
ALTER TABLE accounts ADD COLUMN facebook_page_picture TEXT;
