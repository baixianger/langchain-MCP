/**
 * Global configuration for pricing, billing, and credits
 */

// Donation platform
export const DONATION_URL = 'https://ko-fi.com/baixianger';

// Credit system
export const INITIAL_CREDITS_CENTS = 500;     // $5.00 free credits for new users
export const HARD_LIMIT_CENTS = -200;         // -$2.00 (block at this point)
export const REMINDER_THRESHOLD = 0.05;       // Show reminder at 5% remaining

// Token pricing: $0.0005 per 1K tokens
// 20,000 tokens = 1 cent = $0.01
export const TOKENS_PER_CENT = 20000;

// Donation bonus
export const CREDITS_MULTIPLIER = 2;          // 200% bonus (donate $5, get $10)

// Ko-fi webhook verification
export const KOFI_VERIFICATION_TOKEN = process.env.KOFI_VERIFICATION_TOKEN || '';

// Pricing display info
export const PRICING_INFO = {
  model: 'free_with_donation',
  free_credits: INITIAL_CREDITS_CENTS,        // In cents
  token_rate: `${TOKENS_PER_CENT.toLocaleString()} tokens = $0.01 ($0.0005/1K)`,
  estimated_searches_per_dollar: 400,
  bonus: `Donate $5, get $${5 * CREDITS_MULTIPLIER} credits (${CREDITS_MULTIPLIER * 100}%)`,
  donation_url: DONATION_URL,
};
