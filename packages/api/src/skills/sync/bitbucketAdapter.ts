import type { GitRepoAdapter, GitTreeEntry } from './adapter';

type FetchFn = typeof fetch;

type BitbucketTreeEntry = {
  path: string;
  type: 'commit_file' | 'commit_directory';
  size?: number;
  commit?: { hash: string };
};

type BitbucketPaginatedResponse<T> = {
  values: T[];
  next?: string;
  page?: number;
  size?: number;
};

type BitbucketCommitResponse = {
  hash: string;
};

class BitbucketAdapterError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'BitbucketAdapterError';
    this.code = code;
  }
}

async function bitbucketRequest<T>(fetchFn: FetchFn, url: string, token: string): Promise<T> {
  const response = await fetchFn(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'LibreChat-Skill-Sync',
    },
  });
  if (response.ok) {
    return (await response.json()) as T;
  }
  if (response.status === 401 || response.status === 403) {
    throw new BitbucketAdapterError(
      'BITBUCKET_AUTH_FAILED',
      `Bitbucket request failed with HTTP ${response.status}`,
    );
  }
  if (response.status === 404) {
    throw new BitbucketAdapterError(
      'BITBUCKET_NOT_FOUND',
      'Bitbucket repository, ref, or path was not found',
    );
  }
  if (response.status === 429) {
    throw new BitbucketAdapterError('BITBUCKET_RATE_LIMITED', 'Bitbucket rate limit exceeded');
  }
  throw new BitbucketAdapterError(
    'BITBUCKET_REQUEST_FAILED',
    `Bitbucket request failed with HTTP ${response.status}`,
  );
}

export type BitbucketAdapterOptions = {
  workspace: string;
  repository: string;
  token: string;
  baseUrl?: string;
  fetchFn?: FetchFn;
};

export class BitbucketRepoAdapter implements GitRepoAdapter {
  private readonly workspace: string;
  private readonly repository: string;
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchFn: FetchFn;

  constructor(options: BitbucketAdapterOptions) {
    this.workspace = options.workspace;
    this.repository = options.repository;
    this.token = options.token;
    this.baseUrl = (options.baseUrl ?? 'https://api.bitbucket.org/2.0').replace(/\/+$/, '');
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async getTreeSha(ref: string): Promise<{ commitSha: string; treeSha: string }> {
    const workspace = encodeURIComponent(this.workspace);
    const repo = encodeURIComponent(this.repository);
    const encodedRef = encodeURIComponent(ref);
    const url = `${this.baseUrl}/repositories/${workspace}/${repo}/commit/${encodedRef}`;
    const commit = await bitbucketRequest<BitbucketCommitResponse>(this.fetchFn, url, this.token);
    // Bitbucket doesn't expose tree SHAs; use commit hash as reference
    return { commitSha: commit.hash, treeSha: commit.hash };
  }

  async listTree(treeSha: string, recursive = true): Promise<GitTreeEntry[]> {
    const workspace = encodeURIComponent(this.workspace);
    const repo = encodeURIComponent(this.repository);
    const encodedRef = encodeURIComponent(treeSha);
    const maxDepth = recursive ? 10 : 1;
    let url: string | null =
      `${this.baseUrl}/repositories/${workspace}/${repo}/src/${encodedRef}/?max_depth=${maxDepth}&pagelen=100`;
    const entries: GitTreeEntry[] = [];
    while (url) {
      const page = await bitbucketRequest<BitbucketPaginatedResponse<BitbucketTreeEntry>>(
        this.fetchFn,
        url,
        this.token,
      );
      for (const entry of page.values) {
        entries.push({
          path: entry.path,
          type: entry.type === 'commit_file' ? 'blob' : 'tree',
          sha: entry.commit?.hash ?? treeSha,
          size: entry.size,
        });
      }
      url = page.next ?? null;
    }
    return entries;
  }

  async fetchBlob(sha: string): Promise<Buffer> {
    // Bitbucket fetchBlob expects a "ref:path" composite key since Bitbucket
    // doesn't support fetching blobs by SHA directly. The caller must pass
    // "commitHash:filePath" as the sha parameter.
    const separatorIndex = sha.indexOf(':');
    if (separatorIndex === -1) {
      throw new BitbucketAdapterError(
        'BITBUCKET_INVALID_BLOB_REF',
        'Bitbucket blob reference must be in "commitHash:filePath" format',
      );
    }
    const commitHash = sha.slice(0, separatorIndex);
    const filePath = sha.slice(separatorIndex + 1);
    const workspace = encodeURIComponent(this.workspace);
    const repo = encodeURIComponent(this.repository);
    const encodedRef = encodeURIComponent(commitHash);
    const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
    const url = `${this.baseUrl}/repositories/${workspace}/${repo}/src/${encodedRef}/${encodedPath}`;
    const response = await this.fetchFn(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        'User-Agent': 'LibreChat-Skill-Sync',
      },
    });
    if (!response.ok) {
      if (response.status === 404) {
        throw new BitbucketAdapterError(
          'BITBUCKET_NOT_FOUND',
          `Bitbucket file "${filePath}" was not found`,
        );
      }
      throw new BitbucketAdapterError(
        'BITBUCKET_REQUEST_FAILED',
        `Bitbucket blob fetch failed with HTTP ${response.status}`,
      );
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
