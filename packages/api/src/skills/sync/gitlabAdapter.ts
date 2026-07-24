import type { GitRepoAdapter, GitTreeEntry } from './adapter';

type FetchFn = typeof fetch;

type GitLabTreeEntry = {
  id: string;
  name: string;
  type: 'blob' | 'tree';
  path: string;
  mode: string;
};

type GitLabCommitResponse = {
  id: string;
  parent_ids: string[];
};

class GitLabAdapterError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'GitLabAdapterError';
    this.code = code;
  }
}

async function gitlabRequest<T>(fetchFn: FetchFn, url: string, token: string): Promise<T> {
  const response = await fetchFn(url, {
    headers: {
      'Private-Token': token,
      'User-Agent': 'LibreChat-Skill-Sync',
    },
  });
  if (response.ok) {
    return (await response.json()) as T;
  }
  if (response.status === 401 || response.status === 403) {
    throw new GitLabAdapterError(
      'GITLAB_AUTH_FAILED',
      `GitLab request failed with HTTP ${response.status}`,
    );
  }
  if (response.status === 404) {
    throw new GitLabAdapterError('GITLAB_NOT_FOUND', 'GitLab project, ref, or path was not found');
  }
  if (response.status === 429) {
    throw new GitLabAdapterError('GITLAB_RATE_LIMITED', 'GitLab rate limit exceeded');
  }
  throw new GitLabAdapterError(
    'GITLAB_REQUEST_FAILED',
    `GitLab request failed with HTTP ${response.status}`,
  );
}

async function gitlabPaginatedGet<T>(fetchFn: FetchFn, url: string, token: string): Promise<T[]> {
  const results: T[] = [];
  let nextUrl: string | null = url;
  while (nextUrl) {
    const response = await fetchFn(nextUrl, {
      headers: {
        'Private-Token': token,
        'User-Agent': 'LibreChat-Skill-Sync',
      },
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new GitLabAdapterError(
          'GITLAB_AUTH_FAILED',
          `GitLab request failed with HTTP ${response.status}`,
        );
      }
      if (response.status === 404) {
        throw new GitLabAdapterError(
          'GITLAB_NOT_FOUND',
          'GitLab project, ref, or path was not found',
        );
      }
      throw new GitLabAdapterError(
        'GITLAB_REQUEST_FAILED',
        `GitLab request failed with HTTP ${response.status}`,
      );
    }
    const page = (await response.json()) as T[];
    results.push(...page);
    const linkHeader = response.headers.get('link');
    nextUrl = null;
    if (linkHeader) {
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) {
        nextUrl = nextMatch[1];
      }
    }
  }
  return results;
}

export type GitLabAdapterOptions = {
  projectId: string;
  token: string;
  baseUrl?: string;
  fetchFn?: FetchFn;
};

export class GitLabRepoAdapter implements GitRepoAdapter {
  private readonly projectId: string;
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchFn: FetchFn;

  constructor(options: GitLabAdapterOptions) {
    this.projectId = options.projectId;
    this.token = options.token;
    this.baseUrl = (options.baseUrl ?? 'https://gitlab.com').replace(/\/+$/, '');
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async getTreeSha(ref: string): Promise<{ commitSha: string; treeSha: string }> {
    const projectId = encodeURIComponent(this.projectId);
    const encodedRef = encodeURIComponent(ref);
    const url = `${this.baseUrl}/api/v4/projects/${projectId}/repository/commits/${encodedRef}`;
    const commit = await gitlabRequest<GitLabCommitResponse>(this.fetchFn, url, this.token);
    // GitLab doesn't expose tree SHAs separately; use commit ID as tree reference
    return { commitSha: commit.id, treeSha: commit.id };
  }

  async listTree(treeSha: string, recursive = true): Promise<GitTreeEntry[]> {
    const projectId = encodeURIComponent(this.projectId);
    const encodedRef = encodeURIComponent(treeSha);
    const recursiveParam = recursive ? '&recursive=true' : '';
    const url = `${this.baseUrl}/api/v4/projects/${projectId}/repository/tree?ref=${encodedRef}&per_page=100${recursiveParam}`;
    const entries = await gitlabPaginatedGet<GitLabTreeEntry>(this.fetchFn, url, this.token);
    return entries.map((entry) => ({
      path: entry.path,
      type: entry.type,
      sha: entry.id,
      size: undefined,
    }));
  }

  async fetchBlob(sha: string): Promise<Buffer> {
    const projectId = encodeURIComponent(this.projectId);
    const encodedSha = encodeURIComponent(sha);
    const url = `${this.baseUrl}/api/v4/projects/${projectId}/repository/blobs/${encodedSha}/raw`;
    const response = await this.fetchFn(url, {
      headers: {
        'Private-Token': this.token,
        'User-Agent': 'LibreChat-Skill-Sync',
      },
    });
    if (!response.ok) {
      if (response.status === 404) {
        throw new GitLabAdapterError('GITLAB_NOT_FOUND', `GitLab blob "${sha}" was not found`);
      }
      throw new GitLabAdapterError(
        'GITLAB_REQUEST_FAILED',
        `GitLab blob fetch failed with HTTP ${response.status}`,
      );
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
