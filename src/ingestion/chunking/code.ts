import { createHash } from 'crypto';
import { CONFIG } from '../../config/constants.js';
import type { Chunk, ChunkMetadata, ChunkerConfig } from './types.js';

const DEFAULT_CONFIG: ChunkerConfig = {
  chunkSize: CONFIG.CHUNK_SIZE * 4, // Approximate chars
  chunkOverlap: CONFIG.CHUNK_OVERLAP * 4,
};

/**
 * Code chunker using line-based splitting with awareness of code structure.
 */
export class CodeChunker {
  private config: ChunkerConfig;

  constructor(config?: Partial<ChunkerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Chunk a source code file.
   */
  chunk(
    content: string,
    filePath: string,
    collection: string,
    language: 'python' | 'javascript'
  ): Chunk[] {
    const lines = content.split('\n');

    // Extract imports to prepend to chunks
    const imports = this.extractImports(lines, language);

    // Find function/class boundaries
    const boundaries = this.findBoundaries(lines, language);

    // Create chunks based on boundaries
    const textChunks = this.createChunks(lines, boundaries, imports);

    // Create chunk objects
    return textChunks.map((chunk, index) => {
      const id = this.createChunkId(filePath, collection, index);
      return {
        id,
        content: chunk.content,
        index,
        total: textChunks.length,
        metadata: {
          source: 'source_code',
          collection,
          filePath,
          language,
          codeType: chunk.codeType,
        } as ChunkMetadata,
      };
    });
  }

  /**
   * Extract import statements from the file.
   */
  private extractImports(lines: string[], language: string): string {
    const importLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      if (language === 'python') {
        if (trimmed.startsWith('import ') || trimmed.startsWith('from ')) {
          importLines.push(line);
        } else if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('"""')) {
          break;
        }
      } else {
        // TypeScript
        if (trimmed.startsWith('import ') || trimmed.startsWith('export ')) {
          importLines.push(line);
        } else if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
          break;
        }
      }
    }

    return importLines.join('\n');
  }

  /**
   * Find boundaries of functions, classes, and other code blocks.
   */
  private findBoundaries(
    lines: string[],
    language: string
  ): { start: number; end: number; codeType: ChunkMetadata['codeType'] }[] {
    const boundaries: { start: number; end: number; codeType: ChunkMetadata['codeType'] }[] = [];
    let currentBoundary: { start: number; codeType: ChunkMetadata['codeType'] } | null = null;
    let braceCount = 0;
    let indentLevel = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (language === 'python') {
        const currentIndent = line.length - line.trimStart().length;

        if (trimmed.startsWith('def ')) {
          if (currentBoundary && currentIndent <= indentLevel) {
            boundaries.push({ ...currentBoundary, end: i - 1 });
          }
          currentBoundary = { start: i, codeType: 'function' };
          indentLevel = currentIndent;
        } else if (trimmed.startsWith('class ')) {
          if (currentBoundary && currentIndent <= indentLevel) {
            boundaries.push({ ...currentBoundary, end: i - 1 });
          }
          currentBoundary = { start: i, codeType: 'class' };
          indentLevel = currentIndent;
        }
      } else {
        // TypeScript
        if (
          trimmed.match(/^(export\s+)?(async\s+)?function\s/) ||
          trimmed.match(/^(export\s+)?const\s+\w+\s*=\s*(async\s+)?\(/) ||
          trimmed.match(/^(export\s+)?const\s+\w+\s*=\s*(async\s+)?function/)
        ) {
          if (currentBoundary && braceCount === 0) {
            boundaries.push({ ...currentBoundary, end: i - 1 });
          }
          currentBoundary = { start: i, codeType: 'function' };
          braceCount = 0;
        } else if (trimmed.match(/^(export\s+)?(abstract\s+)?class\s/)) {
          if (currentBoundary && braceCount === 0) {
            boundaries.push({ ...currentBoundary, end: i - 1 });
          }
          currentBoundary = { start: i, codeType: 'class' };
          braceCount = 0;
        }

        braceCount += (line.match(/{/g) || []).length;
        braceCount -= (line.match(/}/g) || []).length;

        if (currentBoundary && braceCount === 0 && trimmed.endsWith('}')) {
          boundaries.push({ ...currentBoundary, end: i });
          currentBoundary = null;
        }
      }
    }

    if (currentBoundary) {
      boundaries.push({ ...currentBoundary, end: lines.length - 1 });
    }

    return boundaries;
  }

  /**
   * Create chunks from code boundaries.
   */
  private createChunks(
    lines: string[],
    boundaries: { start: number; end: number; codeType: ChunkMetadata['codeType'] }[],
    imports: string
  ): { content: string; codeType: ChunkMetadata['codeType'] }[] {
    const chunks: { content: string; codeType: ChunkMetadata['codeType'] }[] = [];

    if (boundaries.length === 0) {
      return this.chunkBySize(lines, imports);
    }

    let lastEnd = 0;

    for (const boundary of boundaries) {
      if (boundary.start > lastEnd) {
        const betweenLines = lines.slice(lastEnd, boundary.start);
        const betweenContent = betweenLines.join('\n').trim();
        if (betweenContent.length > 100) {
          chunks.push({
            content: imports ? `${imports}\n\n${betweenContent}` : betweenContent,
            codeType: 'module',
          });
        }
      }

      const blockLines = lines.slice(boundary.start, boundary.end + 1);
      let blockContent = blockLines.join('\n');

      if (blockContent.length > this.config.chunkSize) {
        const subChunks = this.chunkBySize(blockLines, imports);
        for (const sub of subChunks) {
          chunks.push({ ...sub, codeType: boundary.codeType });
        }
      } else {
        chunks.push({
          content: imports ? `${imports}\n\n${blockContent}` : blockContent,
          codeType: boundary.codeType,
        });
      }

      lastEnd = boundary.end + 1;
    }

    if (lastEnd < lines.length) {
      const remainingLines = lines.slice(lastEnd);
      const remainingContent = remainingLines.join('\n').trim();
      if (remainingContent.length > 100) {
        chunks.push({
          content: imports ? `${imports}\n\n${remainingContent}` : remainingContent,
          codeType: 'module',
        });
      }
    }

    return chunks;
  }

  /**
   * Chunk lines by size when no boundaries are found.
   */
  private chunkBySize(
    lines: string[],
    imports: string
  ): { content: string; codeType: ChunkMetadata['codeType'] }[] {
    const chunks: { content: string; codeType: ChunkMetadata['codeType'] }[] = [];
    let currentLines: string[] = [];
    let currentSize = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineSize = line.length + 1;

      if (currentSize + lineSize > this.config.chunkSize && currentLines.length > 0) {
        chunks.push({
          content: imports ? `${imports}\n\n${currentLines.join('\n')}` : currentLines.join('\n'),
          codeType: 'module',
        });

        const overlapLines = Math.ceil(this.config.chunkOverlap / 50);
        const overlapStart = Math.max(0, currentLines.length - overlapLines);
        currentLines = currentLines.slice(overlapStart);
        currentSize = currentLines.join('\n').length;
      }

      currentLines.push(line);
      currentSize += lineSize;
    }

    if (currentLines.length > 0) {
      chunks.push({
        content: imports ? `${imports}\n\n${currentLines.join('\n')}` : currentLines.join('\n'),
        codeType: 'module',
      });
    }

    return chunks;
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
