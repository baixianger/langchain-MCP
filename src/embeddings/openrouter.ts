/**
 * OpenRouter API embedding provider.
 * https://openrouter.ai/docs/features/embeddings
 */

import { CONFIG } from '../config/constants.js';
import type { ChromaEmbedder } from './chroma.js';

/**
 * OpenRouter embedding provider.
 * Wraps OpenRouter API to match ChromaDB's embedding function interface.
 */
export class OpenRouterEmbeddingFunction implements ChromaEmbedder {
  private apiKey: string;
  private model: string;
  private baseUrl = 'https://openrouter.ai/api/v1';

  constructor() {
    this.apiKey = CONFIG.OPENROUTER_API_KEY;
    this.model = CONFIG.OPENROUTER_MODEL;

    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY is required for openrouter provider');
    }
  }

  async generate(texts: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/langchain-mcp',
        'X-Title': 'LangChain RAG MCP Server',
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
    };
    const sorted = data.data.sort((a, b) => a.index - b.index);
    return sorted.map((item) => item.embedding);
  }
}
