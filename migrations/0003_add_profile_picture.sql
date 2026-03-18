-- Add profile_picture column to accounts table for TikTok avatars and Facebook page pictures
ALTER TABLE accounts ADD COLUMN profile_picture TEXT;
