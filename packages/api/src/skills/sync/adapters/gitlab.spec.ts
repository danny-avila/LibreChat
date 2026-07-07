import {
  createGitLabRepoAdapter,
  GITLAB_DEFAULT_BASE_URL,
  type GitLabRepoAdapterConfig,
} from './gitlab';
import { RepoAdapterError } from './types';

function response(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  const normalizedHeaders = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (key: string) => normalizedHeaders.get(key.toLowerCase()) ?? null,
    },
    json: async () => body,
  } as unknown as Response;
}

function blobMetadata(content: string) {
  return {
    size: Buffer.byteLength(content),
    encoding: 'base64',
    content: Buffer.from(content).toString('base64'),
  };
}

function gitlabFetch(overrides: Record<string, () => Response> = {}): typeof fetch {
  return jest.fn(async (input: RequestInfo | URL) => {
    const url = input.toString();
    for (const [pattern, handler] of Object.entries(overrides)) {
      if (url.includes(pattern)) {
        return handler();
      }
    }
    if (url.includes('/repository/commits/')) {
      return response({ id: 'commit-sha' });
    }
    if (url.includes('/repository/tree')) {
      return response(
        [
          {
            id: 'skill-md-id',
            name: 'SKILL.md',
            type: 'blob',
            path: 'skills/research/SKILL.md',
            mode: '100644',
          },
          {
            id: 'file-id',
            name: 'run.sh',
            type: 'blob',
            path: 'skills/research/scripts/run.sh',
            mode: '100644',
          },
        ],
        200,
        { 'x-next-page': '' },
      );
    }
    if (url.includes('/repository/files/skills%2Fresearch%2FSKILL.md')) {
      return response(blobMetadata('---\nname: research\n---\nBody'));
    }
    if (url.includes('/repository/files/skills%2Fresearch%2Fscripts%2Frun.sh')) {
      return response(blobMetadata('echo ok'));
    }
    return response({ message: 'not found' }, 404);
  }) as unknown as typeof fetch;
}

function createAdapter(overrides: Partial<GitLabRepoAdapterConfig> = {}) {
  return createGitLabRepoAdapter({
    projectId: 'group%2Fskills',
    token: 'glpat-secret',
    fetchFn: gitlabFetch(),
    ...overrides,
  });
}

