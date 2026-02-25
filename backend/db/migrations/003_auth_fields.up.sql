-- Add password + magic link fields to users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255),
  ADD COLUMN IF NOT EXISTS magic_link_token_hash VARCHAR(255),
  ADD COLUMN IF NOT EXISTS magic_link_expires_at TIMESTAMP;
