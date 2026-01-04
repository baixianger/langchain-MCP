/**
 * Migration: Add expires_at to api_keys table
 * Run: node -e "require('./dist/db/migrations/001_add_expires_at.js').migrate()"
 */

import { getDatabase } from '../index.js';

export function migrate() {
  const db = getDatabase();

  console.log('Running migration: Add expires_at to api_keys');

  try {
    // Check if column already exists
    const tableInfo = db.prepare("PRAGMA table_info(api_keys)").all() as Array<{ name: string }>;
    const hasExpiresAt = tableInfo.some(col => col.name === 'expires_at');

    if (hasExpiresAt) {
      console.log('✓ Column expires_at already exists, skipping migration');
      return;
    }

    // Add expires_at column (SQLite doesn't support non-constant defaults in ALTER TABLE)
    db.prepare(`
      ALTER TABLE api_keys
      ADD COLUMN expires_at TEXT
    `).run();

    // Update existing keys to expire in 60 days
    const updated = db.prepare(`
      UPDATE api_keys
      SET expires_at = datetime('now', '+60 days')
      WHERE expires_at IS NULL
    `).run();

    console.log(`✓ Migration complete: Added expires_at column`);
    console.log(`✓ Updated ${updated.changes} existing API keys with 60-day expiry`);

  } catch (error) {
    console.error('✗ Migration failed:', error);
    throw error;
  }
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate();
}
