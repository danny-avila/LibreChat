import { GitHubRepoAdapter } from './githubAdapter';
import { GitLabRepoAdapter } from './gitlabAdapter';
import { BitbucketRepoAdapter } from './bitbucketAdapter';
import { AzureDevOpsRepoAdapter } from './azureDevOpsAdapter';
import { createRepoAdapter } from './adapterFactory';

function mockResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
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
    arrayBuffer: async () => {
      const content = typeof body === 'string' ? body : JSON.stringify(body);
      const buf = Buffer.from(content, 'utf-8');
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    },
  } as unknown as Response;
}

describe('GitHubRepoAdapter', () => {
  const token = 'ghp_test123';

  it('getTreeSha resolves commit and tree SHA', async () => {
    const fetchFn = jest.fn(async () =>
      mockResponse({ sha: 'abc123', commit: { tree: { sha: 'tree456' } } }),
    );
    const adapter = new GitHubRepoAdapter({ owner: 'org', repo: 'skills', token, fetchFn });
    const result = await adapter.getTreeSha('main');
    expect(result).toEqual({ commitSha: 'abc123', treeSha: 'tree456' });
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.github.com/repos/org/skills/commits/main',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${token}` }),
      }),
    );
  });

  it('listTree returns entries filtered to blobs and trees', async () => {
    const fetchFn = jest.fn(async () =>
      mockResponse({
        sha: 'tree456',
        truncated: false,
        tree: [
          { path: 'SKILL.md', mode: '100644', type: 'blob', sha: 's1', size: 100 },
          { path: 'lib', mode: '040000', type: 'tree', sha: 's2' },
          { path: '.gitmodules', mode: '160000', type: 'commit', sha: 's3' },
        ],
      }),
    );
    const adapter = new GitHubRepoAdapter({ owner: 'org', repo: 'skills', token, fetchFn });
    const entries = await adapter.listTree('tree456');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ path: 'SKILL.md', type: 'blob', sha: 's1', size: 100 });
    expect(entries[1]).toEqual({ path: 'lib', type: 'tree', sha: 's2', size: undefined });
  });

  it('listTree throws on truncated response', async () => {
    const fetchFn = jest.fn(async () =>
      mockResponse({ sha: 'tree456', truncated: true, tree: [] }),
    );
    const adapter = new GitHubRepoAdapter({ owner: 'org', repo: 'skills', token, fetchFn });
    await expect(adapter.listTree('tree456')).rejects.toThrow('truncated');
  });

  it('fetchBlob decodes base64 content', async () => {
    const content = '# My Skill\nDo the thing.';
    const fetchFn = jest.fn(async () =>
      mockResponse({
        sha: 'blob-sha',
        encoding: 'base64',
        size: Buffer.byteLength(content),
        content: Buffer.from(content).toString('base64'),
      }),
    );
    const adapter = new GitHubRepoAdapter({ owner: 'org', repo: 'skills', token, fetchFn });
    const buffer = await adapter.fetchBlob('blob-sha');
    expect(buffer.toString('utf-8')).toBe(content);
  });

  it('throws on 401 with auth error code', async () => {
    const fetchFn = jest.fn(async () => mockResponse({ message: 'Bad credentials' }, 401));
    const adapter = new GitHubRepoAdapter({ owner: 'org', repo: 'skills', token, fetchFn });
    await expect(adapter.getTreeSha('main')).rejects.toThrow('HTTP 401');
  });

  it('throws on 404 with not found code', async () => {
    const fetchFn = jest.fn(async () => mockResponse({ message: 'Not Found' }, 404));
    const adapter = new GitHubRepoAdapter({ owner: 'org', repo: 'skills', token, fetchFn });
    await expect(adapter.getTreeSha('main')).rejects.toThrow('not found');
  });
});

