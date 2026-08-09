import type {
  FetchFileContentParams,
  FetchTreeParams,
  GitRepoAdapter,
  RepoCommit,
  RepoTreeEntry,
} from './types';
import { RepoAdapterError } from './types';

const GITHUB_API_BASE = 'https://api.github.com';

export const GITHUB_FINE_GRAINED_TOKEN_RECOMMENDATION =
  'Use a GitHub fine-grained personal access token scoped to the selected repository with read-only Contents and Metadata permissions.';

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
  commit: {
    tree: {
      sha: string;
    };
  };
};

export type GitHubRepoAdapterConfig = {
  owner: string;
  repo: string;
  token: string;
  fetchFn: FetchFn;
};

function normalizeRepoPath(value: string): string {
  const trimmed = value.trim().replace(/^\/+|\/+$/g, '');
  return trimmed === '.' ? '' : trimmed;
}

function buildGitHubHeaders(token: string): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'LibreChat-Skill-Sync',
  };
}

function buildGitHubUrl(pathname: string): string {
  return `${GITHUB_API_BASE}${pathname}`;
}

function encodeGitHubPath(value: string): string {
  return value.split('/').map(encodeURIComponent).join('/');
}

async function readGitHubErrorMessage(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === 'string' ? body.message : undefined;
  } catch {
    return undefined;
  }
}

function isGitHubRateLimitResponse(params: {
  status: number;
  remaining: string | null;
  retryAfter: string | null;
  message?: string;
}): boolean {
  if (params.status === 429 || params.remaining === '0' || params.retryAfter) {
    return true;
  }
  const message = params.message?.toLowerCase() ?? '';
  return message.includes('rate limit') || message.includes('abuse detection');
}

async function githubJson<T>(params: {
  fetchFn: FetchFn;
  token: string;
  pathname: string;
}): Promise<T> {
  const response = await params.fetchFn(buildGitHubUrl(params.pathname), {
    headers: buildGitHubHeaders(params.token),
  });
  if (response.ok) {
    return (await response.json()) as T;
  }
  const remaining = response.headers.get('x-ratelimit-remaining');
  const retryAfter = response.headers.get('retry-after');
  const message = await readGitHubErrorMessage(response);
  if (response.status === 401 || response.status === 403 || response.status === 429) {
    const code = isGitHubRateLimitResponse({
      status: response.status,
      remaining,
      retryAfter,
      message,
    })
      ? 'GITHUB_RATE_LIMITED'
      : 'GITHUB_AUTH_FAILED';
    throw new RepoAdapterError(code, `GitHub request failed with HTTP ${response.status}`);
  }
  if (response.status === 404) {
    throw new RepoAdapterError('GITHUB_NOT_FOUND', 'GitHub repository, ref, or path was not found');
  }
  throw new RepoAdapterError(
    'GITHUB_REQUEST_FAILED',
    `GitHub request failed with HTTP ${response.status}`,
  );
}

async function fetchTree(params: {
  fetchFn: FetchFn;
  token: string;
  owner: string;
  repo: string;
  treeSha: string;
  recursive?: boolean;
}): Promise<GitHubTreeResponse> {
  const owner = encodeURIComponent(params.owner);
  const repo = encodeURIComponent(params.repo);
  const treeSha = encodeURIComponent(params.treeSha);
  const recursive = params.recursive ?? true;
  return githubJson<GitHubTreeResponse>({
    fetchFn: params.fetchFn,
    token: params.token,
    pathname: `/repos/${owner}/${repo}/git/trees/${treeSha}${recursive ? '?recursive=1' : ''}`,
  });
}

/**
 * Chases tree shas one path segment at a time so a configured subdirectory can
 * be listed without pulling (and hitting the truncation limit of) the whole
 * repository tree in a single recursive call.
 */
