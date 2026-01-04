-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                    -- UUID
  google_id TEXT UNIQUE,                  -- Google user ID
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  credits_cents INTEGER DEFAULT 500,      -- $5.00 = 500 cents (free signup bonus)
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- API Keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,                    -- UUID
  user_id TEXT NOT NULL,
  key_hash TEXT UNIQUE NOT NULL,          -- SHA-256 hash of the key
  key_prefix TEXT NOT NULL,               -- First 8 chars for display: lc_xxxxxxxx
  name TEXT DEFAULT 'default',
  created_at TEXT DEFAULT (datetime('now')),
  last_used_at TEXT,
  expires_at TEXT,  -- 60 days expiry (set in application code)
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Daily usage aggregates
CREATE TABLE IF NOT EXISTS usage_daily (
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  tokens_used INTEGER DEFAULT 0,
  requests INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_usage_daily_user ON usage_daily(user_id);
