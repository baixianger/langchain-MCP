import { Router } from 'express';
import crypto from 'crypto';
import { getDatabase } from '../db/index.js';

const router = Router();

// Google OAuth config
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

const API_BASE_URL = process.env.API_BASE_URL || 'https://api.langchain-mcp.xyz';

// Store pending OAuth states (in production, use Redis)
const pendingStates = new Map<string, { callback: string; expires: number }>();

// Cleanup expired states every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of pendingStates) {
    if (data.expires < now) pendingStates.delete(state);
  }
}, 5 * 60 * 1000);

/**
 * Helper: Find or create user via Google OAuth
 */
function findOrCreateUser(
  googleId: string,
  email: string,
  name: string | null,
  avatarUrl: string | null
): { userId: string; credits: number } {
  const db = getDatabase();

  // Find existing user by Google ID
  let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId) as {
    id: string;
    credits_cents: number;
  } | undefined;

  if (!user) {
    // Check if user with same email exists (link accounts)
    const existingUser = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as {
      id: string;
      credits_cents: number;
    } | undefined;
    if (existingUser) {
      // Link Google account to existing user
      db.prepare("UPDATE users SET google_id = ?, updated_at = datetime('now') WHERE id = ?")
        .run(googleId, existingUser.id);
      console.log(`Linked Google account to existing user: ${email}`);
      user = existingUser;
    }
  }

  if (!user) {
    // Create new user with $5 credits
    const userId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO users (id, google_id, email, name, avatar_url, credits_cents)
      VALUES (?, ?, ?, ?, ?, 500)
    `).run(userId, googleId, email, name, avatarUrl);

    user = { id: userId, credits_cents: 500 };
    console.log(`New user created via Google: ${email} (${googleId})`);
  } else {
    // Update user info
    db.prepare(`
      UPDATE users SET email = COALESCE(?, email), name = COALESCE(?, name),
      avatar_url = COALESCE(?, avatar_url), updated_at = datetime('now')
      WHERE id = ?
    `).run(email, name, avatarUrl, user.id);
  }

  return { userId: user.id, credits: user.credits_cents };
}

/**
 * Helper: Generate API key for user
 */
function generateApiKey(userId: string): string {
  const db = getDatabase();
  const apiKey = `lc_${crypto.randomBytes(24).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  const keyId = crypto.randomUUID();

  db.prepare(`
    INSERT INTO api_keys (id, user_id, key_hash, key_prefix)
    VALUES (?, ?, ?, ?)
  `).run(keyId, userId, keyHash, apiKey.slice(0, 11));

  return apiKey;
}

// ============================================================
// Google OAuth
// ============================================================

/**
 * GET /auth/google
 * Start Google OAuth flow
 */
router.get('/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) {
    return res.status(500).json({ error: 'Google OAuth not configured' });
  }

  const callback = req.query.callback as string;
  if (!callback) {
    return res.status(400).json({ error: 'Missing callback parameter' });
  }

  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, {
    callback,
    expires: Date.now() + 10 * 60 * 1000
  });

  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleAuthUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  googleAuthUrl.searchParams.set('redirect_uri', `${API_BASE_URL}/auth/google/callback`);
  googleAuthUrl.searchParams.set('response_type', 'code');
  googleAuthUrl.searchParams.set('scope', 'openid email profile');
  googleAuthUrl.searchParams.set('state', state);
  googleAuthUrl.searchParams.set('access_type', 'offline');

  res.redirect(googleAuthUrl.toString());
});

/**
 * GET /auth/google/callback
 * Google OAuth callback
 */
router.get('/google/callback', async (req, res) => {
  const { code, state } = req.query as { code?: string; state?: string };

  if (!code || !state) {
    return res.status(400).send('Missing code or state');
  }

  const pending = pendingStates.get(state);
  if (!pending) {
    return res.status(400).send('Invalid or expired state');
  }
  pendingStates.delete(state);

  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: `${API_BASE_URL}/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json() as {
      access_token?: string;
      id_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.error || 'Failed to get access token');
    }

    // Get user info from Google
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
      },
    });

    const googleUser = await userRes.json() as {
      id: string;
      email: string;
      name: string;
      picture: string;
    };

    // Find or create user
    const { userId, credits } = findOrCreateUser(
      googleUser.id,
      googleUser.email,
      googleUser.name,
      googleUser.picture
    );

    // Generate API key
    const apiKey = generateApiKey(userId);

    // Redirect back to CLI
    const callbackUrl = new URL(pending.callback);
    callbackUrl.searchParams.set('api_key', apiKey);
    callbackUrl.searchParams.set('user', JSON.stringify({
      id: userId,
      email: googleUser.email,
      name: googleUser.name,
      credits: credits / 100,
    }));

    res.redirect(callbackUrl.toString());

  } catch (error) {
    console.error('Google OAuth error:', error);
    const callbackUrl = new URL(pending.callback);
    callbackUrl.searchParams.set('error', (error as Error).message);
    res.redirect(callbackUrl.toString());
  }
});

// ============================================================
// Provider list endpoint
// ============================================================

/**
 * GET /auth/providers
 * List available OAuth providers
 */
router.get('/providers', (req, res) => {
  res.json({
    providers: GOOGLE_CLIENT_ID ? ['google'] : [],
  });
});

export default router;
