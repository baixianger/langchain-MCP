import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getDatabase } from '../db/index.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  credits_cents: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * API Key auth middleware.
 * Verifies API key and attaches user to request.
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;

  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Missing Authorization header' }
    });
  }

  const apiKey = auth.slice(7);

  // Validate API key format
  if (!apiKey.startsWith('lc_') || apiKey.length !== 51) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Invalid API key format' }
    });
  }

  try {
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const db = getDatabase();

    // Find API key and join with user
    const result = db.prepare(`
      SELECT u.id, u.email, u.name, u.credits_cents, ak.id as key_id
      FROM api_keys ak
      JOIN users u ON u.id = ak.user_id
      WHERE ak.key_hash = ?
    `).get(keyHash) as {
      id: string;
      email: string;
      name: string;
      credits_cents: number;
      key_id: string;
    } | undefined;

    if (!result) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Invalid API key' }
      });
    }

    // Update last_used_at
    db.prepare(`UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?`).run(result.key_id);

    req.user = {
      id: result.id,
      email: result.email,
      name: result.name,
      credits_cents: result.credits_cents,
    };

    next();
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Authentication failed' }
    });
  }
}
