import type {
  FetchFileContentParams,
  FetchTreeParams,
  GitRepoAdapter,
  RepoCommit,
  RepoTreeEntry,
} from './types';
import { RepoAdapterError } from './types';

export const GITLAB_DEFAULT_BASE_URL = 'https://gitlab.com';

export const GITLAB_TOKEN_RECOMMENDATION =
  'Use a GitLab project access token scoped to the selected project with read-only repository access.';

type FetchFn = typeof fetch;

type GitLabTreeEntry = {
  id: string;
  name: string;
  type: 'blob' | 'tree';
  path: string;
  mode: string;
};

type GitLabFileMetadata = {
  size: number;
  content: string;
  encoding: string;
};

export type GitLabRepoAdapterConfig = {
  baseUrl?: string;
  projectId: string;
  token: string;
  fetchFn: FetchFn;
};

function normalizeRepoPath(value: string): string {
  const trimmed = value.trim().replace(/^\/+|\/+$/g, '');
  return trimmed === '.' ? '' : trimmed;
}

function buildGitLabHeaders(token: string): HeadersInit {
  return {
    'Private-Token': token,
    'User-Agent': 'LibreChat-Skill-Sync',
  };
}

function buildGitLabApiBase(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/api/v4`;
}

async function readGitLabErrorMessage(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === 'string') {
      return body.message;
    }
    if (Array.isArray(body.message)) {
      return body.message.join(', ');
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function isGitLabRateLimitResponse(params: {
  status: number;
  retryAfter: string | null;
  remaining: string | null;
}): boolean {
  return params.status === 429 || Boolean(params.retryAfter) || params.remaining === '0';
}

async function gitlabRequest(params: {
  fetchFn: FetchFn;
  token: string;
  url: string;
}): Promise<Response> {
  const response = await params.fetchFn(params.url, { headers: buildGitLabHeaders(params.token) });
  if (response.ok) {
    return response;
  }
  const retryAfter = response.headers.get('retry-after');
  const remaining = response.headers.get('ratelimit-remaining');
  const message = await readGitLabErrorMessage(response);
  if (response.status === 401 || response.status === 403 || response.status === 429) {
    const code = isGitLabRateLimitResponse({ status: response.status, retryAfter, remaining })
      ? 'GITLAB_RATE_LIMITED'
      : 'GITLAB_AUTH_FAILED';
    throw new RepoAdapterError(
      code,
      `GitLab request failed with HTTP ${response.status}${message ? `: ${message}` : ''}`,
    );
  }
  if (response.status === 404) {
    throw new RepoAdapterError('GITLAB_NOT_FOUND', 'GitLab project, ref, or path was not found');
  }
  throw new RepoAdapterError(
    'GITLAB_REQUEST_FAILED',
    `GitLab request failed with HTTP ${response.status}${message ? `: ${message}` : ''}`,
  );
}

async function gitlabJson<T>(params: { fetchFn: FetchFn; token: string; url: string }): Promise<T> {
  const response = await gitlabRequest(params);
  return (await response.json()) as T;
}

/**
 * GitLab paginates the tree endpoint via `X-Next-Page` rather than a truncation
 * flag, so a full listing means following that header until it is empty.
 */
async function fetchTreePage(params: {
  fetchFn: FetchFn;
  token: string;
  apiBase: string;
  projectId: string;
  ref: string;
  path: string;
  page: number;
}): Promise<{ entries: GitLabTreeEntry[]; nextPage: string | null }> {
  const query = new URLSearchParams({
    ref: params.ref,
    recursive: 'true',
    per_page: '100',
    page: String(params.page),
  });
  if (params.path) {
    query.set('path', params.path);
  }
  const url = `${params.apiBase}/projects/${encodeURIComponent(
    params.projectId,
  )}/repository/tree?${query.toString()}`;
  const response = await gitlabRequest({ fetchFn: params.fetchFn, token: params.token, url });
  const entries = (await response.json()) as GitLabTreeEntry[];
  const nextPage = response.headers.get('x-next-page');
  return { entries, nextPage: nextPage && nextPage.trim() ? nextPage : null };
}

async function fetchFullTree(params: {
  fetchFn: FetchFn;
  token: string;
  apiBase: string;
  projectId: string;
  ref: string;
  path: string;
  assertNotCancelled: () => void;
}): Promise<GitLabTreeEntry[]> {
  const entries: GitLabTreeEntry[] = [];
  let page: number | null = 1;
  while (page !== null) {
    params.assertNotCancelled();
    const result: { entries: GitLabTreeEntry[]; nextPage: string | null } = await fetchTreePage({
      ...params,
      page,
    });
    entries.push(...result.entries);
    page = result.nextPage ? Number(result.nextPage) : null;
  }
  return entries;
}

function toRepoTreeEntry(entry: GitLabTreeEntry): RepoTreeEntry | null {
  if (entry.type !== 'blob' && entry.type !== 'tree') {
    return null;
  }
  return { path: entry.path, type: entry.type, id: entry.id };
}

/**
 * `size` is populated in a second pass, one metadata request per blob. GitLab's
 * tree endpoint omits size, unlike GitHub's, which returns it inline; this keeps
 * the size-limit check enforceable before content download without changing the
 * shared `RepoTreeEntry` shape.
 */
async function withBlobSizes(params: {
  fetchFn: FetchFn;
  token: string;
  apiBase: string;
  projectId: string;
  ref: string;
  entries: RepoTreeEntry[];
  assertNotCancelled: () => void;
}): Promise<RepoTreeEntry[]> {
  const result: RepoTreeEntry[] = [];
  for (const entry of params.entries) {
    if (entry.type !== 'blob') {
      result.push(entry);
      continue;
    }
    params.assertNotCancelled();
    const metadata = await fetchFileMetadata({ ...params, entry });
    result.push({ ...entry, size: metadata.size });
  }
  return result;
}

async function fetchFileMetadata(params: {
  fetchFn: FetchFn;
  token: string;
  apiBase: string;
  projectId: string;
  ref: string;
  entry: RepoTreeEntry;
}): Promise<GitLabFileMetadata> {
  const encodedPath = encodeURIComponent(params.entry.path);
  return gitlabJson<GitLabFileMetadata>({
    fetchFn: params.fetchFn,
    token: params.token,
    url: `${params.apiBase}/projects/${encodeURIComponent(
      params.projectId,
    )}/repository/files/${encodedPath}?ref=${encodeURIComponent(params.ref)}`,
  });
}

export function createGitLabRepoAdapter(config: GitLabRepoAdapterConfig): GitRepoAdapter {
  const { projectId, token, fetchFn } = config;
  const apiBase = buildGitLabApiBase(config.baseUrl ?? GITLAB_DEFAULT_BASE_URL);

  async function resolveCommit(ref: string): Promise<RepoCommit> {
    const commit = await gitlabJson<{ id: string }>({
      fetchFn,
      token,
      url: `${apiBase}/projects/${encodeURIComponent(projectId)}/repository/commits/${encodeURIComponent(
        ref,
      )}`,
    });
    // GitLab has no separate tree object to address, so the tree entry point is
    // the commit id itself.
    return { id: commit.id, treeId: commit.id };
  }

  async function fetchTreeEntries(
    commit: RepoCommit,
    params: FetchTreeParams,
  ): Promise<RepoTreeEntry[]> {
    const rawEntries = await fetchFullTree({
      fetchFn,
      token,
      apiBase,
      projectId,
      ref: commit.treeId,
      path: normalizeRepoPath(params.pathPrefix),
      assertNotCancelled: params.assertNotCancelled,
    });
    const entries = rawEntries
      .map(toRepoTreeEntry)
      .filter((entry): entry is RepoTreeEntry => entry !== null);
    return withBlobSizes({
      fetchFn,
      token,
      apiBase,
      projectId,
      ref: commit.treeId,
      entries,
      assertNotCancelled: params.assertNotCancelled,
    });
  }

  async function fetchFileContent(
    commit: RepoCommit,
    params: FetchFileContentParams,
  ): Promise<Buffer> {
    const metadata = await fetchFileMetadata({
      fetchFn,
      token,
      apiBase,
      projectId,
      ref: commit.id,
      entry: params.entry,
    });
    if (metadata.encoding !== 'base64') {
      throw new RepoAdapterError(
        'GITLAB_UNSUPPORTED_BLOB',
        `Unsupported GitLab file encoding "${metadata.encoding}"`,
      );
    }
    return Buffer.from(metadata.content.replace(/\s/g, ''), 'base64');
  }

  return { resolveCommit, fetchTreeEntries, fetchFileContent };
}
