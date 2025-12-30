import { Octokit } from '@octokit/rest';
import AdmZip from 'adm-zip';
import { createHash } from 'crypto';
import { minimatch } from 'minimatch';
import { CONFIG, type RepoConfig, type DocsRepoConfig, type CollectionName } from '../../config/constants.js';

export interface GitHubFile {
  path: string;
  content: string;
  sha: string;
  collection: CollectionName;
}

export interface RepoInfo {
  owner: string;
  repo: string;
  branch: string;
  defaultBranch: string;
}

/**
 * GitHub repository fetcher for downloading and filtering files.
 */
export class GitHubFetcher {
  private octokit: Octokit;

  constructor(token?: string) {
    const authToken = token || CONFIG.GITHUB_TOKEN || '';
    // Only use token if it looks valid (not a placeholder)
    const isValidToken = authToken && !authToken.includes('your_') && authToken.length > 20;
    this.octokit = new Octokit({
      auth: isValidToken ? authToken : undefined,
    });
  }

  /**
   * Get repository information.
   */
  async getRepoInfo(owner: string, repo: string): Promise<RepoInfo> {
    const { data } = await this.octokit.repos.get({ owner, repo });
    return {
      owner,
      repo,
      branch: data.default_branch,
      defaultBranch: data.default_branch,
    };
  }

  /**
   * Download and extract a repository as a zip archive.
   * Returns a map of file paths to their contents.
   */
  async downloadRepo(
    owner: string,
    repo: string,
    branch: string
  ): Promise<Map<string, string>> {
    const response = await this.octokit.repos.downloadZipballArchive({
      owner,
      repo,
      ref: branch,
    });

    // Response data is an ArrayBuffer
    const data = response.data as ArrayBuffer;
    const buffer = Buffer.from(data);
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();

    const files = new Map<string, string>();

    for (const entry of entries) {
      if (entry.isDirectory) continue;

      // The zip contains a top-level directory with a random name
      // Remove it from the path
      const parts = entry.entryName.split('/');
      if (parts.length < 2) continue;

      const relativePath = parts.slice(1).join('/');
      if (!relativePath) continue;

      try {
        const content = entry.getData().toString('utf-8');
        files.set(relativePath, content);
      } catch {
        // Skip binary files that can't be decoded as UTF-8
        continue;
      }
    }

    return files;
  }

  /**
   * Download and filter files from a repository based on include/exclude patterns.
   */
  async fetchFilteredFiles(config: RepoConfig | DocsRepoConfig): Promise<GitHubFile[]> {
    const { owner, repo, branch, includePaths, excludePaths, collection } = config;
    const repository = `${owner}/${repo}`;

    console.log(`Downloading ${repository}@${branch}...`);
    const allFiles = await this.downloadRepo(owner, repo, branch);
    console.log(`Downloaded ${allFiles.size} files from ${repository}`);

    const filteredFiles: GitHubFile[] = [];

    // Combine global excludes with repo-specific excludes
    const allExcludes = [...CONFIG.EXCLUDED_PATHS, ...(excludePaths || [])];

    for (const [path, content] of allFiles) {
      // Check if file matches include patterns
      const matchesInclude = includePaths.some((pattern) =>
        minimatch(path, pattern, { matchBase: true })
      );
      if (!matchesInclude) continue;

      // Check if file matches any exclude patterns (global + repo-specific)
      const matchesExclude = allExcludes.some((pattern) =>
        minimatch(path, pattern, { matchBase: true })
      );
      if (matchesExclude) continue;

      // Check file extension
      const ext = this.getExtension(path);
      const isCode = (CONFIG.CODE_EXTENSIONS as readonly string[]).includes(ext);
      const isDoc = (CONFIG.DOC_EXTENSIONS as readonly string[]).includes(ext);

      if (!isCode && !isDoc) continue;

      filteredFiles.push({
        path,
        content,
        sha: this.createSha(content),
        collection,
      });
    }

    console.log(`Filtered to ${filteredFiles.length} relevant files from ${repository}`);
    return filteredFiles;
  }

  /**
   * Get file tree from repository using GitHub API (without downloading).
   * Useful for checking what files exist without downloading content.
   */
  async getFileTree(
    owner: string,
    repo: string,
    branch: string
  ): Promise<string[]> {
    const { data } = await this.octokit.git.getTree({
      owner,
      repo,
      tree_sha: branch,
      recursive: 'true',
    });

    return data.tree
      .filter((item) => item.type === 'blob' && item.path)
      .map((item) => item.path as string);
  }

  private getExtension(path: string): string {
    const lastDot = path.lastIndexOf('.');
    return lastDot === -1 ? '' : path.substring(lastDot);
  }

  private createSha(content: string): string {
    return createHash('sha256').update(content).digest('hex').substring(0, 16);
  }
}

// Singleton instance
let fetcher: GitHubFetcher | null = null;

export function getGitHubFetcher(): GitHubFetcher {
  if (!fetcher) {
    fetcher = new GitHubFetcher();
  }
  return fetcher;
}
