import type { GitRepoAdapter, GitTreeEntry } from './adapter';

type FetchFn = typeof fetch;

type AzureTreeEntry = {
  objectId: string;
  relativePath: string;
  gitObjectType: 'blob' | 'tree';
  size: number;
  mode: string;
};

type AzureTreeResponse = {
  treeEntries: AzureTreeEntry[];
  _links?: Record<string, unknown>;
};

type AzureCommitResponse = {
  commitId: string;
  treeId: string;
};

type AzureRefsResponse = {
  value: Array<{
    name: string;
    objectId: string;
  }>;
};

class AzureDevOpsAdapterError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'AzureDevOpsAdapterError';
    this.code = code;
  }
}

async function azureRequest<T>(fetchFn: FetchFn, url: string, token: string): Promise<T> {
  const response = await fetchFn(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
      'User-Agent': 'LibreChat-Skill-Sync',
    },
  });
  if (response.ok) {
    return (await response.json()) as T;
  }
  if (response.status === 401 || response.status === 403) {
    throw new AzureDevOpsAdapterError(
      'AZUREDEVOPS_AUTH_FAILED',
      `Azure DevOps request failed with HTTP ${response.status}`,
    );
  }
  if (response.status === 404) {
    throw new AzureDevOpsAdapterError(
      'AZUREDEVOPS_NOT_FOUND',
      'Azure DevOps repository, ref, or path was not found',
    );
  }
  if (response.status === 429) {
    throw new AzureDevOpsAdapterError(
      'AZUREDEVOPS_RATE_LIMITED',
      'Azure DevOps rate limit exceeded',
    );
  }
  throw new AzureDevOpsAdapterError(
    'AZUREDEVOPS_REQUEST_FAILED',
    `Azure DevOps request failed with HTTP ${response.status}`,
  );
}

export type AzureDevOpsAdapterOptions = {
  organization: string;
  project: string;
  repository: string;
  token: string;
  baseUrl?: string;
  fetchFn?: FetchFn;
};

export class AzureDevOpsRepoAdapter implements GitRepoAdapter {
  private readonly organization: string;
  private readonly project: string;
  private readonly repository: string;
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchFn: FetchFn;

  constructor(options: AzureDevOpsAdapterOptions) {
    this.organization = options.organization;
    this.project = options.project;
    this.repository = options.repository;
    this.token = options.token;
    this.baseUrl = (options.baseUrl ?? 'https://dev.azure.com').replace(/\/+$/, '');
    this.fetchFn = options.fetchFn ?? fetch;
  }

  private repoUrl(): string {
    const org = encodeURIComponent(this.organization);
    const project = encodeURIComponent(this.project);
    const repo = encodeURIComponent(this.repository);
    return `${this.baseUrl}/${org}/${project}/_apis/git/repositories/${repo}`;
  }

  async getTreeSha(ref: string): Promise<{ commitSha: string; treeSha: string }> {
    // Try resolving as a branch first (refs/heads/{ref})
    const refsUrl = `${this.repoUrl()}/refs?filter=heads/${encodeURIComponent(ref)}&api-version=7.1`;
    const refsResponse = await azureRequest<AzureRefsResponse>(this.fetchFn, refsUrl, this.token);
    let commitId: string;
    if (refsResponse.value.length > 0) {
      commitId = refsResponse.value[0].objectId;
    } else {
      // Treat ref as a commit SHA directly
      commitId = ref;
    }
    const commitUrl = `${this.repoUrl()}/commits/${encodeURIComponent(commitId)}?api-version=7.1`;
    const commit = await azureRequest<AzureCommitResponse>(this.fetchFn, commitUrl, this.token);
    return { commitSha: commit.commitId, treeSha: commit.treeId };
  }

  async listTree(treeSha: string, _recursive = true): Promise<GitTreeEntry[]> {
    // Azure DevOps tree API doesn't support recursive directly in a single call
    // but returns all entries when requesting a tree object
    const url = `${this.repoUrl()}/trees/${encodeURIComponent(treeSha)}?recursive=true&api-version=7.1`;
    const tree = await azureRequest<AzureTreeResponse>(this.fetchFn, url, this.token);
    return tree.treeEntries.map((entry) => ({
      path: entry.relativePath,
      type: entry.gitObjectType,
      sha: entry.objectId,
      size: entry.size,
    }));
  }

  async fetchBlob(sha: string): Promise<Buffer> {
    const url = `${this.repoUrl()}/blobs/${encodeURIComponent(sha)}?api-version=7.1&$format=octetstream`;
    const response = await this.fetchFn(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(`:${this.token}`).toString('base64')}`,
        'User-Agent': 'LibreChat-Skill-Sync',
      },
    });
    if (!response.ok) {
      if (response.status === 404) {
        throw new AzureDevOpsAdapterError(
          'AZUREDEVOPS_NOT_FOUND',
          `Azure DevOps blob "${sha}" was not found`,
        );
      }
      throw new AzureDevOpsAdapterError(
        'AZUREDEVOPS_REQUEST_FAILED',
        `Azure DevOps blob fetch failed with HTTP ${response.status}`,
      );
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
