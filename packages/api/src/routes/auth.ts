import { Router } from 'express';
import crypto from 'crypto';
import { getDatabase } from '../db/index.js';

const router = Router();

// GitHub OAuth config
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';

// Google OAuth config
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

const API_BASE_URL = process.env.API_BASE_URL || 'https://api.langchain-mcp.xyz';

// Store pending OAuth states (in production, use Redis)
const pendingStates = new Map<string, { callback: string; provider: 'github' | 'google'; expires: number }>();

// Cleanup expired states every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of pendingStates) {
    if (data.expires < now) pendingStates.delete(state);
  }
}, 5 * 60 * 1000);

/**
 * Helper: Find or create user, generate API key, return redirect URL
 */
function findOrCreateUser(
  provider: 'github' | 'google',
  providerId: string | number,
  email: string | null,
  name: string | null,
  avatarUrl: string | null
): { userId: string; credits: number } {
  const db = getDatabase();
  const idColumn = provider === 'github' ? 'github_id' : 'google_id';

  // Find existing user
  let user = db.prepare(`SELECT * FROM users WHERE ${idColumn} = ?`).get(providerId) as {
    id: string;
    credits_cents: number;
  } | undefined;

  if (!user) {
    // Check if user with same email exists (link accounts)
    if (email) {
      const existingUser = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as {
        id: string;
        credits_cents: number;
      } | undefined;
      if (existingUser) {
        // Link this provider to existing user
        db.prepare(`UPDATE users SET ${idColumn} = ?, updated_at = datetime('now') WHERE id = ?`)
          .run(providerId, existingUser.id);
        console.log(`Linked ${provider} account to existing user: ${email}`);
        user = existingUser;
      }
    }
  }

  if (!user) {
    // Create new user with $5 credits
    const userId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO users (id, ${idColumn}, email, name, avatar_url, credits_cents)
      VALUES (?, ?, ?, ?, ?, 500)
    `).run(userId, providerId, email, name, avatarUrl);

    user = { id: userId, credits_cents: 500 };
    console.log(`New user created via ${provider}: ${email} (${providerId})`);
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
// GitHub OAuth
// ============================================================

/**
 * GET /auth/github
 * Start GitHub OAuth flow
 */
router.get('/github', (req, res) => {
  if (!GITHUB_CLIENT_ID) {
    return res.status(500).json({ error: 'GitHub OAuth not configured' });
  }

  const callback = req.query.callback as string;
  if (!callback) {
    return res.status(400).json({ error: 'Missing callback parameter' });
  }

  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, {
    callback,
    provider: 'github',
    expires: Date.now() + 10 * 60 * 1000
  });

  const githubAuthUrl = new URL('https://github.com/login/oauth/authorize');
  githubAuthUrl.searchParams.set('client_id', GITHUB_CLIENT_ID);
  githubAuthUrl.searchParams.set('redirect_uri', `${API_BASE_URL}/auth/github/callback`);
  githubAuthUrl.searchParams.set('scope', 'user:email');
  githubAuthUrl.searchParams.set('state', state);

  res.redirect(githubAuthUrl.toString());
});

/**
 * GET /auth/github/callback
 * GitHub OAuth callback
 */
router.get('/github/callback', async (req, res) => {
  const { code, state } = req.query as { code?: string; state?: string };

  if (!code || !state) {
    return res.status(400).send('Missing code or state');
  }

  const pending = pendingStates.get(state);
  if (!pending || pending.provider !== 'github') {
    return res.status(400).send('Invalid or expired state');
  }
  pendingStates.delete(state);

  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
    if (!tokenData.access_token) {
      throw new Error(tokenData.error || 'Failed to get access token');
    }

    // Get user info from GitHub
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/json',
      },
    });

    const githubUser = await userRes.json() as {
      id: number;
      email: string | null;
      name: string | null;
      avatar_url: string;
    };

    // Get primary email if not public
    let email = githubUser.email;
    if (!email) {
      const emailsRes = await fetch('https://api.github.com/user/emails', {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Accept': 'application/json',
        },
      });
      const emails = await emailsRes.json() as Array<{ email: string; primary: boolean }>;
      email = emails.find(e => e.primary)?.email || emails[0]?.email || null;
    }

    // Find or create user
    const { userId, credits } = findOrCreateUser(
      'github',
      githubUser.id,
      email,
      githubUser.name,
      githubUser.avatar_url
    );

    // Generate API key
    const apiKey = generateApiKey(userId);

    // Redirect back to CLI
    const callbackUrl = new URL(pending.callback);
    callbackUrl.searchParams.set('api_key', apiKey);
    callbackUrl.searchParams.set('user', JSON.stringify({
      id: userId,
      email: email,
      name: githubUser.name,
      credits: credits / 100,
    }));

    res.redirect(callbackUrl.toString());

  } catch (error) {
    console.error('GitHub OAuth error:', error);
    const callbackUrl = new URL(pending.callback);
    callbackUrl.searchParams.set('error', (error as Error).message);
    res.redirect(callbackUrl.toString());
  }
});

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
    provider: 'google',
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
  if (!pending || pending.provider !== 'google') {
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
      'google',
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
    providers: [
      ...(GOOGLE_CLIENT_ID ? ['google'] : []),
      ...(GITHUB_CLIENT_ID ? ['github'] : []),
    ],
    recommended: GOOGLE_CLIENT_ID ? 'google' : 'github',
  });
});

export default router;
