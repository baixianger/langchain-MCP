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
  product: z.enum(['langsmith', 'langchain', 'langgraph', 'deepagents', 'oss']).optional(),
  language: z.enum(['python', 'javascript']).optional(),
});

const searchCodeSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(20).default(5),
  product: z.enum(['langchain', 'langgraph', 'deepagents']).optional(),
  language: z.enum(['python', 'javascript']).optional(),
  code_type: z.enum(['function', 'class', 'module']).optional(),
});

const searchHybridSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(20).default(10),
  include_docs: z.boolean().default(true),
  include_code: z.boolean().default(true),
});

/**
 * POST /search/docs
 */
router.post('/docs', authMiddleware, async (req, res) => {
  try {
    const input = searchDocsSchema.parse(req.body);
    const user = req.user!;

    const vectorStore = await getVectorStore();
    const results = await vectorStore.searchDocs(input.query, {
      limit: input.limit,
      product: input.product,
      language: input.language,
    });

    const { inputTokens, outputTokens, totalTokens } = calculateTokens(input.query, results);
    const { creditsRemaining, shouldRemindDonation, donationUrl } = recordUsage(user.id, inputTokens, outputTokens);

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
          message: '☕ Enjoying LangChain MCP? Consider supporting the project!',
          donation_url: donationUrl,
        },
      }),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: error.message } });
    }
    console.error('Search error:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Search failed' } });
  }
});

/**
 * POST /search/code
 */
router.post('/code', authMiddleware, async (req, res) => {
  try {
    const input = searchCodeSchema.parse(req.body);
    const user = req.user!;

    const vectorStore = await getVectorStore();
    const results = await vectorStore.searchCode(input.query, {
      limit: input.limit,
      language: input.language,
      codeType: input.code_type,
    });

    const { inputTokens, outputTokens, totalTokens } = calculateTokens(input.query, results);
    const { creditsRemaining, shouldRemindDonation, donationUrl } = recordUsage(user.id, inputTokens, outputTokens);

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
          message: '☕ Enjoying LangChain MCP? Consider supporting the project!',
          donation_url: donationUrl,
        },
      }),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: error.message } });
    }
    console.error('Search error:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Search failed' } });
  }
});

/**
 * POST /search/hybrid
 */
router.post('/hybrid', authMiddleware, async (req, res) => {
  try {
    const input = searchHybridSchema.parse(req.body);
    const user = req.user!;

    const vectorStore = await getVectorStore();
    const results = await vectorStore.search(input.query, {
      limit: input.limit,
      repos: input.include_docs && input.include_code
        ? undefined
        : input.include_docs
          ? ['docs']
          : ['langchain', 'langchainjs', 'langgraph', 'langgraphjs', 'deepagents', 'deepagentsjs'],
    });

    const { inputTokens, outputTokens, totalTokens } = calculateTokens(input.query, results);
    const { creditsRemaining, shouldRemindDonation, donationUrl } = recordUsage(user.id, inputTokens, outputTokens);

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
          message: '☕ Enjoying LangChain MCP? Consider supporting the project!',
          donation_url: donationUrl,
        },
      }),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: error.message } });
    }
    console.error('Search error:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Search failed' } });
  }
});

export default router;
