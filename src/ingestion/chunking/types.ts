export interface Chunk {
  /** Unique chunk ID */
  id: string;

  /** The text content of this chunk */
  content: string;

  /** Index of this chunk within the source file */
  index: number;

  /** Total number of chunks from the source file */
  total: number;

  /** Metadata about the chunk */
  metadata: ChunkMetadata;
}

export interface ChunkMetadata {
  /** Source type */
  source: 'documentation' | 'source_code';

  /** Collection name (from repo config) */
  collection: string;

  /** Source file path */
  filePath: string;

  /** Programming language (python or javascript) */
  language?: 'python' | 'javascript';

  /** Product area extracted from path: langsmith, langchain, langgraph, deepagents */
  product?: string;

  /** Topic extracted from filename */
  topic?: string;

  /** Code block type (for code only) */
  codeType?: 'function' | 'class' | 'module';
}

export interface ChunkerConfig {
  /** Target chunk size in characters (approximate) */
  chunkSize: number;

  /** Overlap between chunks in characters */
  chunkOverlap: number;
}
