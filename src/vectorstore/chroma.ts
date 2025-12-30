import { ChromaClient, Collection } from 'chromadb';
import { ChromaEmbeddingFunction } from '../embeddings/index.js';
import { CONFIG } from '../config/constants.js';

/**
 * Collection names for filtering (repo-based).
 */
export type CollectionName =
  | 'docs'
  | 'langchain'
  | 'langchainjs'
  | 'langgraph'
  | 'langgraphjs'
  | 'deepagents'
  | 'deepagentsjs';

/**
 * Product names for routing.
 */
export type ProductName = 'langchain' | 'langgraph' | 'deepagents';

/**
 * Language types for routing.
 */
export type Language = 'python' | 'javascript';

/**
 * Map from repository to collection name.
 */
export const REPO_TO_COLLECTION: Record<string, CollectionName> = {
  'langchain-ai/docs': 'docs',
  'langchain-ai/langchain': 'langchain',
  'langchain-ai/langchainjs': 'langchainjs',
  'langchain-ai/langgraph': 'langgraph',
  'langchain-ai/langgraphjs': 'langgraphjs',
  'langchain-ai/deepagents': 'deepagents',
  'langchain-ai/deepagentsjs': 'deepagentsjs',
};

/**
 * Route product + language to the correct collection.
 * @param product - The product name (langchain, langgraph, deepagents)
 * @param language - The language (python or javascript)
 * @returns The collection name
 */
export function routeToCollection(product: ProductName, language: Language): CollectionName {
  if (language === 'javascript') {
    return `${product}js` as CollectionName;
  }
  return product;
}

export interface DocumentMetadata {
  /** Source type: documentation or source_code */
  source: 'documentation' | 'source_code';

  /** Collection for filtering (product-based) */
  collection: CollectionName;

  /** File path within the repository */
  filePath: string;

  /** Programming language (python or javascript) */
  language?: Language;

  /** Product area extracted from path: langsmith, langchain, langgraph, deepagents */
  product?: string;

  /** Topic extracted from filename: quickstart, memory, streaming, agents, etc. */
  topic?: string;

  /** Code block type (for code only) */
  codeType?: 'function' | 'class' | 'module';
}

export interface SearchResult {
  id: string;
  content: string;
  metadata: DocumentMetadata;
  distance: number;
}

/**
 * ChromaDB vector store client for storing and searching document embeddings.
 */
export class VectorStore {
  private client: ChromaClient;
  private embeddingFunction: ChromaEmbeddingFunction;
  private docsCollection: Collection | null = null;
  private codeCollection: Collection | null = null;

  /**
   * Get the underlying ChromaDB client (for index tracking).
   */
  getClient(): ChromaClient {
    return this.client;
  }

  constructor() {
    // Cloud takes priority if configured
    if (CONFIG.CHROMA_CLOUD_API_KEY && CONFIG.CHROMA_CLOUD_TENANT) {
      this.client = new ChromaClient({
        path: `https://${CONFIG.CHROMA_CLOUD_HOST || 'api.trychroma.com'}`,
        tenant: CONFIG.CHROMA_CLOUD_TENANT,
        database: CONFIG.CHROMA_CLOUD_DATABASE || 'default_database',
        auth: { provider: 'token', credentials: CONFIG.CHROMA_CLOUD_API_KEY },
      });
      console.log('Using Chroma Cloud');
    } else if (CONFIG.CHROMA_URL) {
      // Local server
      this.client = new ChromaClient({
        path: CONFIG.CHROMA_URL,
      });
      console.log(`Using local ChromaDB at ${CONFIG.CHROMA_URL}`);
    } else {
      throw new Error('ChromaDB not configured. Set CHROMA_URL for local or CHROMA_CLOUD_* for cloud.');
    }
    this.embeddingFunction = new ChromaEmbeddingFunction();
  }

  /**
   * Initialize collections. Must be called before any operations.
   */
  async initialize(): Promise<void> {
    // Create or get the documentation collection
    this.docsCollection = await this.client.getOrCreateCollection({
      name: 'langchain_documentation',
      metadata: {
        description: 'LangChain documentation chunks',
        'hnsw:space': 'cosine',
      },
      embeddingFunction: this.embeddingFunction,
    });

    // Create or get the source code collection
    this.codeCollection = await this.client.getOrCreateCollection({
      name: 'langchain_source_code',
      metadata: {
        description: 'LangChain source code chunks',
        'hnsw:space': 'cosine',
      },
      embeddingFunction: this.embeddingFunction,
    });
  }

  /**
   * Add documents to the appropriate collection.
   */
  async addDocuments(
    documents: { id: string; content: string; metadata: DocumentMetadata }[],
    collection: 'docs' | 'code'
  ): Promise<void> {
    const col = collection === 'docs' ? this.docsCollection : this.codeCollection;
    if (!col) throw new Error('Collection not initialized');

    if (documents.length === 0) return;

    await col.add({
      ids: documents.map((d) => d.id),
      documents: documents.map((d) => d.content),
      metadatas: documents.map((d) => {
        const meta: Record<string, string | number | boolean> = {
          source: d.metadata.source,
          collection: d.metadata.collection,
          filePath: d.metadata.filePath,
        };
        if (d.metadata.language) meta.language = d.metadata.language;
        if (d.metadata.product) meta.product = d.metadata.product;
        if (d.metadata.topic) meta.topic = d.metadata.topic;
        if (d.metadata.codeType) meta.codeType = d.metadata.codeType;
        return meta;
      }),
    });
  }

