import { extname } from 'path';
import { DocChunker } from './docs.js';
import { CodeChunker } from './code.js';
import type { Chunk } from './types.js';

export type { Chunk, ChunkMetadata, ChunkerConfig } from './types.js';

/**
 * Select and apply the appropriate chunking strategy based on file type.
 */
export function chunkFile(
  content: string,
  filePath: string,
  collection: string,
  language?: 'python' | 'javascript'
): Chunk[] {
  const ext = extname(filePath).toLowerCase();

  // Documentation files
  if (ext === '.md' || ext === '.mdx') {
    const chunker = new DocChunker();
    // Extract language from path for docs (e.g., src/oss/javascript/** or src/oss/python/**)
    const docLanguage = extractLanguageFromPath(filePath);
    return chunker.chunk(content, filePath, collection, docLanguage);
  }

  // Python files
  if (ext === '.py') {
    const chunker = new CodeChunker();
    return chunker.chunk(content, filePath, collection, 'python');
  }

  // TypeScript/JavaScript files
  if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
    const chunker = new CodeChunker();
    return chunker.chunk(content, filePath, collection, language || 'javascript');
  }

  // Fallback: treat as plain text with doc chunker
  const chunker = new DocChunker();
  return chunker.chunk(content, filePath, collection);
}

/**
 * Extract language from file path.
 * Examples:
 *   src/oss/javascript/** -> 'javascript'
 *   src/oss/python/** -> 'python'
 *   langchainjs repo -> 'javascript'
 *   langchain repo -> 'python'
 */
function extractLanguageFromPath(filePath: string): 'python' | 'javascript' | undefined {
  const lowerPath = filePath.toLowerCase();

  // Check for explicit language folders in docs
  if (lowerPath.includes('/javascript/') || lowerPath.includes('/js/')) {
    return 'javascript';
  }
  if (lowerPath.includes('/python/') || lowerPath.includes('/py/')) {
    return 'python';
  }

  // Check for JS-specific repo patterns
  if (lowerPath.includes('langchainjs') || lowerPath.includes('langgraphjs') || lowerPath.includes('deepagentsjs')) {
    return 'javascript';
  }

  return undefined;
}

/**
 * Determine if a file should be treated as documentation.
 */
export function isDocumentation(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return ext === '.md' || ext === '.mdx';
}

/**
 * Determine if a file should be treated as source code.
 */
export function isSourceCode(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return ['.py', '.ts', '.tsx', '.js', '.jsx'].includes(ext);
}
