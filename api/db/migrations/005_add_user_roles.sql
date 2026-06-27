-- Migration 005: role-based access control on users table
-- Safe to run multiple times (ADD COLUMN IF NOT EXISTS).

-- role: 'user' (default), 'admin', 'pharmacy' (for future Phase 3+ use)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('admin', 'user', 'pharmacy'));

-- password_hash: nullable — only admin accounts use password auth.
-- Regular users authenticate via OTP only.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Index: fast lookup for admin-login route (email + role guard)
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
