import { Types } from 'mongoose';
import type {
  ISkill,
  ISkillFile,
  CreateSkillInput,
  CreateSkillResult,
  ISkillSyncStatus,
  SkillSyncStatusInput,
} from '@librechat/data-schemas';
import { DEFAULT_SKILL_IMPORT_LIMITS } from '../limits';
import { createGitHubSkillSyncRunner } from './github';
import type { GitHubSkillSyncDeps } from './github';

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

function blob(content: string) {
  return {
    sha: 'blob-sha',
    encoding: 'base64',
    size: Buffer.byteLength(content),
    content: Buffer.from(content).toString('base64'),
  };
}

function githubFetch(
  skillMarkdown = '---\nname: research\ndescription: Research things\nalways-apply: true\n---\nBody',
): typeof fetch {
  return jest.fn(async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.includes('/commits/')) {
      return response({ sha: 'commit-sha', commit: { tree: { sha: 'tree-sha' } } });
    }
    if (url.includes('/git/trees/tree-sha')) {
      return response({
        sha: 'tree-sha',
        truncated: false,
        tree: [
          {
            path: 'skills',
            mode: '040000',
            type: 'tree',
            sha: 'skills-tree-sha',
            url: 'https://api.github.test/tree/skills',
          },
        ],
      });
    }
    if (url.includes('/git/trees/skills-tree-sha')) {
      return response({
        sha: 'skills-tree-sha',
        truncated: false,
        tree: [
          {
            path: 'research/SKILL.md',
            mode: '100644',
            type: 'blob',
            sha: 'skill-md-sha',
            size: Buffer.byteLength(skillMarkdown),
            url: 'https://api.github.test/blob/skill',
          },
          {
            path: 'research/scripts/run.sh',
            mode: '100644',
            type: 'blob',
            sha: 'file-sha',
            size: 7,
            url: 'https://api.github.test/blob/file',
          },
        ],
      });
    }
    if (url.includes('/git/blobs/skill-md-sha')) {
      return response(blob(skillMarkdown));
    }
    if (url.includes('/git/blobs/file-sha')) {
      return response(blob('echo ok'));
    }
    return response({ message: 'not found' }, 404);
  }) as unknown as typeof fetch;
}

function makeSkill(input: CreateSkillInput): ISkill & { _id: Types.ObjectId } {
  return {
    _id: new Types.ObjectId(),
    name: input.name,
    description: input.description,
    body: input.body ?? '',
    frontmatter: input.frontmatter ?? {},
    author: input.author,
    authorName: input.authorName,
    version: 1,
    source: input.source ?? 'inline',
    sourceMetadata: input.sourceMetadata,
    fileCount: 0,
    alwaysApply: input.alwaysApply ?? false,
  };
}

