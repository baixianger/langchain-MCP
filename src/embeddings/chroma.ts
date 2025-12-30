/**
 * ChromaDB embedding providers factory.
 * Supports all ChromaDB integrations: https://docs.trychroma.com/integrations/embedding-models
 */

import { CONFIG } from '../config/constants.js';

/**
 * ChromaDB embedding function interface.
 */
export interface ChromaEmbedder {
  generate(texts: string[]): Promise<number[][]>;
}

/**
 * Create ChromaDB embedding function based on config.
 */
export async function createEmbeddingFunction(): Promise<ChromaEmbedder> {
  const provider = CONFIG.EMBEDDING_PROVIDER;

  switch (provider) {
    case 'default': {
      const { DefaultEmbeddingFunction } = await import('@chroma-core/default-embed');
      return new DefaultEmbeddingFunction();
    }

    case 'sentence-transformer': {
      // @ts-ignore - Optional dependency
      const { SentenceTransformersEmbeddingFunction } = await import('@chroma-core/sentence-transformer');
      return new SentenceTransformersEmbeddingFunction({
        model: CONFIG.EMBEDDING_MODEL || 'all-MiniLM-L6-v2',
      });
    }

    case 'openai': {
      // @ts-ignore - Optional dependency
      const { OpenAIEmbeddingFunction } = await import('@chroma-core/openai');
      if (!CONFIG.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is required for openai provider');
      }
      return new OpenAIEmbeddingFunction({
        openai_api_key: CONFIG.OPENAI_API_KEY,
        openai_model: CONFIG.EMBEDDING_MODEL || 'text-embedding-3-small',
      });
    }

    case 'jina': {
      // @ts-ignore - Optional dependency
      const { JinaEmbeddingFunction } = await import('@chroma-core/jina');
      if (!CONFIG.JINA_API_KEY) {
        throw new Error('JINA_API_KEY is required for jina provider');
      }
      return new JinaEmbeddingFunction({
        jinaai_api_key: CONFIG.JINA_API_KEY,
        model: CONFIG.EMBEDDING_MODEL || 'jina-embeddings-v3',
      });
    }

    case 'openrouter': {
      const { OpenRouterEmbeddingFunction } = await import('./openrouter.js');
      return new OpenRouterEmbeddingFunction();
    }

    default:
      throw new Error(`Unknown embedding provider: ${provider}`);
  }
}

/**
 * Lazy-loaded embedding function wrapper.
 * Delays initialization until first use.
 */
export class ChromaEmbeddingFunction implements ChromaEmbedder {
  private embedder: ChromaEmbedder | null = null;

  private async getEmbedder(): Promise<ChromaEmbedder> {
    if (!this.embedder) {
      this.embedder = await createEmbeddingFunction();
    }
    return this.embedder;
  }

  async generate(texts: string[]): Promise<number[][]> {
    const embedder = await this.getEmbedder();
    return embedder.generate(texts);
  }
}
