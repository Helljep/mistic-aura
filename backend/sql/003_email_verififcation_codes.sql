-- Adds brute-force protection to the 6-digit email verification codes.
-- Safe to run more than once on MySQL 8.0.29+ thanks to IF NOT EXISTS.
-- If your Hostinger MySQL is older and rejects IF NOT EXISTS, drop that clause
-- and run the statement once only.

ALTER TABLE email_verification_codes
  ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0 AFTER code_hash;