function createDeps(
  overrides: Partial<GitHubSkillSyncDeps> = {},
): GitHubSkillSyncDeps & { statuses: ISkillSyncStatus[] } {
  const statuses: ISkillSyncStatus[] = [];
  const deps: GitHubSkillSyncDeps & { statuses: ISkillSyncStatus[] } = {
    statuses,
    getConfig: () => ({
      github: {
        enabled: true,
        intervalMinutes: 60,
        runOnStartup: false,
        sources: [
          {
            id: 'librechat-skills',
            owner: 'LibreChat',
            repo: 'skills',
            ref: 'main',
            paths: ['skills'],
            credentialKey: 'github-skills-prod',
          },
        ],
      },
    }),
    getCredentialToken: jest.fn(async () => 'github_pat_secret'),
    getCredentialSummary: jest.fn(async () => ({
      provider: 'github',
      credentialKey: 'github-skills-prod',
      credentialPresent: true,
      tokenFingerprint: 'abc123',
    })),
    listCredentials: jest.fn(async () => []),
    listStatuses: jest.fn(async () => statuses),
    upsertStatus: jest.fn(async (input: SkillSyncStatusInput) => {
      const status: ISkillSyncStatus = {
        provider: input.provider,
        sourceId: input.sourceId,
        status: input.status,
        credentialKey: input.credentialKey,
        owner: input.owner,
        repo: input.repo,
        ref: input.ref,
        paths: input.paths,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        lastSuccessAt: input.status === 'succeeded' ? input.finishedAt : undefined,
        lastFailureAt: input.status === 'failed' ? input.finishedAt : undefined,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        syncedSkillCount: input.syncedSkillCount ?? 0,
        syncedFileCount: input.syncedFileCount ?? 0,
        deletedSkillCount: input.deletedSkillCount ?? 0,
        deletedFileCount: input.deletedFileCount ?? 0,
      };
      statuses.push(status);
      return status;
    }),
    tryAcquireLock: jest.fn(async () => true),
    refreshLock: jest.fn(async () => true),
    releaseLock: jest.fn(async () => undefined),
    createSkill: jest.fn(async (input: CreateSkillInput): Promise<CreateSkillResult> => {
      return { skill: makeSkill(input), warnings: [] };
    }),
    updateSkill: jest.fn(),
    getSkillById: jest.fn(),
    findSkillBySourceIdentity: jest.fn(async () => null),
    listSkillsBySource: jest.fn(async () => []),
    listSkillFiles: jest.fn(async () => []),
    getSkillFileByPath: jest.fn(async () => null),
    upsertSkillFile: jest.fn(async () => {
      return {
        _id: new Types.ObjectId(),
        skillId: new Types.ObjectId(),
        relativePath: 'scripts/run.sh',
        file_id: 'file-id',
        filename: 'run.sh',
        filepath: '/uploads/file-id__run.sh',
        source: 'local',
        mimeType: 'application/x-sh',
        bytes: 7,
        category: 'script',
        isExecutable: false,
        author: new Types.ObjectId(),
      } as ISkillFile & { _id: Types.ObjectId };
    }),
    deleteSkillFile: jest.fn(async () => ({ deleted: true })),
    deleteSkill: jest.fn(async () => ({ deleted: true })),
    saveBuffer: jest.fn(async () => ({ filepath: '/uploads/file-id__run.sh', source: 'local' })),
    deleteFile: jest.fn(async () => undefined),
    grantPermission: jest.fn(async () => undefined),
    fetchFn: githubFetch(),
    ...overrides,
  };
  return deps;
}

