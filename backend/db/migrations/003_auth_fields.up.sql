-- Add password + magic link fields to users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS magic_link_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS magic_link_expires_at TIMESTAMP;

-- Backfill demo users with a default password
UPDATE users
SET password_hash = crypt('Password123!', gen_salt('bf'))
WHERE password_hash IS NULL;