async function fetchTreeAtPath(params: {
  fetchFn: FetchFn;
  token: string;
  owner: string;
  repo: string;
  rootTreeSha: string;
  repoPath: string;
  assertNotCancelled: () => void;
}): Promise<GitHubTreeEntry[]> {
  const normalizedPath = normalizeRepoPath(params.repoPath);
  let treeSha = params.rootTreeSha;
  if (normalizedPath) {
    for (const segment of normalizedPath.split('/')) {
      params.assertNotCancelled();
      const tree = await fetchTree({ ...params, treeSha, recursive: false });
      params.assertNotCancelled();
      if (tree.truncated) {
        throw new RepoAdapterError('GITHUB_TREE_TRUNCATED', 'GitHub tree response was truncated');
      }
      const next = tree.tree.find((entry) => entry.type === 'tree' && entry.path === segment);
      if (!next) {
        throw new RepoAdapterError(
          'GITHUB_PATH_NOT_FOUND',
          `Configured GitHub skill path "${normalizedPath}" was not found`,
        );
      }
      treeSha = next.sha;
    }
  }

  params.assertNotCancelled();
  const tree = await fetchTree({ ...params, treeSha, recursive: true });
  params.assertNotCancelled();
  if (tree.truncated) {
    throw new RepoAdapterError('GITHUB_TREE_TRUNCATED', 'GitHub tree response was truncated');
  }
  if (!normalizedPath) {
    return tree.tree;
  }
  return tree.tree.map((entry) => ({
    ...entry,
    path: `${normalizedPath}/${normalizeRepoPath(entry.path)}`,
  }));
}

async function fetchBlob(params: {
  fetchFn: FetchFn;
  token: string;
  owner: string;
  repo: string;
  sha: string;
}): Promise<Buffer> {
  const owner = encodeURIComponent(params.owner);
  const repo = encodeURIComponent(params.repo);
  const sha = encodeURIComponent(params.sha);
  const blob = await githubJson<GitHubBlobResponse>({
    fetchFn: params.fetchFn,
    token: params.token,
    pathname: `/repos/${owner}/${repo}/git/blobs/${sha}`,
  });
  if (blob.encoding !== 'base64') {
    throw new RepoAdapterError(
      'GITHUB_UNSUPPORTED_BLOB',
      `Unsupported GitHub blob encoding "${blob.encoding}"`,
    );
  }
  return Buffer.from(blob.content.replace(/\s/g, ''), 'base64');
}

function toRepoTreeEntry(entry: GitHubTreeEntry): RepoTreeEntry | null {
  if (entry.type !== 'blob' && entry.type !== 'tree') {
    return null;
  }
  return { path: entry.path, type: entry.type, id: entry.sha, size: entry.size };
}

export function createGitHubRepoAdapter(config: GitHubRepoAdapterConfig): GitRepoAdapter {
  const { owner, repo, token, fetchFn } = config;

  async function resolveCommit(ref: string): Promise<RepoCommit> {
    const encodedRef = encodeGitHubPath(ref);
    const commit = await githubJson<GitHubCommitResponse>({
      fetchFn,
      token,
      pathname: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodedRef}`,
    });
    return { id: commit.sha, treeId: commit.commit.tree.sha };
  }

  async function fetchTreeEntries(
    commit: RepoCommit,
    params: FetchTreeParams,
  ): Promise<RepoTreeEntry[]> {
    const entries = await fetchTreeAtPath({
      fetchFn,
      token,
      owner,
      repo,
      rootTreeSha: commit.treeId,
      repoPath: params.pathPrefix,
      assertNotCancelled: params.assertNotCancelled,
    });
    return entries.map(toRepoTreeEntry).filter((entry): entry is RepoTreeEntry => entry !== null);
  }

  async function fetchFileContent(
    _commit: RepoCommit,
    params: FetchFileContentParams,
  ): Promise<Buffer> {
    return fetchBlob({ fetchFn, token, owner, repo, sha: params.entry.id });
  }

  return { resolveCommit, fetchTreeEntries, fetchFileContent };
}
