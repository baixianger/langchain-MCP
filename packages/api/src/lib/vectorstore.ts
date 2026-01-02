import { ChromaClient, Collection, IEmbeddingFunction } from 'chromadb';

// Types
export type RepoName =
  | 'docs'
  | 'langchain'
  | 'langchainjs'
  | 'langgraph'
  | 'langgraphjs'
  | 'deepagents'
  | 'deepagentsjs';

export const ALL_REPOS: RepoName[] = [
  'docs', 'langchain', 'langchainjs', 'langgraph', 'langgraphjs', 'deepagents', 'deepagentsjs'
];

export const CODE_REPOS: RepoName[] = [
  'langchain', 'langchainjs', 'langgraph', 'langgraphjs', 'deepagents', 'deepagentsjs'
];

export type Language = 'py' | 'js';

export interface DocumentMetadata {
  filePath: string;
  language?: Language;
  product?: string;
  topic?: string;
  codeType?: 'function' | 'class' | 'module';
}

export interface SearchResult {
  id: string;
  content: string;
  metadata: DocumentMetadata;
  distance: number;
  repo: RepoName;
}

// OpenRouter embedding function
class OpenRouterEmbeddingFunction implements IEmbeddingFunction {
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY!;
    this.model = process.env.EMBEDDING_MODEL || 'qwen/qwen3-embedding-8b';
  }

  async generate(texts: string[]): Promise<number[][]> {
    const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json() as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    return data.data
      .sort((a, b) => a.index - b.index)
      .map(item => item.embedding);
  }
}

/**
 * VectorStore with per-repo collections.
 */
export class VectorStore {
  private client: ChromaClient;
  private embeddingFunction: OpenRouterEmbeddingFunction;
  private collections: Map<RepoName, Collection> = new Map();
  private modelSuffix: string;

  constructor() {
    // CHROMA_PATH can be a URL (http://localhost:8000) or local path
    const chromaPath = process.env.CHROMA_PATH || 'http://localhost:8000';
    this.modelSuffix = (process.env.EMBEDDING_MODEL || 'qwen/qwen3-embedding-8b').replace(/\//g, '-');

    // Connect to Chroma server via HTTP
    this.client = new ChromaClient({ path: chromaPath });
    this.embeddingFunction = new OpenRouterEmbeddingFunction();

    console.log(`Connecting to ChromaDB at ${chromaPath}`);
  }

  private getCollectionName(repo: RepoName): string {
    return `${repo}_${this.modelSuffix}`;
  }

  async getCollection(repo: RepoName): Promise<Collection> {
    if (this.collections.has(repo)) {
      return this.collections.get(repo)!;
    }

    const collection = await this.client.getOrCreateCollection({
      name: this.getCollectionName(repo),
      embeddingFunction: this.embeddingFunction,
    });

    this.collections.set(repo, collection);
    return collection;
  }

  async search(
    query: string,
    options?: {
      repos?: RepoName[];
      limit?: number;
      language?: Language;
      product?: string;
      codeType?: 'function' | 'class' | 'module';
    }
  ): Promise<SearchResult[]> {
    const repos = options?.repos || ALL_REPOS;
    const limit = options?.limit || 10;
    const perRepoLimit = Math.ceil(limit / repos.length) + 2;

    const results: SearchResult[] = [];

    const searches = repos.map(async (repo) => {
      try {
        const collection = await this.getCollection(repo);

        const whereConditions: Record<string, unknown>[] = [];
        if (options?.language) {
          whereConditions.push({ language: options.language });
        }
        if (options?.product) {
          whereConditions.push({ product: options.product });
        }
        if (options?.codeType) {
          whereConditions.push({ codeType: options.codeType });
        }

        const where = whereConditions.length > 0
          ? whereConditions.length === 1
            ? whereConditions[0]
            : { $and: whereConditions }
          : undefined;

        const queryResult = await collection.query({
          queryTexts: [query],
          nResults: perRepoLimit,
          where,
        });

        return this.formatResults(queryResult, repo);
      } catch {
        return [];
      }
    });

    const allResults = await Promise.all(searches);
    for (const r of allResults) {
      results.push(...r);
    }

    return results.sort((a, b) => a.distance - b.distance).slice(0, limit);
  }

  async searchDocs(
    query: string,
    options?: { limit?: number }
  ): Promise<SearchResult[]> {
    return this.search(query, { repos: ['docs'], limit: options?.limit });
  }

  async searchLangchain(
    query: string,
    options: { limit?: number; language: Language }
  ): Promise<SearchResult[]> {
    const repo: RepoName = options.language === 'py' ? 'langchain' : 'langchainjs';
    return this.search(query, { repos: [repo], limit: options.limit });
  }

  async searchLanggraph(
    query: string,
    options: { limit?: number; language: Language }
  ): Promise<SearchResult[]> {
    const repo: RepoName = options.language === 'py' ? 'langgraph' : 'langgraphjs';
    return this.search(query, { repos: [repo], limit: options.limit });
  }

  async searchDeepagent(
    query: string,
    options: { limit?: number; language: Language }
  ): Promise<SearchResult[]> {
    const repo: RepoName = options.language === 'py' ? 'deepagents' : 'deepagentsjs';
    return this.search(query, { repos: [repo], limit: options.limit });
  }

  private formatResults(
    results: {
      ids: string[][];
      documents: (string | null)[][];
      metadatas: (Record<string, unknown> | null)[][];
      distances: number[][] | null;
    },
    repo: RepoName
  ): SearchResult[] {
    const formatted: SearchResult[] = [];

    if (!results.ids[0]) return formatted;

    for (let i = 0; i < results.ids[0].length; i++) {
      const rawMeta = results.metadatas[0]?.[i] || {};

      formatted.push({
        id: results.ids[0][i],
        content: results.documents[0]?.[i] || '',
        metadata: {
          filePath: (rawMeta.filePath as string) || '',
          language: rawMeta.language as Language | undefined,
          product: rawMeta.product as string | undefined,
          topic: rawMeta.topic as string | undefined,
          codeType: rawMeta.codeType as 'function' | 'class' | 'module' | undefined,
        },
        distance: results.distances?.[0]?.[i] || 0,
        repo,
      });
    }

    return formatted;
  }
}

// Singleton
let vectorStore: VectorStore | null = null;

export async function getVectorStore(): Promise<VectorStore> {
  if (!vectorStore) {
    vectorStore = new VectorStore();
  }
  return vectorStore;
}
