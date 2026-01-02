import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

const GITHUB_SPONSORS_URL = 'https://github.com/sponsors/baixianger';

/**
 * GET /billing/pricing
 * Get pricing info
 */
router.get('/pricing', (req, res) => {
  res.json({
    model: 'free_with_donation',
    free_credits: 500, // $5.00 = 500 cents
    token_rate: '1000 tokens = $0.01',
    estimated_searches_per_dollar: 30,
    donation_url: GITHUB_SPONSORS_URL,
  });
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
    donation_url: GITHUB_SPONSORS_URL,
  });
});

/**
 * GET /billing/donate
 * Get donation link
 */
router.get('/donate', (req, res) => {
  res.json({
    message: 'Support LangChain MCP development!',
    url: GITHUB_SPONSORS_URL,
  });
});

export default router;
