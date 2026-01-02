import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { calculateTokens, recordUsage } from '../lib/usage.js';
import { getVectorStore } from '../lib/vectorstore.js';

const router = Router();

// Schemas
const searchDocsSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(20).default(5),
});

const searchCodeSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(20).default(5),
  language: z.enum(['py', 'js']),
});

// Helper to build response
function buildResponse(
  res: import('express').Response,
  results: import('../lib/vectorstore.js').SearchResult[],
  query: string,
  userId: string
) {
  const { inputTokens, outputTokens, totalTokens } = calculateTokens(query, results);
  const { creditsRemaining, shouldRemindDonation, isBlocked, donationUrl } = recordUsage(userId, inputTokens, outputTokens);

  // Block if credits exceeded hard limit
  if (isBlocked) {
    return res.status(402).json({
      error: {
        code: 'CREDITS_EXHAUSTED',
        message: 'Your credits have been exhausted. Please donate to continue using the service.',
      },
      credits_remaining: creditsRemaining / 100,
      donation_url: donationUrl,
    });
  }

  res.json({
    results,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      credits_remaining: creditsRemaining / 100,
    },
    ...(shouldRemindDonation && {
      reminder: {
        message: '☕ Enjoying LangChain MCP? Donate $5, get $10 credits (20M tokens)!',
        donation_url: donationUrl,
      },
    }),
  });
}

// Helper to handle errors
function handleError(res: import('express').Response, error: unknown) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: error.message } });
  }
  console.error('Search error:', error);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Search failed' } });
}

/**
 * POST /search/docs
 */
router.post('/docs', authMiddleware, async (req, res) => {
  try {
    const input = searchDocsSchema.parse(req.body);
    const vectorStore = await getVectorStore();
    const results = await vectorStore.searchDocs(input.query, { limit: input.limit });
    buildResponse(res, results, input.query, req.user!.id);
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * POST /search/langchain
 */
router.post('/langchain', authMiddleware, async (req, res) => {
  try {
    const input = searchCodeSchema.parse(req.body);
    const vectorStore = await getVectorStore();
    const results = await vectorStore.searchLangchain(input.query, {
      limit: input.limit,
      language: input.language,
    });
    buildResponse(res, results, input.query, req.user!.id);
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * POST /search/langgraph
 */
router.post('/langgraph', authMiddleware, async (req, res) => {
  try {
    const input = searchCodeSchema.parse(req.body);
    const vectorStore = await getVectorStore();
    const results = await vectorStore.searchLanggraph(input.query, {
      limit: input.limit,
      language: input.language,
    });
    buildResponse(res, results, input.query, req.user!.id);
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * POST /search/deepagent
 */
router.post('/deepagent', authMiddleware, async (req, res) => {
  try {
    const input = searchCodeSchema.parse(req.body);
    const vectorStore = await getVectorStore();
    const results = await vectorStore.searchDeepagent(input.query, {
      limit: input.limit,
      language: input.language,
    });
    buildResponse(res, results, input.query, req.user!.id);
  } catch (error) {
    handleError(res, error);
  }
});

export default router;
