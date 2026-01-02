import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getUsageStats } from '../lib/usage.js';

const router = Router();

/**
 * GET /usage
 * Get usage stats for current user
 */
router.get('/', authMiddleware, (req, res) => {
  const user = req.user!;

  try {
    const stats = getUsageStats(user.id);

    res.json({
      user_id: user.id,
      email: user.email,
      ...stats,
    });
  } catch (error) {
    console.error('Usage error:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get usage' } });
  }
});

export default router;