describe('GitLabRepoAdapter', () => {
  const token = 'glpat-test123';

  it('getTreeSha resolves commit ID', async () => {
    const fetchFn = jest.fn(async () => mockResponse({ id: 'commit789', parent_ids: ['parent1'] }));
    const adapter = new GitLabRepoAdapter({ projectId: '42', token, fetchFn });
    const result = await adapter.getTreeSha('main');
    expect(result).toEqual({ commitSha: 'commit789', treeSha: 'commit789' });
    expect(fetchFn).toHaveBeenCalledWith(
      'https://gitlab.com/api/v4/projects/42/repository/commits/main',
      expect.objectContaining({ headers: expect.objectContaining({ 'Private-Token': token }) }),
    );
  });

  it('listTree returns paginated entries', async () => {
    const page1Response = {
      ok: true,
      status: 200,
      headers: {
        get: (key: string) =>
          key.toLowerCase() === 'link'
            ? '<https://gitlab.com/api/v4/projects/42/repository/tree?page=2>; rel="next"'
            : null,
      },
      json: async () => [
        { id: 'sha1', name: 'SKILL.md', type: 'blob', path: 'SKILL.md', mode: '100644' },
      ],
    } as unknown as Response;
    const page2Response = {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => [{ id: 'sha2', name: 'lib', type: 'tree', path: 'lib', mode: '040000' }],
    } as unknown as Response;
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(page1Response)
      .mockResolvedValueOnce(page2Response);
    const adapter = new GitLabRepoAdapter({ projectId: '42', token, fetchFn });
    const entries = await adapter.listTree('commit789');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ path: 'SKILL.md', type: 'blob', sha: 'sha1', size: undefined });
  });

  it('fetchBlob returns raw content as buffer', async () => {
    const content = '# Skill content';
    const fetchFn = jest.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => {
        const buf = Buffer.from(content, 'utf-8');
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      },
    })) as unknown as typeof fetch;
    const adapter = new GitLabRepoAdapter({ projectId: '42', token, fetchFn });
    const buffer = await adapter.fetchBlob('sha1');
    expect(buffer.toString('utf-8')).toBe(content);
  });

  it('supports self-hosted baseUrl', async () => {
    const fetchFn = jest.fn(async () => mockResponse({ id: 'abc', parent_ids: [] }));
    const adapter = new GitLabRepoAdapter({
      projectId: '42',
      token,
      baseUrl: 'https://git.company.com',
      fetchFn,
    });
    await adapter.getTreeSha('develop');
    expect(fetchFn).toHaveBeenCalledWith(
      'https://git.company.com/api/v4/projects/42/repository/commits/develop',
      expect.anything(),
    );
  });

  it('throws on 401', async () => {
    const fetchFn = jest.fn(async () => mockResponse({}, 401));
    const adapter = new GitLabRepoAdapter({ projectId: '42', token, fetchFn });
    await expect(adapter.getTreeSha('main')).rejects.toThrow('HTTP 401');
  });
});

describe('BitbucketRepoAdapter', () => {
  const token = 'bb-app-password';

  it('getTreeSha resolves commit hash', async () => {
    const fetchFn = jest.fn(async () => mockResponse({ hash: 'deadbeef' }));
    const adapter = new BitbucketRepoAdapter({
      workspace: 'myteam',
      repository: 'skills-repo',
      token,
      fetchFn,
    });
    const result = await adapter.getTreeSha('main');
    expect(result).toEqual({ commitSha: 'deadbeef', treeSha: 'deadbeef' });
  });

  it('listTree paginates through results', async () => {
    const page1 = mockResponse({
      values: [{ path: 'SKILL.md', type: 'commit_file', size: 50, commit: { hash: 'abc' } }],
      next: 'https://api.bitbucket.org/2.0/repositories/myteam/skills-repo/src/main/?page=2',
    });
    const page2 = mockResponse({
      values: [{ path: 'lib', type: 'commit_directory', commit: { hash: 'abc' } }],
    });
    const fetchFn = jest.fn().mockResolvedValueOnce(page1).mockResolvedValueOnce(page2);
    const adapter = new BitbucketRepoAdapter({
      workspace: 'myteam',
      repository: 'skills-repo',
      token,
      fetchFn,
    });
    const entries = await adapter.listTree('deadbeef');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ path: 'SKILL.md', type: 'blob', sha: 'abc', size: 50 });
    expect(entries[1]).toEqual({ path: 'lib', type: 'tree', sha: 'abc', size: undefined });
  });

  it('fetchBlob requires commitHash:filePath format', async () => {
    const adapter = new BitbucketRepoAdapter({
      workspace: 'myteam',
      repository: 'skills-repo',
      token,
      fetchFn: jest.fn(),
    });
    await expect(adapter.fetchBlob('invalid-no-colon')).rejects.toThrow('commitHash:filePath');
  });

  it('fetchBlob fetches file by commit and path', async () => {
    const content = 'file content here';
    const fetchFn = jest.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => {
        const buf = Buffer.from(content, 'utf-8');
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      },
    })) as unknown as typeof fetch;
    const adapter = new BitbucketRepoAdapter({
      workspace: 'myteam',
      repository: 'skills-repo',
      token,
      fetchFn,
    });
    const buffer = await adapter.fetchBlob('deadbeef:skills/SKILL.md');
    expect(buffer.toString('utf-8')).toBe(content);
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining('/src/deadbeef/skills/SKILL.md'),
      expect.anything(),
    );
  });
});

