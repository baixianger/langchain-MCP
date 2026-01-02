import { Router } from 'express';
import { getDatabase } from '../db/index.js';
import { KOFI_VERIFICATION_TOKEN, CREDITS_MULTIPLIER } from '../config.js';

const router = Router();

/**
 * POST /webhook/kofi
 * Ko-fi donation webhook
 *
 * Ko-fi sends: content-type: application/x-www-form-urlencoded
 * Body: data=<JSON string>
 */
router.post('/kofi', (req, res) => {
  try {
    // Ko-fi sends data as URL-encoded form with 'data' field containing JSON
    const dataString = req.body.data;
    if (!dataString) {
      console.error('Ko-fi webhook: Missing data field');
      return res.status(400).json({ error: 'Missing data' });
    }

    const data = JSON.parse(dataString) as {
      verification_token: string;
      message_id: string;
      timestamp: string;
      type: 'Donation' | 'Subscription' | 'Commission' | 'Shop Order';
      is_public: boolean;
      from_name: string;
      message: string | null;
      amount: string;  // e.g., "5.00"
      url: string;
      email: string;
      currency: string;
      is_subscription_payment: boolean;
      is_first_subscription_payment: boolean;
      kofi_transaction_id: string;
      shop_items: Array<{ direct_link_code: string }> | null;
      tier_name: string | null;
      shipping: unknown | null;
    };

    // Verify the token
    if (KOFI_VERIFICATION_TOKEN && data.verification_token !== KOFI_VERIFICATION_TOKEN) {
      console.error('Ko-fi webhook: Invalid verification token');
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Only process donations and subscriptions
    if (data.type !== 'Donation' && data.type !== 'Subscription') {
      console.log(`Ko-fi webhook: Ignoring type ${data.type}`);
      return res.status(200).json({ success: true, message: 'Ignored' });
    }

    const db = getDatabase();
    const email = data.email.toLowerCase();
    const donationAmount = parseFloat(data.amount);

    // Calculate credits: 200% of donation amount
    // $5.00 donation → $10.00 credits → 1000 cents
    const creditsCents = Math.round(donationAmount * 100 * CREDITS_MULTIPLIER);

    // Find user by email
    const user = db.prepare('SELECT id, credits_cents FROM users WHERE LOWER(email) = ?').get(email) as {
      id: string;
      credits_cents: number;
    } | undefined;

    if (!user) {
      console.log(`Ko-fi webhook: User not found for email ${email} (from: ${data.from_name})`);
      // Still return 200 to acknowledge receipt
      return res.status(200).json({
        success: false,
        message: 'User not found. Please donate with the same email as your account.'
      });
    }

    // Add credits
    db.prepare("UPDATE users SET credits_cents = credits_cents + ?, updated_at = datetime('now') WHERE id = ?")
      .run(creditsCents, user.id);

    const newBalance = user.credits_cents + creditsCents;

    console.log(`Ko-fi webhook: ${data.from_name} donated $${data.amount} → Added $${(creditsCents / 100).toFixed(2)} credits to ${email}`);

    res.status(200).json({
      success: true,
      donation: donationAmount,
      credits_added: creditsCents / 100,
      new_balance: newBalance / 100,
    });

  } catch (error) {
    console.error('Ko-fi webhook error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * GET /webhook/kofi
 * Health check for Ko-fi webhook
 */
router.get('/kofi', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Ko-fi webhook endpoint',
    credits_multiplier: `${CREDITS_MULTIPLIER * 100}%`,
  });
});

export default router;
