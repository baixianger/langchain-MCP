import { CONFIG, type RepoConfig } from '../config/constants.js';
import { getGitHubFetcher, type GitHubFile } from './code/github.js';
import { chunkFile, isDocumentation } from './chunking/strategies.js';
import { getVectorStore, type DocumentMetadata } from '../vectorstore/chroma.js';
import { getRecorder, type Recorder } from './recorder.js';

export interface IngestionOptions {
  /** Specific repositories to process (default: all) */
  repositories?: string[];
  /** Dry run - don't actually store anything */
  dryRun?: boolean;
  /** Force re-ingestion even if file hasn't changed */
  force?: boolean;
  /** Skip orphan cleanup (default: false - orphans are cleaned automatically) */
  skipOrphanCleanup?: boolean;
}

export interface IngestionResult {
  processed: number;
  chunks: number;
  failed: number;
  skipped: number;
  updated: number;
  orphansRemoved: number;
  errors: { file: string; error: string }[];
}

/**
 * Orchestrates the ingestion of documentation and source code.
 */
export class IngestionOrchestrator {
  private fetcher = getGitHubFetcher();
  private recorder: Recorder | null = null;

  /**
   * Run the full ingestion pipeline.
   */
  async run(options: IngestionOptions = {}): Promise<IngestionResult> {
    const result: IngestionResult = {
      processed: 0,
      chunks: 0,
      failed: 0,
      skipped: 0,
      updated: 0,
      orphansRemoved: 0,
      errors: [],
    };

    // Initialize recorder
    const vectorStore = await getVectorStore();
    this.recorder = await getRecorder(vectorStore.getClient());

    // Determine which repos to process
    const repos = this.getReposToProcess(options.repositories);

    console.log(`Processing ${repos.length} repositories...`);
    if (options.force) {
      console.log('Force mode: re-ingesting all files');
    }

    for (const repo of repos) {
      console.log(`\n--- Processing ${repo.owner}/${repo.repo} ---`);

      try {
        const repoResult = await this.processRepository(repo, options);
        result.processed += repoResult.processed;
        result.chunks += repoResult.chunks;
        result.failed += repoResult.failed;
        result.skipped += repoResult.skipped;
        result.updated += repoResult.updated;
        result.orphansRemoved += repoResult.orphansRemoved;
        result.errors.push(...repoResult.errors);
      } catch (error) {
        console.error(`Failed to process ${repo.owner}/${repo.repo}:`, error);
        result.errors.push({
          file: `${repo.owner}/${repo.repo}`,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log('\n=== Ingestion Complete ===');
    console.log(`Files processed: ${result.processed}`);
    console.log(`Files skipped (unchanged): ${result.skipped}`);
    console.log(`Files updated: ${result.updated}`);
    console.log(`Chunks created: ${result.chunks}`);
    console.log(`Orphans removed: ${result.orphansRemoved}`);
    console.log(`Failed: ${result.failed}`);

    // Show first few errors for debugging
    if (result.errors.length > 0) {
      console.log('\nFirst 5 errors:');
      result.errors.slice(0, 5).forEach((e) => console.log(`  ${e.file}: ${e.error}`));
    }

    return result;
  }

  /**
   * Process a single repository.
   */
  private async processRepository(
    repoConfig: RepoConfig | typeof CONFIG.DOCS_REPO,
    options: IngestionOptions
  ): Promise<IngestionResult> {
    const result: IngestionResult = {
      processed: 0,
      chunks: 0,
      failed: 0,
      skipped: 0,
      updated: 0,
      orphansRemoved: 0,
      errors: [],
    };

    // Fetch filtered files from GitHub
    const files = await this.fetcher.fetchFilteredFiles(repoConfig);
    const collection = repoConfig.collection;

    // Track current file paths for orphan detection
    const currentFilePaths = files.map((f) => f.path);

    // Process each file
    for (const file of files) {
      try {
        const fileResult = await this.processFile(file, repoConfig, options);

        if (fileResult.action === 'skip') {
          result.skipped++;
        } else if (fileResult.action === 'update') {
          result.updated++;
          result.chunks += fileResult.chunkCount;
        } else {
          result.processed++;
          result.chunks += fileResult.chunkCount;
        }
      } catch (error) {
        result.failed++;
        result.errors.push({
          file: `${repoConfig.owner}/${repoConfig.repo}:${file.path}`,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Clean up orphaned files (automatic unless skipped)
    if (!options.skipOrphanCleanup && this.recorder) {
      try {
        const orphans = await this.recorder.findOrphanedFiles(collection, currentFilePaths);
        const vectorStore = await getVectorStore();

        for (const orphan of orphans) {
          const isDoc = isDocumentation(orphan.filePath);
          const collectionType = isDoc ? 'docs' : 'code';

          // Delete chunks from vector store
          if (orphan.chunkIds.length > 0) {
            await vectorStore.deleteDocuments(orphan.chunkIds, collectionType);
          }

          // Remove from recorder
          await this.recorder.removeFile(collection, orphan.filePath);
          result.orphansRemoved++;

          console.log(`  Removed orphan: ${orphan.filePath}`);
        }
      } catch (error) {
        console.error('Failed to clean orphans:', error);
      }
    }

    return result;
  }

  /**
   * Process a single file: chunk it and store in vector DB.
   * Uses index tracking for incremental updates.
   */
  private async processFile(
    file: GitHubFile,
    repoConfig: RepoConfig | typeof CONFIG.DOCS_REPO,
    options: IngestionOptions
  ): Promise<{ action: 'skip' | 'update' | 'new'; chunkCount: number }> {
    const vectorStore = await getVectorStore();
    const isDoc = isDocumentation(file.path);
    const language = 'language' in repoConfig ? repoConfig.language : undefined;
    const collection = file.collection;

    // Compute SHA for change detection
    const sha = this.recorder!.computeSha(file.content);

    // Check if file needs processing (unless force mode)
    if (!options.force && this.recorder) {
      const { action, existingChunkIds } = await this.recorder.checkFile(
        collection,
        file.path,
        sha
      );

      if (action === 'skip') {
        // File unchanged, skip processing
        return { action: 'skip', chunkCount: 0 };
      }

      if (action === 'update' && existingChunkIds && existingChunkIds.length > 0) {
        // File changed, delete old chunks first
        const collectionType = isDoc ? 'docs' : 'code';
        if (!options.dryRun) {
          await vectorStore.deleteDocuments(existingChunkIds, collectionType);
        }
      }
    }

    // Chunk the file
    const chunks = chunkFile(file.content, file.path, collection, language);

    if (chunks.length === 0) {
      return { action: 'new', chunkCount: 0 };
    }

    // Prepare documents for vector store
    const documents = chunks.map((chunk) => ({
      id: chunk.id,
      content: chunk.content,
      metadata: {
        source: chunk.metadata.source,
        collection: chunk.metadata.collection,
        filePath: chunk.metadata.filePath,
        language: chunk.metadata.language,
        product: chunk.metadata.product,
        topic: chunk.metadata.topic,
        codeType: chunk.metadata.codeType,
      } as DocumentMetadata,
    }));

    // Store in vector DB
    if (!options.dryRun) {
      const collectionType = isDoc ? 'docs' : 'code';
      await vectorStore.addDocuments(documents, collectionType);

      // Update recorder
      if (this.recorder) {
        const chunkIds = chunks.map((c) => c.id);
        await this.recorder.markProcessed(collection, file.path, sha, chunkIds);
      }
    }

    // Determine action for logging
    const action = options.force ? 'new' : 'new';
    console.log(`  ${file.path} (${chunks.length} chunks)`);

    return { action, chunkCount: chunks.length };
  }

  /**
   * Get the list of repositories to process.
   */
  private getReposToProcess(
    filter?: string[]
  ): (RepoConfig | typeof CONFIG.DOCS_REPO)[] {
    const allRepos = [CONFIG.DOCS_REPO, ...CONFIG.CODE_REPOS];

    if (!filter || filter.length === 0) {
      return allRepos;
    }

    return allRepos.filter((r) => {
      const fullName = `${r.owner}/${r.repo}`;
      return filter.some((f) =>
        fullName.includes(f) || r.repo.includes(f) || r.collection === f
      );
    });
  }
}

/**
 * Run ingestion with the given options.
 */
export async function runIngestion(options: IngestionOptions = {}): Promise<IngestionResult> {
  const orchestrator = new IngestionOrchestrator();
  return orchestrator.run(options);
}