describe('AzureDevOpsRepoAdapter', () => {
  const token = 'ado-pat-123';

  it('getTreeSha resolves via refs and commit', async () => {
    const fetchFn = jest.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/refs?')) {
        return mockResponse({ value: [{ name: 'refs/heads/main', objectId: 'commit-id' }] });
      }
      if (url.includes('/commits/')) {
        return mockResponse({ commitId: 'commit-id', treeId: 'tree-id' });
      }
      return mockResponse({}, 404);
    });
    const adapter = new AzureDevOpsRepoAdapter({
      organization: 'myorg',
      project: 'myproject',
      repository: 'myrepo',
      token,
      fetchFn,
    });
    const result = await adapter.getTreeSha('main');
    expect(result).toEqual({ commitSha: 'commit-id', treeSha: 'tree-id' });
  });

  it('getTreeSha falls back to treating ref as commit SHA when no branch found', async () => {
    const fetchFn = jest.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/refs?')) {
        return mockResponse({ value: [] });
      }
      if (url.includes('/commits/')) {
        return mockResponse({ commitId: 'abc123', treeId: 'tree-abc' });
      }
      return mockResponse({}, 404);
    });
    const adapter = new AzureDevOpsRepoAdapter({
      organization: 'myorg',
      project: 'myproject',
      repository: 'myrepo',
      token,
      fetchFn,
    });
    const result = await adapter.getTreeSha('abc123');
    expect(result).toEqual({ commitSha: 'abc123', treeSha: 'tree-abc' });
  });

  it('listTree returns mapped entries', async () => {
    const fetchFn = jest.fn(async () =>
      mockResponse({
        treeEntries: [
          {
            objectId: 'obj1',
            relativePath: 'SKILL.md',
            gitObjectType: 'blob',
            size: 120,
            mode: '100644',
          },
          {
            objectId: 'obj2',
            relativePath: 'scripts',
            gitObjectType: 'tree',
            size: 0,
            mode: '040000',
          },
        ],
      }),
    );
    const adapter = new AzureDevOpsRepoAdapter({
      organization: 'myorg',
      project: 'myproject',
      repository: 'myrepo',
      token,
      fetchFn,
    });
    const entries = await adapter.listTree('tree-id');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ path: 'SKILL.md', type: 'blob', sha: 'obj1', size: 120 });
    expect(entries[1]).toEqual({ path: 'scripts', type: 'tree', sha: 'obj2', size: 0 });
  });

  it('fetchBlob fetches raw blob content', async () => {
    const content = '# Azure skill';
    const fetchFn = jest.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => {
        const buf = Buffer.from(content, 'utf-8');
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      },
    })) as unknown as typeof fetch;
    const adapter = new AzureDevOpsRepoAdapter({
      organization: 'myorg',
      project: 'myproject',
      repository: 'myrepo',
      token,
      fetchFn,
    });
    const buffer = await adapter.fetchBlob('obj1');
    expect(buffer.toString('utf-8')).toBe(content);
  });

  it('uses Basic auth with PAT', async () => {
    const fetchFn = jest.fn(async () => mockResponse({ value: [] }));
    const adapter = new AzureDevOpsRepoAdapter({
      organization: 'myorg',
      project: 'myproject',
      repository: 'myrepo',
      token,
      fetchFn,
    });
    try {
      await adapter.getTreeSha('main');
    } catch {
      /* ignore */
    }
    const expectedAuth = `Basic ${Buffer.from(`:${token}`).toString('base64')}`;
    expect(fetchFn).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: expectedAuth }),
      }),
    );
  });
});

describe('createRepoAdapter factory', () => {
  it('creates GitHubRepoAdapter for github provider', () => {
    const adapter = createRepoAdapter({
      provider: 'github',
      token: 'tok',
      owner: 'org',
      repo: 'repo',
    });
    expect(adapter).toBeInstanceOf(GitHubRepoAdapter);
  });

  it('creates GitLabRepoAdapter for gitlab provider', () => {
    const adapter = createRepoAdapter({
      provider: 'gitlab',
      token: 'tok',
      projectId: '42',
    });
    expect(adapter).toBeInstanceOf(GitLabRepoAdapter);
  });

  it('creates BitbucketRepoAdapter for bitbucket provider', () => {
    const adapter = createRepoAdapter({
      provider: 'bitbucket',
      token: 'tok',
      workspace: 'ws',
      repository: 'repo',
    });
    expect(adapter).toBeInstanceOf(BitbucketRepoAdapter);
  });

  it('creates AzureDevOpsRepoAdapter for azuredevops provider', () => {
    const adapter = createRepoAdapter({
      provider: 'azuredevops',
      token: 'tok',
      organization: 'org',
      project: 'proj',
      repository: 'repo',
    });
    expect(adapter).toBeInstanceOf(AzureDevOpsRepoAdapter);
  });

  it('throws for missing required fields', () => {
    expect(() => createRepoAdapter({ provider: 'github', token: 'tok' })).toThrow('owner and repo');
    expect(() => createRepoAdapter({ provider: 'gitlab', token: 'tok' })).toThrow('projectId');
    expect(() => createRepoAdapter({ provider: 'bitbucket', token: 'tok' })).toThrow(
      'workspace and repository',
    );
    expect(() => createRepoAdapter({ provider: 'azuredevops', token: 'tok' })).toThrow(
      'organization, project, and repository',
    );
  });

  it('throws for unsupported provider', () => {
    expect(() =>
      createRepoAdapter({ provider: 'svn' as unknown as 'github', token: 'tok' }),
    ).toThrow('Unsupported');
  });
});
