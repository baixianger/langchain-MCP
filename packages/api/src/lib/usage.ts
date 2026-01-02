import { getDatabase } from '../db/index.js';
import { SearchResult } from './vectorstore.js';

const GITHUB_SPONSORS_URL = 'https://github.com/sponsors/baixianger';

/**
 * Calculate tokens from input query and output results.
 * ~4 characters = 1 token
 */
export function calculateTokens(query: string, results: SearchResult[]): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
} {
  // Input tokens from query
  const inputTokens = Math.ceil(query.length / 4);

  // Output tokens from results
  let outputChars = 0;
  for (const result of results) {
    outputChars += result.content.length;
    outputChars += JSON.stringify(result.metadata).length;
  }
  const outputTokens = Math.ceil(outputChars / 4);

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

/**
 * Record usage and deduct credits (soft limit - allows negative balance).
 */
export function recordUsage(
  userId: string,
  inputTokens: number,
  outputTokens: number
): {
  creditsRemaining: number;
  shouldRemindDonation: boolean;
  donationUrl: string;
} {
  const db = getDatabase();
  const totalTokens = inputTokens + outputTokens;

  // 1000 tokens = 1 cent
  const costCents = Math.ceil(totalTokens / 1000);

  const result = db.transaction(() => {
    // Get current credits
    const user = db.prepare('SELECT credits_cents FROM users WHERE id = ?').get(userId) as { credits_cents: number } | undefined;

    if (!user) {
      throw new Error('User not found');
    }

    // Deduct credits (allow negative balance)
    db.prepare("UPDATE users SET credits_cents = credits_cents - ?, updated_at = datetime('now') WHERE id = ?")
      .run(costCents, userId);

    // Update daily aggregate with input/output breakdown
    const today = new Date().toISOString().split('T')[0];
    db.prepare(`
      INSERT INTO usage_daily (user_id, date, tokens_used, requests)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(user_id, date) DO UPDATE SET
        tokens_used = tokens_used + excluded.tokens_used,
        requests = requests + 1
    `).run(userId, today, totalTokens);

    return user.credits_cents - costCents;
  })();

  return {
    creditsRemaining: result,
    shouldRemindDonation: result <= 0,
    donationUrl: GITHUB_SPONSORS_URL,
  };
}

/**
 * Get usage stats for a user.
 */
export function getUsageStats(userId: string) {
  const db = getDatabase();

  const user = db.prepare('SELECT credits_cents, created_at FROM users WHERE id = ?')
    .get(userId) as { credits_cents: number; created_at: string } | undefined;

  if (!user) {
    throw new Error('User not found');
  }

  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.slice(0, 7) + '-01';

  const todayUsage = db.prepare(`
    SELECT COALESCE(SUM(tokens_used), 0) as tokens, COALESCE(SUM(requests), 0) as requests
    FROM usage_daily WHERE user_id = ? AND date = ?
  `).get(userId, today) as { tokens: number; requests: number };

  const monthUsage = db.prepare(`
    SELECT COALESCE(SUM(tokens_used), 0) as tokens, COALESCE(SUM(requests), 0) as requests
    FROM usage_daily WHERE user_id = ? AND date >= ?
  `).get(userId, monthStart) as { tokens: number; requests: number };

  const allTimeUsage = db.prepare(`
    SELECT COALESCE(SUM(tokens_used), 0) as tokens, COALESCE(SUM(requests), 0) as requests
    FROM usage_daily WHERE user_id = ?
  `).get(userId) as { tokens: number; requests: number };

  return {
    credits: {
      remaining_cents: user.credits_cents,
      remaining_dollars: user.credits_cents / 100,
      remaining: user.credits_cents / 100, // For CLI compatibility
      is_depleted: user.credits_cents <= 0,
    },
    usage: {
      today: { tokens: todayUsage.tokens, requests: todayUsage.requests },
      this_month: { tokens: monthUsage.tokens, requests: monthUsage.requests },
      all_time: { tokens: allTimeUsage.tokens, requests: allTimeUsage.requests },
    },
    donation_url: GITHUB_SPONSORS_URL,
  };
}
