import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { DONATION_URL, PRICING_INFO } from '../config.js';

const router = Router();

/**
 * GET /billing/pricing
 * Get pricing info
 */
router.get('/pricing', (req, res) => {
  res.json(PRICING_INFO);
});

/**
 * GET /billing/credits
 * Get current credits (authenticated)
 */
router.get('/credits', authMiddleware, (req, res) => {
  const user = req.user!;
  res.json({
    credits_cents: user.credits_cents,
    credits_dollars: user.credits_cents / 100,
    is_depleted: user.credits_cents <= 0,
    donation_url: DONATION_URL,
  });
});

/**
 * GET /billing/donate
 * Get donation info
 */
router.get('/donate', (req, res) => {
  res.json({
    message: 'Support LangChain MCP development! Donate $5, get $10 credits!',
    url: DONATION_URL,
    bonus: '200%',
  });
});

export default router;