describe('createGitLabRepoAdapter', () => {
  it('resolves a ref to a commit id, with treeId equal to the commit (GitLab has no separate tree object)', async () => {
    const adapter = createAdapter();
    const commit = await adapter.resolveCommit('main');
    expect(commit).toEqual({ id: 'commit-sha', treeId: 'commit-sha' });
  });

  it('defaults to gitlab.com when no baseUrl is configured', async () => {
    const fetchFn = jest.fn(async () => response({ id: 'commit-sha' })) as unknown as typeof fetch;
    const adapter = createAdapter({ fetchFn });
    await adapter.resolveCommit('main');
    const [calledUrl] = (fetchFn as unknown as jest.Mock).mock.calls[0];
    expect(calledUrl.toString().startsWith(GITLAB_DEFAULT_BASE_URL)).toBe(true);
  });

  it('uses a configured self-hosted baseUrl', async () => {
    const fetchFn = jest.fn(async () => response({ id: 'commit-sha' })) as unknown as typeof fetch;
    const adapter = createAdapter({ fetchFn, baseUrl: 'https://gitlab.example.com' });
    await adapter.resolveCommit('main');
    const [calledUrl] = (fetchFn as unknown as jest.Mock).mock.calls[0];
    expect(calledUrl.toString().startsWith('https://gitlab.example.com/api/v4')).toBe(true);
  });

  it('sends the Private-Token header for authentication', async () => {
    const fetchFn = jest.fn(async () => response({ id: 'commit-sha' })) as unknown as typeof fetch;
    const adapter = createAdapter({ fetchFn, token: 'glpat-abc123' });
    await adapter.resolveCommit('main');
    const [, init] = (fetchFn as unknown as jest.Mock).mock.calls[0];
    expect((init.headers as Record<string, string>)['Private-Token']).toBe('glpat-abc123');
  });

  it('lists tree entries recursively and populates blob sizes', async () => {
    const adapter = createAdapter();
    const commit = await adapter.resolveCommit('main');
    const entries = await adapter.fetchTreeEntries(commit, {
      ref: 'main',
      pathPrefix: 'skills',
      assertNotCancelled: () => undefined,
    });
    expect(entries).toEqual([
      {
        path: 'skills/research/SKILL.md',
        type: 'blob',
        id: 'skill-md-id',
        size: Buffer.byteLength('---\nname: research\n---\nBody'),
      },
      {
        path: 'skills/research/scripts/run.sh',
        type: 'blob',
        id: 'file-id',
        size: Buffer.byteLength('echo ok'),
      },
    ]);
  });

  it('follows x-next-page pagination until exhausted', async () => {
    let page = 0;
    const fetchFn = jest.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/repository/tree')) {
        page += 1;
        if (page === 1) {
          return response(
            [{ id: 'a', name: 'a.md', type: 'blob', path: 'a.md', mode: '100644' }],
            200,
            { 'x-next-page': '2' },
          );
        }
        return response(
          [{ id: 'b', name: 'b.md', type: 'blob', path: 'b.md', mode: '100644' }],
          200,
          { 'x-next-page': '' },
        );
      }
      return response(blobMetadata('content'));
    }) as unknown as typeof fetch;
    const adapter = createAdapter({ fetchFn });
    const entries = await adapter.fetchTreeEntries(
      { id: 'commit-sha', treeId: 'commit-sha' },
      { ref: 'commit-sha', pathPrefix: '', assertNotCancelled: () => undefined },
    );
    expect(entries.map((entry) => entry.path)).toEqual(['a.md', 'b.md']);
  });

  it('fetches decoded file content for a blob entry', async () => {
    const adapter = createAdapter();
    const commit = await adapter.resolveCommit('main');
    const buffer = await adapter.fetchFileContent(commit, {
      ref: 'main',
      entry: { path: 'skills/research/scripts/run.sh', type: 'blob', id: 'file-id' },
    });
    expect(buffer.toString('utf-8')).toBe('echo ok');
  });

  it('throws RepoAdapterError with a rate-limit code on HTTP 429', async () => {
    const fetchFn = jest.fn(async () =>
      response({ message: 'rate limited' }, 429, { 'retry-after': '30' }),
    ) as unknown as typeof fetch;
    const adapter = createAdapter({ fetchFn });
    await expect(adapter.resolveCommit('main')).rejects.toMatchObject({
      code: 'GITLAB_RATE_LIMITED',
    });
  });

  it('throws RepoAdapterError with an auth-failed code on HTTP 401', async () => {
    const fetchFn = jest.fn(async () =>
      response({ message: 'unauthorized' }, 401),
    ) as unknown as typeof fetch;
    const adapter = createAdapter({ fetchFn });
    await expect(adapter.resolveCommit('main')).rejects.toBeInstanceOf(RepoAdapterError);
    await expect(adapter.resolveCommit('main')).rejects.toMatchObject({
      code: 'GITLAB_AUTH_FAILED',
    });
  });

  it('throws RepoAdapterError with a not-found code on HTTP 404', async () => {
    const fetchFn = jest.fn(async () =>
      response({ message: 'not found' }, 404),
    ) as unknown as typeof fetch;
    const adapter = createAdapter({ fetchFn });
    await expect(adapter.resolveCommit('main')).rejects.toMatchObject({
      code: 'GITLAB_NOT_FOUND',
    });
  });

  it('throws on unsupported file encodings', async () => {
    const fetchFn = jest.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/repository/files/')) {
        return response({ size: 4, encoding: 'base64url', content: 'zzzz' });
      }
      return response({ id: 'commit-sha' });
    }) as unknown as typeof fetch;
    const adapter = createAdapter({ fetchFn });
    const commit = await adapter.resolveCommit('main');
    await expect(
      adapter.fetchFileContent(commit, {
        ref: 'main',
        entry: { path: 'skills/research/SKILL.md', type: 'blob', id: 'skill-md-id' },
      }),
    ).rejects.toMatchObject({ code: 'GITLAB_UNSUPPORTED_BLOB' });
  });
});
