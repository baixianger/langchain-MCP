import { config } from 'dotenv';
config();

/**
 * Embedding providers.
 * ChromaDB integrations: https://docs.trychroma.com/integrations/embedding-models
 * OpenRouter: https://openrouter.ai/docs/features/embeddings
 */
export type EmbeddingProvider =
  | 'default'            // @chroma-core/default-embed (all-MiniLM-L6-v2)
  | 'sentence-transformer' // @chroma-core/sentence-transformer
  | 'openai'             // @chroma-core/openai
  | 'cohere'             // @chroma-core/cohere
  | 'jina'               // @chroma-core/jina
  | 'voyageai'           // @chroma-core/voyageai
  | 'ollama'             // @chroma-core/ollama
  | 'google-genai'       // @chroma-core/google-genai
  | 'huggingface'        // @chroma-core/huggingface
  | 'openrouter';        // OpenRouter API

export const CONFIG = {
  // Embedding provider (see EmbeddingProvider type)
  EMBEDDING_PROVIDER: (process.env.EMBEDDING_PROVIDER || 'openrouter') as EmbeddingProvider,

  // Provider-specific config
  EMBEDDING_MODEL: process.env.EMBEDDING_MODEL || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  COHERE_API_KEY: process.env.COHERE_API_KEY || '',
  JINA_API_KEY: process.env.JINA_API_KEY || '',
  VOYAGEAI_API_KEY: process.env.VOYAGEAI_API_KEY || '',
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',
  HUGGINGFACE_API_KEY: process.env.HUGGINGFACE_API_KEY || '',
  OLLAMA_URL: process.env.OLLAMA_URL || 'http://localhost:11434',

  // OpenRouter config
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || 'qwen/qwen3-embedding-8b',

  // Chunking
  CHUNK_SIZE: 1500,
  CHUNK_OVERLAP: 150,

  // GitHub
  GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',

  // ChromaDB - Local server
  CHROMA_URL: process.env.CHROMA_URL || '',

  // ChromaDB - Cloud
  CHROMA_CLOUD_HOST: process.env.CHROMA_CLOUD_HOST || '',
  CHROMA_CLOUD_TENANT: process.env.CHROMA_CLOUD_TENANT || '',
  CHROMA_CLOUD_DATABASE: process.env.CHROMA_CLOUD_DATABASE || '',
  CHROMA_CLOUD_API_KEY: process.env.CHROMA_CLOUD_API_KEY || '',

  // Documentation repo
  DOCS_REPO: {
    owner: 'langchain-ai',
    repo: 'docs',
    branch: 'main',
    collection: 'docs' as const,
    includePaths: [
      'src/langsmith/**',      // LangSmith documentation
      'src/oss/langchain/**',  // LangChain documentation
      'src/oss/langgraph/**',  // LangGraph documentation
      'src/oss/deepagents/**', // DeepAgents documentation
      'src/oss/concepts/**',   // Core concepts
      'src/oss/integrations/**', // Integration guides
      'src/oss/javascript/**', // JS-specific docs
      'src/oss/python/**',     // Python-specific docs
      'src/oss/contributing/**', // Contributing guides
      'src/oss/*.mdx',         // Top-level OSS docs
      'src/*.mdx',             // Top-level docs (index, academy)
    ],
    excludePaths: [
      '**/images/**',          // Image assets
      '**/snippets/**',        // Code snippet partials
      '**/preview/**',         // Preview/WIP content
      '**/errors/**',          // Error reference pages
    ],
  },

  // Code repos - each repo has its own collection
  CODE_REPOS: [
    // LangChain Python
    {
      owner: 'langchain-ai',
      repo: 'langchain',
      branch: 'master',
      collection: 'langchain' as const,
      language: 'python' as const,
      includePaths: [
        'libs/core/langchain_core/**',      // Core library
        'libs/langchain/langchain/**',       // Main langchain package (if exists)
        'libs/text-splitters/**',            // Text splitters
      ],
      excludePaths: [
        '**/tests/**',
        '**/__pycache__/**',
        '**/scripts/**',
        '**/langchain_v1/**',                // Legacy version
        '**/standard-tests/**',
      ],
    },
    // LangChain JavaScript
    {
      owner: 'langchain-ai',
      repo: 'langchainjs',
      branch: 'main',
      collection: 'langchainjs' as const,
      language: 'javascript' as const,
      includePaths: [
        'libs/langchain-core/src/**',        // Core library
        'libs/langchain/src/**',             // Main package
        'libs/langchain-community/src/**',   // Community integrations
        'libs/langchain-textsplitters/src/**',
        'examples/**',
      ],
      excludePaths: [
        '**/dist/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/internal/**',
        '**/langchain-classic/**',
        '**/langchain-standard-tests/**',
      ],
    },
    // LangGraph Python
    {
      owner: 'langchain-ai',
      repo: 'langgraph',
      branch: 'main',
      collection: 'langgraph' as const,
      language: 'python' as const,
      includePaths: [
        'libs/langgraph/langgraph/**',       // Main langgraph package
        'libs/prebuilt/**',                  // Prebuilt components
        'libs/checkpoint/**',                // Checkpointing
        'docs/**',
        'examples/**',
      ],
      excludePaths: [
        '**/tests/**',
        '**/__pycache__/**',
        '**/bench/**',
        '**/sdk-py/**',                      // SDK (separate from core)
        '**/sdk-js/**',
        '**/checkpoint-postgres/**',
        '**/checkpoint-sqlite/**',
      ],
    },
    // LangGraph JavaScript
    {
      owner: 'langchain-ai',
      repo: 'langgraphjs',
      branch: 'main',
      collection: 'langgraphjs' as const,
      language: 'javascript' as const,
      includePaths: [
        'libs/*/src/**',                     // All lib packages
        'docs/**',
        'examples/**',
      ],
      excludePaths: [
        '**/dist/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/internal/**',
        '**/scripts/**',
      ],
    },
    // DeepAgents Python
    {
      owner: 'langchain-ai',
      repo: 'deepagents',
      branch: 'main',
      collection: 'deepagents' as const,
      language: 'python' as const,
      includePaths: [
        'libs/deepagents/**',                // Main deepagents package
        'libs/acp/**',                       // ACP package
        'libs/harbor/**',                    // Harbor package
      ],
      excludePaths: [
        '**/tests/**',
        '**/__pycache__/**',
        '**/deepagents-cli/**',              // CLI tool
      ],
    },
    // DeepAgents JavaScript
    {
      owner: 'langchain-ai',
      repo: 'deepagentsjs',
      branch: 'main',
      collection: 'deepagentsjs' as const,
      language: 'javascript' as const,
      includePaths: [
        'src/**',
        'examples/**',
      ],
      excludePaths: [
        '**/dist/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/tests/**',
      ],
    },
  ],

  // Global excludes
  EXCLUDED_PATHS: [
    '**/dist/**', '**/build/**', '**/node_modules/**', '**/__pycache__/**',
    '**/tests/**', '**/test/**', '**/__tests__/**',
    '**/*.test.ts', '**/*.spec.ts', '**/test_*.py',
    '**/.github/**', '**/.vscode/**',
    '**/*.lock', '**/*.json', '**/*.yaml', '**/*.yml',
    '**/*.png', '**/*.jpg', '**/*.gif', '**/*.svg',
  ],

  CODE_EXTENSIONS: ['.py', '.ts', '.tsx', '.js', '.jsx'],
  DOC_EXTENSIONS: ['.md', '.mdx'],
} as const;

export type RepoConfig = (typeof CONFIG.CODE_REPOS)[number];
export type DocsRepoConfig = typeof CONFIG.DOCS_REPO;
export type CollectionName = RepoConfig['collection'] | DocsRepoConfig['collection'];