  /**
   * Search for similar documents in the documentation collection.
   */
  async searchDocs(
    query: string,
    options?: {
      limit?: number;
      product?: string;
      language?: Language;
      collections?: CollectionName[];
    }
  ): Promise<SearchResult[]> {
    if (!this.docsCollection) throw new Error('Collection not initialized');

    const whereConditions: Record<string, unknown>[] = [];

    if (options?.product) {
      whereConditions.push({ product: options.product });
    }

    if (options?.language) {
      whereConditions.push({ language: options.language });
    }

    if (options?.collections && options.collections.length > 0) {
      if (options.collections.length === 1) {
        whereConditions.push({ collection: options.collections[0] });
      } else {
        whereConditions.push({ collection: { $in: options.collections } });
      }
    }

    const where = whereConditions.length > 0
      ? whereConditions.length === 1
        ? whereConditions[0]
        : { $and: whereConditions }
      : undefined;

    const results = await this.docsCollection.query({
      queryTexts: [query],
      nResults: options?.limit || 5,
      where,
    });

    return this.formatResults(results);
  }

  /**
   * Search for similar documents in the source code collection.
   */
  async searchCode(
    query: string,
    options?: {
      limit?: number;
      language?: Language;
      codeType?: 'function' | 'class' | 'module';
      collections?: CollectionName[];
    }
  ): Promise<SearchResult[]> {
    if (!this.codeCollection) throw new Error('Collection not initialized');

    const whereConditions: Record<string, unknown>[] = [];

    if (options?.language) {
      whereConditions.push({ language: options.language });
    }
    if (options?.codeType) {
      whereConditions.push({ codeType: options.codeType });
    }
    if (options?.collections && options.collections.length > 0) {
      if (options.collections.length === 1) {
        whereConditions.push({ collection: options.collections[0] });
      } else {
        whereConditions.push({ collection: { $in: options.collections } });
      }
    }

    const where = whereConditions.length > 0
      ? whereConditions.length === 1
        ? whereConditions[0]
        : { $and: whereConditions }
      : undefined;

    const results = await this.codeCollection.query({
      queryTexts: [query],
      nResults: options?.limit || 5,
      where,
    });

    return this.formatResults(results);
  }

  /**
   * Search across both collections.
   */
  async searchAll(
    query: string,
    options?: {
      limit?: number;
      includeDocs?: boolean;
      includeCode?: boolean;
      collections?: CollectionName[];
    }
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const limit = options?.limit || 10;
    const includeDocs = options?.includeDocs ?? true;
    const includeCode = options?.includeCode ?? true;

    const promises: Promise<SearchResult[]>[] = [];

    if (includeDocs) {
      promises.push(this.searchDocs(query, { limit, collections: options?.collections }));
    }
    if (includeCode) {
      promises.push(this.searchCode(query, { limit, collections: options?.collections }));
    }

    const allResults = await Promise.all(promises);
    for (const r of allResults) {
      results.push(...r);
    }

    // Sort by distance and limit
    return results
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);
  }

  /**
   * Delete documents by IDs.
   */
  async deleteDocuments(ids: string[], collection: 'docs' | 'code'): Promise<void> {
    const col = collection === 'docs' ? this.docsCollection : this.codeCollection;
    if (!col) throw new Error('Collection not initialized');

    await col.delete({ ids });
  }

  /**
   * Get collection statistics.
   */
  async getStats(): Promise<{ docs: number; code: number }> {
    const docsCount = this.docsCollection ? await this.docsCollection.count() : 0;
    const codeCount = this.codeCollection ? await this.codeCollection.count() : 0;
    return { docs: docsCount, code: codeCount };
  }

  /**
   * Clear all documents from both collections.
   */
  async clear(): Promise<void> {
    if (this.docsCollection) {
      await this.client.deleteCollection({ name: 'langchain_documentation' });
    }
    if (this.codeCollection) {
      await this.client.deleteCollection({ name: 'langchain_source_code' });
    }
    await this.initialize();
  }

  private formatResults(results: {
    ids: string[][];
    documents: (string | null)[][];
    metadatas: (Record<string, unknown> | null)[][];
    distances: number[][] | null;
  }): SearchResult[] {
    const formatted: SearchResult[] = [];

    if (!results.ids[0]) return formatted;

    for (let i = 0; i < results.ids[0].length; i++) {
      const rawMeta = results.metadatas[0]?.[i] || {};

      const metadata: DocumentMetadata = {
        source: (rawMeta.source as 'documentation' | 'source_code') || 'source_code',
        collection: (rawMeta.collection as CollectionName) || 'docs',
        filePath: (rawMeta.filePath as string) || '',
        language: rawMeta.language as DocumentMetadata['language'],
        product: rawMeta.product as string | undefined,
        topic: rawMeta.topic as string | undefined,
        codeType: rawMeta.codeType as DocumentMetadata['codeType'],
      };

      formatted.push({
        id: results.ids[0][i],
        content: results.documents[0]?.[i] || '',
        metadata,
        distance: results.distances?.[0]?.[i] || 0,
      });
    }

    return formatted;
  }
}

// Singleton instance
let vectorStore: VectorStore | null = null;

export async function getVectorStore(): Promise<VectorStore> {
  if (!vectorStore) {
    vectorStore = new VectorStore();
    await vectorStore.initialize();
  }
  return vectorStore;
}
