import type { GitRepoAdapter, GitTreeEntry } from './adapter';

type FetchFn = typeof fetch;

type GitHubTreeEntry = {
  path: string;
  mode: string;
  type: 'blob' | 'tree' | 'commit';
  sha: string;
  size?: number;
  url: string;
};

type GitHubTreeResponse = {
  sha: string;
  tree: GitHubTreeEntry[];
  truncated: boolean;
};

type GitHubBlobResponse = {
  sha: string;
  content: string;
  encoding: string;
  size: number;
};

type GitHubCommitResponse = {
  sha: string;
  commit: { tree: { sha: string } };
};

class GitHubAdapterError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'GitHubAdapterError';
    this.code = code;
  }
}

function buildHeaders(token: string): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'LibreChat-Skill-Sync',
  };
}

async function readErrorMessage(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === 'string' ? body.message : undefined;
  } catch {
    return undefined;
  }
}

function isRateLimited(params: {
  status: number;
  remaining: string | null;
  retryAfter: string | null;
  message?: string;
}): boolean {
  if (params.status === 429 || params.remaining === '0' || params.retryAfter) {
    return true;
  }
  const msg = params.message?.toLowerCase() ?? '';
  return msg.includes('rate limit') || msg.includes('abuse detection');
}

async function githubRequest<T>(fetchFn: FetchFn, url: string, token: string): Promise<T> {
  const response = await fetchFn(url, { headers: buildHeaders(token) });
  if (response.ok) {
    return (await response.json()) as T;
  }
  const remaining = response.headers.get('x-ratelimit-remaining');
  const retryAfter = response.headers.get('retry-after');
  const message = await readErrorMessage(response);
  if (response.status === 401 || response.status === 403 || response.status === 429) {
    const code = isRateLimited({ status: response.status, remaining, retryAfter, message })
      ? 'GITHUB_RATE_LIMITED'
      : 'GITHUB_AUTH_FAILED';
    throw new GitHubAdapterError(code, `GitHub request failed with HTTP ${response.status}`);
  }
  if (response.status === 404) {
    throw new GitHubAdapterError(
      'GITHUB_NOT_FOUND',
      'GitHub repository, ref, or path was not found',
    );
  }
  throw new GitHubAdapterError(
    'GITHUB_REQUEST_FAILED',
    `GitHub request failed with HTTP ${response.status}`,
  );
}

export type GitHubAdapterOptions = {
  owner: string;
  repo: string;
  token: string;
  baseUrl?: string;
  fetchFn?: FetchFn;
};

export class GitHubRepoAdapter implements GitRepoAdapter {
  private readonly owner: string;
  private readonly repo: string;
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchFn: FetchFn;

  constructor(options: GitHubAdapterOptions) {
    this.owner = options.owner;
    this.repo = options.repo;
    this.token = options.token;
    this.baseUrl = options.baseUrl ?? 'https://api.github.com';
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async getTreeSha(ref: string): Promise<{ commitSha: string; treeSha: string }> {
    const owner = encodeURIComponent(this.owner);
    const repo = encodeURIComponent(this.repo);
    const encodedRef = ref.split('/').map(encodeURIComponent).join('/');
    const url = `${this.baseUrl}/repos/${owner}/${repo}/commits/${encodedRef}`;
    const commit = await githubRequest<GitHubCommitResponse>(this.fetchFn, url, this.token);
    return { commitSha: commit.sha, treeSha: commit.commit.tree.sha };
  }

  async listTree(treeSha: string, recursive = true): Promise<GitTreeEntry[]> {
    const owner = encodeURIComponent(this.owner);
    const repo = encodeURIComponent(this.repo);
    const sha = encodeURIComponent(treeSha);
    const suffix = recursive ? '?recursive=1' : '';
    const url = `${this.baseUrl}/repos/${owner}/${repo}/git/trees/${sha}${suffix}`;
    const tree = await githubRequest<GitHubTreeResponse>(this.fetchFn, url, this.token);
    if (tree.truncated) {
      throw new GitHubAdapterError('GITHUB_TREE_TRUNCATED', 'GitHub tree response was truncated');
    }
    return tree.tree
      .filter((entry) => entry.type === 'blob' || entry.type === 'tree')
      .map((entry) => ({
        path: entry.path,
        type: entry.type as 'blob' | 'tree',
        sha: entry.sha,
        size: entry.size,
      }));
  }

  async fetchBlob(sha: string): Promise<Buffer> {
    const owner = encodeURIComponent(this.owner);
    const repo = encodeURIComponent(this.repo);
    const encodedSha = encodeURIComponent(sha);
    const url = `${this.baseUrl}/repos/${owner}/${repo}/git/blobs/${encodedSha}`;
    const blob = await githubRequest<GitHubBlobResponse>(this.fetchFn, url, this.token);
    if (blob.encoding !== 'base64') {
      throw new GitHubAdapterError(
        'GITHUB_UNSUPPORTED_BLOB',
        `Unsupported GitHub blob encoding "${blob.encoding}"`,
      );
    }
    return Buffer.from(blob.content.replace(/\s/g, ''), 'base64');
  }
}