describe('createGitHubSkillSyncRunner', () => {
  it('creates a GitHub skill and syncs bundled files from a configured path', async () => {
    const deps = createDeps();
    const runner = createGitHubSkillSyncRunner(deps);
    const result = await runner.runOnce();
    const fetchedUrls = (deps.fetchFn as unknown as jest.Mock).mock.calls.map(
      ([input]: [RequestInfo | URL]) => input.toString(),
    );

    expect(result.status).toBe('completed');
    expect(fetchedUrls.some((url) => url.includes('/git/trees/tree-sha?recursive=1'))).toBe(false);
    expect(fetchedUrls.some((url) => url.includes('/git/trees/skills-tree-sha?recursive=1'))).toBe(
      true,
    );
    expect(deps.createSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'research',
        description: 'Research things',
        body: expect.stringContaining('Body'),
        alwaysApply: true,
        source: 'github',
        sourceMetadata: expect.objectContaining({
          provider: 'github',
          sourceId: 'librechat-skills',
          upstreamId: 'librechat-skills:LibreChat/skills:skills/research',
          skillBlobSha: 'skill-md-sha',
        }),
      }),
    );
    expect(deps.upsertSkillFile).toHaveBeenCalledWith(
      expect.objectContaining({
        relativePath: 'scripts/run.sh',
        sourceMetadata: expect.objectContaining({
          upstreamId: 'librechat-skills:LibreChat/skills:skills/research',
          blobSha: 'file-sha',
          commitSha: 'commit-sha',
        }),
      }),
    );
    expect(deps.grantPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        principalType: 'public',
        accessRoleId: 'skill_viewer',
      }),
    );
  });

  it('uses distinct synthetic authors so same-named skills can sync from different sources', async () => {
    const seenNamesByAuthor = new Set<string>();
    const deps = createDeps({
      getConfig: () => ({
        github: {
          enabled: true,
          intervalMinutes: 60,
          runOnStartup: false,
          sources: [
            {
              id: 'source-a',
              owner: 'LibreChat',
              repo: 'skills-a',
              ref: 'main',
              paths: ['skills'],
              credentialKey: 'github-skills-prod',
            },
            {
              id: 'source-b',
              owner: 'LibreChat',
              repo: 'skills-b',
              ref: 'main',
              paths: ['skills'],
              credentialKey: 'github-skills-prod',
            },
          ],
        },
      }),
      createSkill: jest.fn(async (input: CreateSkillInput): Promise<CreateSkillResult> => {
        const key = `${input.name}:${input.author.toString()}`;
        if (seenNamesByAuthor.has(key)) {
          throw new Error('duplicate key');
        }
        seenNamesByAuthor.add(key);
        return { skill: makeSkill(input), warnings: [] };
      }),
    });
    const runner = createGitHubSkillSyncRunner(deps);
    const result = await runner.runOnce();
    const createCalls = (deps.createSkill as jest.Mock).mock.calls.map(
      ([input]: [CreateSkillInput]) => input,
    );

    expect(result.status).toBe('completed');
    expect(createCalls).toHaveLength(2);
    expect(createCalls.map((input) => input.name)).toEqual(['research', 'research']);
    expect(new Set(createCalls.map((input) => input.author.toString())).size).toBe(2);
  });

  it('marks a source failed and skips mirror deletion when the credential is missing', async () => {
    const deps = createDeps({
      getCredentialToken: jest.fn(async () => null),
    });
    const runner = createGitHubSkillSyncRunner(deps);
    const result = await runner.runOnce();

    expect(result.status).toBe('failed');
    expect(deps.listSkillsBySource).not.toHaveBeenCalled();
    expect(deps.deleteSkill).not.toHaveBeenCalled();
    expect(deps.upsertStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorCode: 'MISSING_CREDENTIAL',
      }),
    );
  });

  it('marks GitHub secondary rate limits as rate limited instead of auth failures', async () => {
    const deps = createDeps({
      fetchFn: jest.fn(async () =>
        response(
          { message: 'You have exceeded a secondary rate limit. Please wait before retrying.' },
          403,
          { 'x-ratelimit-remaining': '42' },
        ),
      ) as unknown as typeof fetch,
    });
    const runner = createGitHubSkillSyncRunner(deps);
    const result = await runner.runOnce();

    expect(result.status).toBe('failed');
    expect(deps.upsertStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorCode: 'GITHUB_RATE_LIMITED',
      }),
    );
  });

  it('keeps non-rate-limit GitHub 403 responses classified as auth failures', async () => {
    const deps = createDeps({
      fetchFn: jest.fn(async () =>
        response({ message: 'Resource not accessible by personal access token' }, 403, {
          'x-ratelimit-remaining': '42',
        }),
      ) as unknown as typeof fetch,
    });
    const runner = createGitHubSkillSyncRunner(deps);
    const result = await runner.runOnce();

    expect(result.status).toBe('failed');
    expect(deps.upsertStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorCode: 'GITHUB_AUTH_FAILED',
      }),
    );
  });

  it('marks a source failed and skips mirror deletion when SKILL.md frontmatter is malformed', async () => {
    const deps = createDeps({
      fetchFn: githubFetch('---\nname: [\n---\nBody'),
    });
    const runner = createGitHubSkillSyncRunner(deps);
    const result = await runner.runOnce();

    expect(result.status).toBe('failed');
    expect(deps.createSkill).not.toHaveBeenCalled();
    expect(deps.listSkillsBySource).not.toHaveBeenCalled();
    expect(deps.deleteSkill).not.toHaveBeenCalled();
    expect(deps.upsertStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorCode: 'SKILL_PARSE_FAILED',
        errorMessage: expect.stringContaining('skills/research/SKILL.md'),
      }),
    );
  });

  it('uses a ref-independent upstream identity when updating an existing GitHub skill', async () => {
    const existing = makeSkill({
      name: 'research',
      description: 'Old description',
      author: new Types.ObjectId(),
      authorName: 'GitHub Sync',
      frontmatter: { 'allowed-tools': ['old-tool'] },
      source: 'github',
      sourceMetadata: {
        provider: 'github',
        sourceId: 'librechat-skills',
        upstreamId: 'librechat-skills:LibreChat/skills:skills/research',
        owner: 'LibreChat',
        repo: 'skills',
        ref: 'main',
        skillPath: 'skills/research',
      },
    }) as ISkill & { _id: Types.ObjectId };
    const deps = createDeps({
      getConfig: () => ({
        github: {
          enabled: true,
          intervalMinutes: 60,
          runOnStartup: false,
          sources: [
            {
              id: 'librechat-skills',
              owner: 'LibreChat',
              repo: 'skills',
              ref: 'release',
              paths: ['skills'],
              credentialKey: 'github-skills-prod',
            },
          ],
        },
      }),
      findSkillBySourceIdentity: jest.fn(async () => existing),
      getSkillById: jest.fn(async () => ({ ...existing, version: existing.version + 1 })),
      fetchFn: githubFetch('---\nname: research\ndescription: Research things\n---\nBody'),
      updateSkill: jest.fn(async ({ update }) => ({
        status: 'updated' as const,
        skill: {
          ...existing,
          ...update,
          version: existing.version + 1,
        },
        warnings: [],
      })),
    });
    const runner = createGitHubSkillSyncRunner(deps);
    const result = await runner.runOnce();

    expect(result.status).toBe('completed');
    expect(deps.findSkillBySourceIdentity).toHaveBeenCalledWith({
      source: 'github',
      upstreamId: 'librechat-skills:LibreChat/skills:skills/research',
    });
    expect(deps.createSkill).not.toHaveBeenCalled();
    expect(deps.updateSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          sourceMetadata: expect.objectContaining({
            ref: 'release',
            upstreamId: 'librechat-skills:LibreChat/skills:skills/research',
          }),
          frontmatter: {},
        }),
      }),
    );
  });

  it('refreshes an existing skill version after file sync before updating metadata', async () => {
    const existing = makeSkill({
      name: 'research',
      description: 'Old description',
      author: new Types.ObjectId(),
      authorName: 'GitHub Sync',
      source: 'github',
      sourceMetadata: {
        provider: 'github',
        sourceId: 'librechat-skills',
        upstreamId: 'librechat-skills:LibreChat/skills:skills/research',
        owner: 'LibreChat',
        repo: 'skills',
        ref: 'main',
        skillPath: 'skills/research',
      },
    }) as ISkill & { _id: Types.ObjectId };
    const afterFileSync = { ...existing, version: existing.version + 2 };
    const deps = createDeps({
      findSkillBySourceIdentity: jest.fn(async () => existing),
      getSkillById: jest.fn(async () => afterFileSync),
      updateSkill: jest.fn(async ({ expectedVersion, update }) => ({
        status: 'updated' as const,
        skill: {
          ...afterFileSync,
          ...update,
          version: expectedVersion + 1,
        },
        warnings: [],
      })),
    });
    const runner = createGitHubSkillSyncRunner(deps);
    const result = await runner.runOnce();

    expect(result.status).toBe('completed');
    expect(deps.upsertSkillFile).toHaveBeenCalled();
    expect(deps.getSkillById).toHaveBeenCalledWith(existing._id);
    expect(deps.updateSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        id: existing._id.toString(),
        expectedVersion: afterFileSync.version,
      }),
    );
  });

  it('preserves credential presence when a manual run is skipped by an active lock', async () => {
    const deps = createDeps({
      tryAcquireLock: jest.fn(async () => false),
      listCredentials: jest.fn(async () => [
        {
          provider: 'github',
          credentialKey: 'github-skills-prod',
          credentialPresent: true,
          tokenFingerprint: 'abc123',
        },
      ]),
      listStatuses: jest.fn(async () => [
        {
          provider: 'github',
          sourceId: 'librechat-skills',
          status: 'running',
          credentialKey: 'github-skills-prod',
          owner: 'LibreChat',
          repo: 'skills',
          ref: 'main',
          paths: ['skills'],
          syncedSkillCount: 0,
          syncedFileCount: 0,
          deletedSkillCount: 0,
          deletedFileCount: 0,
        } as ISkillSyncStatus,
      ]),
    });
    const runner = createGitHubSkillSyncRunner(deps);
    const result = await runner.runOnce();

    expect(result.status).toBe('skipped');
    expect(result.sources).toEqual([
      expect.objectContaining({
        sourceId: 'librechat-skills',
        status: 'running',
        credentialPresent: true,
      }),
    ]);
  });

  it('excludes child skill packages from parent synced files', async () => {
    const parentSkillMarkdown = '---\nname: parent\ndescription: Parent skill\n---\nParent';
    const childSkillMarkdown = '---\nname: child\ndescription: Child skill\n---\nChild';
    const fetchFn = jest.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/commits/')) {
        return response({ sha: 'commit-sha', commit: { tree: { sha: 'tree-sha' } } });
      }
      if (url.includes('/git/trees/tree-sha')) {
        return response({
          sha: 'tree-sha',
          truncated: false,
          tree: [
            {
              path: 'skills',
              mode: '040000',
              type: 'tree',
              sha: 'skills-tree-sha',
              url: 'https://api.github.test/tree/skills',
            },
          ],
        });
      }
      if (url.includes('/git/trees/skills-tree-sha')) {
        return response({
          sha: 'skills-tree-sha',
          truncated: false,
          tree: [
            {
              path: 'SKILL.md',
              mode: '100644',
              type: 'blob',
              sha: 'parent-skill-sha',
              size: Buffer.byteLength(parentSkillMarkdown),
              url: 'https://api.github.test/blob/parent-skill',
            },
            {
              path: 'parent.txt',
              mode: '100644',
              type: 'blob',
              sha: 'parent-file-sha',
              size: 6,
              url: 'https://api.github.test/blob/parent-file',
            },
            {
              path: 'child/SKILL.md',
              mode: '100644',
              type: 'blob',
              sha: 'child-skill-sha',
              size: Buffer.byteLength(childSkillMarkdown),
              url: 'https://api.github.test/blob/child-skill',
            },
            {
              path: 'child/child.txt',
              mode: '100644',
              type: 'blob',
              sha: 'child-file-sha',
              size: 5,
              url: 'https://api.github.test/blob/child-file',
            },
          ],
        });
      }
      if (url.includes('/git/blobs/parent-skill-sha')) {
        return response(blob(parentSkillMarkdown));
      }
      if (url.includes('/git/blobs/parent-file-sha')) {
        return response(blob('parent'));
      }
      if (url.includes('/git/blobs/child-skill-sha')) {
        return response(blob(childSkillMarkdown));
      }
      if (url.includes('/git/blobs/child-file-sha')) {
        return response(blob('child'));
      }
      return response({ message: 'not found' }, 404);
    }) as unknown as typeof fetch;
    const deps = createDeps({ fetchFn });
    const runner = createGitHubSkillSyncRunner(deps);
    const result = await runner.runOnce();
    const fileCalls = (deps.upsertSkillFile as jest.Mock).mock.calls.map(
      ([row]: [Parameters<GitHubSkillSyncDeps['upsertSkillFile']>[0]]) => row,
    );

    expect(result.status).toBe('completed');
    expect(fileCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relativePath: 'parent.txt',
          sourceMetadata: expect.objectContaining({
            upstreamId: 'librechat-skills:LibreChat/skills:skills',
          }),
        }),
        expect.objectContaining({
          relativePath: 'child.txt',
          sourceMetadata: expect.objectContaining({
            upstreamId: 'librechat-skills:LibreChat/skills:skills/child',
          }),
        }),
      ]),
    );
    expect(fileCalls).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relativePath: 'child/SKILL.md',
          sourceMetadata: expect.objectContaining({
            upstreamId: 'librechat-skills:LibreChat/skills:skills',
          }),
        }),
        expect.objectContaining({
          relativePath: 'child/child.txt',
          sourceMetadata: expect.objectContaining({
            upstreamId: 'librechat-skills:LibreChat/skills:skills',
          }),
        }),
      ]),
    );
  });

  it('rejects oversized GitHub blobs before downloading file content', async () => {
    const skillMarkdown = '---\nname: research\ndescription: Research things\n---\nBody';
    const oversizedBytes = DEFAULT_SKILL_IMPORT_LIMITS.maxSingleFileBytes + 1;
    const fetchFn = jest.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/commits/')) {
        return response({ sha: 'commit-sha', commit: { tree: { sha: 'tree-sha' } } });
      }
      if (url.includes('/git/trees/tree-sha')) {
        return response({
          sha: 'tree-sha',
          truncated: false,
          tree: [
            {
              path: 'skills',
              mode: '040000',
              type: 'tree',
              sha: 'skills-tree-sha',
              url: 'https://api.github.test/tree/skills',
            },
          ],
        });
      }
      if (url.includes('/git/trees/skills-tree-sha')) {
        return response({
          sha: 'skills-tree-sha',
          truncated: false,
          tree: [
            {
              path: 'research/SKILL.md',
              mode: '100644',
              type: 'blob',
              sha: 'skill-md-sha',
              size: Buffer.byteLength(skillMarkdown),
              url: 'https://api.github.test/blob/skill',
            },
            {
              path: 'research/data.bin',
              mode: '100644',
              type: 'blob',
              sha: 'oversized-file-sha',
              size: oversizedBytes,
              url: 'https://api.github.test/blob/oversized',
            },
          ],
        });
      }
      if (url.includes('/git/blobs/skill-md-sha')) {
        return response(blob(skillMarkdown));
      }
      if (url.includes('/git/blobs/oversized-file-sha')) {
        throw new Error('oversized blob should not be downloaded');
      }
      return response({ message: 'not found' }, 404);
    }) as unknown as typeof fetch;
    const deps = createDeps({ fetchFn });
    const runner = createGitHubSkillSyncRunner(deps);
    const result = await runner.runOnce();
    const fetchedUrls = (fetchFn as unknown as jest.Mock).mock.calls.map(
      ([input]: [RequestInfo | URL]) => input.toString(),
    );

    expect(result.status).toBe('failed');
    expect(fetchedUrls.some((url) => url.includes('/git/blobs/oversized-file-sha'))).toBe(false);
    expect(deps.createSkill).not.toHaveBeenCalled();
    expect(deps.saveBuffer).not.toHaveBeenCalled();
    expect(deps.listSkillsBySource).not.toHaveBeenCalled();
    expect(deps.upsertStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorCode: 'GITHUB_BLOB_TOO_LARGE',
      }),
    );
  });

  it('rejects packages that exceed the skill import entry limit before blob downloads', async () => {
    const skillMarkdown = '---\nname: research\ndescription: Research things\n---\nBody';
    const extraFiles = Array.from(
      { length: DEFAULT_SKILL_IMPORT_LIMITS.maxEntries },
      (_, index) => ({
        path: `research/files/${index}.txt`,
        mode: '100644',
        type: 'blob',
        sha: `file-${index}-sha`,
        size: 1,
        url: `https://api.github.test/blob/file-${index}`,
      }),
    );
    const fetchFn = jest.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/commits/')) {
        return response({ sha: 'commit-sha', commit: { tree: { sha: 'tree-sha' } } });
      }
      if (url.includes('/git/trees/tree-sha')) {
        return response({
          sha: 'tree-sha',
          truncated: false,
          tree: [
            {
              path: 'skills',
              mode: '040000',
              type: 'tree',
              sha: 'skills-tree-sha',
              url: 'https://api.github.test/tree/skills',
            },
          ],
        });
      }
      if (url.includes('/git/trees/skills-tree-sha')) {
        return response({
          sha: 'skills-tree-sha',
          truncated: false,
          tree: [
            {
              path: 'research/SKILL.md',
              mode: '100644',
              type: 'blob',
              sha: 'skill-md-sha',
              size: Buffer.byteLength(skillMarkdown),
              url: 'https://api.github.test/blob/skill',
            },
            ...extraFiles,
          ],
        });
      }
      if (url.includes('/git/blobs/')) {
        throw new Error('blob should not be downloaded');
      }
      return response({ message: 'not found' }, 404);
    }) as unknown as typeof fetch;
    const deps = createDeps({ fetchFn });
    const runner = createGitHubSkillSyncRunner(deps);
    const result = await runner.runOnce();

    expect(result.status).toBe('failed');
    expect(deps.createSkill).not.toHaveBeenCalled();
    expect(deps.saveBuffer).not.toHaveBeenCalled();
    expect(deps.upsertStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorCode: 'GITHUB_TOO_MANY_FILES',
      }),
    );
  });

  it('rolls back a newly created skill when file sync fails before publishing', async () => {
    const deps = createDeps({
      saveBuffer: jest.fn(async () => {
        throw new Error('storage unavailable');
      }),
    });
    const runner = createGitHubSkillSyncRunner(deps);
    const result = await runner.runOnce();

    expect(result.status).toBe('failed');
    expect(deps.createSkill).toHaveBeenCalled();
    expect(deps.grantPermission).not.toHaveBeenCalled();
    expect(deps.upsertSkillFile).not.toHaveBeenCalled();
    expect(deps.deleteSkill).toHaveBeenCalledWith(expect.any(String));
  });

  it('stops syncing after losing the Mongo lock lease', async () => {
    jest.useFakeTimers();
    let releaseToken: (token: string) => void = () => undefined;
    const tokenPromise = new Promise<string>((resolve) => {
      releaseToken = resolve;
    });
    const deps = createDeps({
      getCredentialToken: jest.fn(() => tokenPromise),
      refreshLock: jest.fn(async () => false),
    });
    const runner = createGitHubSkillSyncRunner(deps);

    try {
      const runPromise = runner.runOnce();
      await jest.advanceTimersByTimeAsync(10 * 60 * 1000);
      releaseToken('github_pat_secret');
      const result = await runPromise;

      expect(result.status).toBe('failed');
      expect(result.message).toBe('GitHub skill sync lock was lost');
      expect(deps.fetchFn).not.toHaveBeenCalled();
      expect(deps.upsertStatus).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: 'failed',
          errorCode: 'SYNC_LOCK_LOST',
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
