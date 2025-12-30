import { createHash } from 'crypto';
import matter from 'gray-matter';
import { CONFIG } from '../../config/constants.js';
import type { Chunk, ChunkMetadata, ChunkerConfig } from './types.js';

const DEFAULT_CONFIG: ChunkerConfig = {
  chunkSize: CONFIG.CHUNK_SIZE * 4, // Approximate chars (assuming ~4 chars per token)
  chunkOverlap: CONFIG.CHUNK_OVERLAP * 4,
};

// Separators in order of preference (higher priority first)
const SEPARATORS = [
  '\n## ', // H2 headers
  '\n### ', // H3 headers
  '\n#### ', // H4 headers
  '\n\n', // Paragraphs
  '\n', // Lines
  '. ', // Sentences
  ' ', // Words
];

/**
 * Document chunker using recursive text splitting by headers and paragraphs.
 */
export class DocChunker {
  private config: ChunkerConfig;

  constructor(config?: Partial<ChunkerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Chunk a markdown/mdx document.
   */
  chunk(
    content: string,
    filePath: string,
    collection: string,
    language?: 'python' | 'javascript'
  ): Chunk[] {
    // Parse frontmatter
    const { content: body } = matter(content);

    // Extract product and topic from path
    const { product, topic } = this.extractFromPath(filePath);

    // Split the content
    const textChunks = this.recursiveSplit(body, SEPARATORS, this.config.chunkSize);

    // Create chunk objects
    return textChunks.map((text, index) => {
      const id = this.createChunkId(filePath, collection, index);
      return {
        id,
        content: text,
        index,
        total: textChunks.length,
        metadata: {
          source: 'documentation',
          collection,
          filePath,
          language,
          product,
          topic,
        } as ChunkMetadata,
      };
    });
  }

  /**
   * Extract product and topic from file path.
   * Examples:
   *   src/langsmith/evaluation-quickstart.mdx -> { product: 'langsmith', topic: 'evaluation-quickstart' }
   *   src/oss/langchain/memory.mdx -> { product: 'langchain', topic: 'memory' }
   *   src/oss/langgraph/quickstart.mdx -> { product: 'langgraph', topic: 'quickstart' }
   */
  private extractFromPath(filePath: string): { product?: string; topic?: string } {
    const parts = filePath.split('/');
    const fileName = parts[parts.length - 1];
    const topic = fileName.replace(/\.(md|mdx)$/, '');

    // Find product from path
    let product: string | undefined;

    // Check for direct product folders
    const productPatterns = ['langsmith', 'langchain', 'langgraph', 'deepagents'];
    for (const p of productPatterns) {
      if (filePath.includes(`/${p}/`) || filePath.includes(`/oss/${p}`)) {
        product = p;
        break;
      }
    }

    // If in oss but not a specific product, use 'oss'
    if (!product && filePath.includes('/oss/')) {
      product = 'oss';
    }

    return { product, topic };
  }

  /**
   * Recursively split text using separators.
   */
  private recursiveSplit(text: string, separators: string[], chunkSize: number): string[] {
    if (text.length <= chunkSize) {
      return [text.trim()].filter((t) => t.length > 0);
    }

    // Find the first separator that exists in the text
    let separator = '';
    for (const sep of separators) {
      if (text.includes(sep)) {
        separator = sep;
        break;
      }
    }

    // If no separator found, split by character
    if (!separator) {
      return this.splitBySize(text, chunkSize);
    }

    // Split by the separator
    const parts = text.split(separator);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const part of parts) {
      const potentialChunk = currentChunk ? currentChunk + separator + part : part;

      if (potentialChunk.length <= chunkSize) {
        currentChunk = potentialChunk;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }

        if (part.length > chunkSize) {
          const subSeparators = separators.slice(separators.indexOf(separator) + 1);
          const subChunks = this.recursiveSplit(part, subSeparators, chunkSize);
          chunks.push(...subChunks);
          currentChunk = '';
        } else {
          currentChunk = part;
        }
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return this.addOverlap(chunks);
  }

  /**
   * Split text by size when no separator works.
   */
  private splitBySize(text: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      let end = Math.min(start + chunkSize, text.length);

      if (end < text.length) {
        const lastSpace = text.lastIndexOf(' ', end);
        if (lastSpace > start) {
          end = lastSpace;
        }
      }

      chunks.push(text.substring(start, end).trim());
      start = end;
    }

    return chunks.filter((c) => c.length > 0);
  }

  /**
   * Add overlap between consecutive chunks.
   */
  private addOverlap(chunks: string[]): string[] {
    if (chunks.length <= 1 || this.config.chunkOverlap === 0) {
      return chunks;
    }

    const overlappedChunks: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      let chunk = chunks[i];

      if (i > 0) {
        const prevChunk = chunks[i - 1];
        const overlapText = prevChunk.slice(-this.config.chunkOverlap);
        const overlapPoint = overlapText.indexOf(' ');
        if (overlapPoint !== -1) {
          chunk = overlapText.slice(overlapPoint + 1) + ' ' + chunk;
        }
      }

      overlappedChunks.push(chunk);
    }

    return overlappedChunks;
  }

  /**
   * Create a unique chunk ID.
   */
  private createChunkId(filePath: string, collection: string, index: number): string {
    return createHash('sha256')
      .update(`${collection}:${filePath}:${index}`)
      .digest('hex')
      .substring(0, 16);
  }
}
