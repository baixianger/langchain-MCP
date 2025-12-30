import { createHash } from 'crypto';
import { ChromaClient, Collection, IncludeEnum } from 'chromadb';
import { CONFIG } from '../config/constants.js';

/**
 * Recorded file entry stored in ChromaDB.
 */
export interface RecordedFile {
  filePath: string;
  collection: string;
  sha: string;
  chunkCount: number;
  chunkIds: string[];
  lastUpdated: string;
}

/**
 * Result of checking if a file needs processing.
 */
export type ProcessAction = 'skip' | 'update' | 'new';

/**
 * Recorder using ChromaDB metadata to track processed files.
 * Enables incremental ingestion by storing file SHA and chunk mappings.
 */
export class Recorder {
  private client: ChromaClient;
  private recordCollection: Collection | null = null;

  constructor(client: ChromaClient) {
    this.client = client;
  }

  /**
   * Initialize the recorder collection.
   */
  async initialize(): Promise<void> {
    this.recordCollection = await this.client.getOrCreateCollection({
      name: 'file_records',
      metadata: {
        description: 'Records processed files with SHA and chunk mappings',
      },
    });
  }

  /**
   * Generate a deterministic ID for a file in a collection.
   */
  private generateFileId(collection: string, filePath: string): string {
    return createHash('sha256')
      .update(`${collection}:${filePath}`)
      .digest('hex')
      .substring(0, 32);
  }

  /**
   * Compute SHA256 hash of file content.
   */
  computeSha(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Check if a file needs processing based on its SHA.
   * @returns 'skip' if unchanged, 'update' if changed, 'new' if not indexed
   */
  async checkFile(
    collection: string,
    filePath: string,
    currentSha: string
  ): Promise<{ action: ProcessAction; existingChunkIds?: string[] }> {
    if (!this.recordCollection) {
      throw new Error('Recorder not initialized');
    }

    const fileId = this.generateFileId(collection, filePath);

    try {
      const result = await this.recordCollection.get({
        ids: [fileId],
        include: [IncludeEnum.Metadatas],
      });

      if (result.ids.length === 0 || !result.metadatas?.[0]) {
        return { action: 'new' };
      }

      const metadata = result.metadatas[0] as Record<string, unknown>;
      const storedSha = metadata.sha as string;
      const chunkIdsJson = metadata.chunkIds as string;

      if (storedSha === currentSha) {
        return { action: 'skip' };
      }

      // SHA changed, need to update
      const existingChunkIds = chunkIdsJson ? JSON.parse(chunkIdsJson) : [];
      return { action: 'update', existingChunkIds };
    } catch {
      // If get fails, treat as new
      return { action: 'new' };
    }
  }

  /**
   * Mark a file as processed and store its chunk mappings.
   */
  async markProcessed(
    collection: string,
    filePath: string,
    sha: string,
    chunkIds: string[]
  ): Promise<void> {
    if (!this.recordCollection) {
      throw new Error('Index collection not initialized');
    }

    const fileId = this.generateFileId(collection, filePath);

    // Upsert the file index entry
    await this.recordCollection.upsert({
      ids: [fileId],
      documents: [filePath], // Store file path as document for searchability
      metadatas: [
        {
          filePath,
          collection,
          sha,
          chunkCount: chunkIds.length,
          chunkIds: JSON.stringify(chunkIds),
          lastUpdated: new Date().toISOString(),
        },
      ],
    });
  }

  /**
   * Remove a file from the index.
   */
  async removeFile(collection: string, filePath: string): Promise<string[]> {
    if (!this.recordCollection) {
      throw new Error('Index collection not initialized');
    }

    const fileId = this.generateFileId(collection, filePath);

    try {
      // Get existing chunk IDs before removing
      const result = await this.recordCollection.get({
        ids: [fileId],
        include: [IncludeEnum.Metadatas],
      });

      let chunkIds: string[] = [];
      if (result.metadatas?.[0]) {
        const metadata = result.metadatas[0] as Record<string, unknown>;
        const chunkIdsJson = metadata.chunkIds as string;
        chunkIds = chunkIdsJson ? JSON.parse(chunkIdsJson) : [];
      }

      // Remove from index
      await this.recordCollection.delete({ ids: [fileId] });

      return chunkIds;
    } catch {
      return [];
    }
  }

  /**
   * Get all indexed files for a collection.
   */
  async getIndexedFiles(collection: string): Promise<RecordedFile[]> {
    if (!this.recordCollection) {
      throw new Error('Index collection not initialized');
    }

    const result = await this.recordCollection.get({
      where: { collection },
      include: [IncludeEnum.Metadatas],
    });

    return (result.metadatas || []).map((meta) => {
      const m = meta as Record<string, unknown>;
      return {
        filePath: m.filePath as string,
        collection: m.collection as string,
        sha: m.sha as string,
        chunkCount: m.chunkCount as number,
        chunkIds: JSON.parse(m.chunkIds as string),
        lastUpdated: m.lastUpdated as string,
      };
    });
  }

  /**
   * Find orphaned files (indexed but no longer in source).
   */
  async findOrphanedFiles(
    collection: string,
    currentFilePaths: string[]
  ): Promise<RecordedFile[]> {
    const indexed = await this.getIndexedFiles(collection);
    const currentSet = new Set(currentFilePaths);

    return indexed.filter((entry) => !currentSet.has(entry.filePath));
  }

  /**
   * Get index statistics.
   */
  async getStats(): Promise<{ totalFiles: number; byCollection: Record<string, number> }> {
    if (!this.recordCollection) {
      throw new Error('Index collection not initialized');
    }

    const totalFiles = await this.recordCollection.count();

    // Get counts by collection
    const byCollection: Record<string, number> = {};
    const collections = ['docs', 'langchain', 'langchainjs', 'langgraph', 'langgraphjs', 'deepagents', 'deepagentsjs'];

    for (const col of collections) {
      try {
        const result = await this.recordCollection.get({
          where: { collection: col },
        });
        byCollection[col] = result.ids.length;
      } catch {
        byCollection[col] = 0;
      }
    }

    return { totalFiles, byCollection };
  }

  /**
   * Clear all index entries for a collection.
   */
  async clearCollection(collection: string): Promise<number> {
    if (!this.recordCollection) {
      throw new Error('Index collection not initialized');
    }

    const indexed = await this.getIndexedFiles(collection);
    if (indexed.length === 0) return 0;

    const ids = indexed.map((entry) =>
      this.generateFileId(entry.collection, entry.filePath)
    );

    await this.recordCollection.delete({ ids });
    return indexed.length;
  }

  /**
   * Clear all index entries.
   */
  async clearAll(): Promise<void> {
    await this.client.deleteCollection({ name: 'file_records' });
    await this.initialize();
  }
}

// Singleton instance
let recorder: Recorder | null = null;

export async function getRecorder(client: ChromaClient): Promise<Recorder> {
  if (!recorder) {
    recorder = new Recorder(client);
    await recorder.initialize();
  }
  return recorder;
}
