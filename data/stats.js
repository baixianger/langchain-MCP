#!/usr/bin/env node
/**
 * Database statistics viewer
 * Usage: node stats.js [--detailed]
 */

const Database = require('../api/node_modules/better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'users.db');

const detailed = process.argv.includes('--detailed');

try {
  const db = new Database(DB_PATH, { readonly: true });

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  LangChain MCP - Database Statistics');
  console.log('═══════════════════════════════════════════════════════\n');

  // User statistics
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  const totalCredits = db.prepare('SELECT SUM(credits_cents) as total FROM users').get();
  const avgCredits = db.prepare('SELECT AVG(credits_cents) as avg FROM users').get();

  console.log('📊 User Statistics');
  console.log('─────────────────────────────────────────────────────');
  console.log(`Total Users:        ${userCount.count}`);
  console.log(`Total Credits:      $${((totalCredits.total || 0) / 100).toFixed(2)}`);
  console.log(`Average Credits:    $${((avgCredits.avg || 0) / 100).toFixed(2)}`);
  console.log('');

  // Recent users
  if (userCount.count > 0) {
    const recentUsers = db.prepare(`
      SELECT email, name, credits_cents, created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 5
    `).all();

    console.log('👥 Recent Users (Last 5)');
    console.log('─────────────────────────────────────────────────────');
    recentUsers.forEach((u, i) => {
      const credits = (u.credits_cents / 100).toFixed(2);
      const date = new Date(u.created_at).toLocaleDateString();
      console.log(`${i + 1}. ${u.email}`);
      console.log(`   Name: ${u.name || 'N/A'} | Credits: $${credits} | Joined: ${date}`);
    });
    console.log('');
  }

  // API Key statistics
  const apiKeyCount = db.prepare('SELECT COUNT(*) as count FROM api_keys').get();
  const activeKeys = db.prepare(`
    SELECT COUNT(*) as count
    FROM api_keys
    WHERE last_used_at IS NOT NULL
  `).get();
  const expiredKeys = db.prepare(`
    SELECT COUNT(*) as count
    FROM api_keys
    WHERE expires_at IS NOT NULL AND datetime(expires_at) < datetime('now')
  `).get();
  const expiringKeys = db.prepare(`
    SELECT COUNT(*) as count
    FROM api_keys
    WHERE expires_at IS NOT NULL
      AND datetime(expires_at) >= datetime('now')
      AND datetime(expires_at) <= datetime('now', '+30 days')
  `).get();

  console.log('🔑 API Key Statistics');
  console.log('─────────────────────────────────────────────────────');
  console.log(`Total API Keys:     ${apiKeyCount.count}`);
  console.log(`Active Keys:        ${activeKeys.count}`);
  console.log(`Never Used:         ${apiKeyCount.count - activeKeys.count}`);
  console.log(`Expired Keys:       ${expiredKeys.count}`);
  console.log(`Expiring Soon:      ${expiringKeys.count} (within 30 days)`);
  console.log('');

  // Usage statistics
  const usageStats = db.prepare(`
    SELECT
      SUM(tokens_used) as total_tokens,
      SUM(requests) as total_requests,
      COUNT(DISTINCT user_id) as active_users,
      COUNT(DISTINCT date) as days_tracked
    FROM usage_daily
  `).get();

  console.log('📈 Usage Statistics');
  console.log('─────────────────────────────────────────────────────');
  console.log(`Total Requests:     ${usageStats.total_requests || 0}`);
  console.log(`Total Tokens:       ${(usageStats.total_tokens || 0).toLocaleString()}`);
  console.log(`Active Users:       ${usageStats.active_users || 0}`);
  console.log(`Days Tracked:       ${usageStats.days_tracked || 0}`);
  console.log('');

  // Detailed view
  if (detailed && userCount.count > 0) {
    console.log('🔍 Detailed User Information');
    console.log('─────────────────────────────────────────────────────');

    const users = db.prepare(`
      SELECT
        u.email,
        u.name,
        u.credits_cents,
        u.created_at,
        COUNT(DISTINCT k.id) as api_keys,
        COALESCE(SUM(ud.requests), 0) as total_requests,
        COALESCE(SUM(ud.tokens_used), 0) as total_tokens
      FROM users u
      LEFT JOIN api_keys k ON u.id = k.user_id
      LEFT JOIN usage_daily ud ON u.id = ud.user_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `).all();

    users.forEach((u, i) => {
      console.log(`\n${i + 1}. ${u.email}`);
      console.log(`   Name:         ${u.name || 'N/A'}`);
      console.log(`   Credits:      $${(u.credits_cents / 100).toFixed(2)}`);
      console.log(`   API Keys:     ${u.api_keys}`);
      console.log(`   Requests:     ${u.total_requests}`);
      console.log(`   Tokens:       ${u.total_tokens.toLocaleString()}`);
      console.log(`   Joined:       ${new Date(u.created_at).toLocaleString()}`);
    });
    console.log('');
  }

  // Growth statistics (last 7 days)
  const growthStats = db.prepare(`
    SELECT
      DATE(created_at) as date,
      COUNT(*) as new_users
    FROM users
    WHERE created_at >= datetime('now', '-7 days')
    GROUP BY DATE(created_at)
    ORDER BY date DESC
  `).all();

  if (growthStats.length > 0) {
    console.log('📅 User Growth (Last 7 Days)');
    console.log('─────────────────────────────────────────────────────');
    growthStats.forEach(s => {
      console.log(`${s.date}: ${s.new_users} new user${s.new_users > 1 ? 's' : ''}`);
    });
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log(`Database: ${DB_PATH}`);
  console.log('═══════════════════════════════════════════════════════\n');

  db.close();

} catch (error) {
  console.error('Error reading database:', error.message);
  process.exit(1);
}
