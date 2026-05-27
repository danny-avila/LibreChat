import { Types } from 'mongoose';
import type {
  ISkill,
  ISkillFile,
  CreateSkillInput,
  CreateSkillResult,
  ISkillSyncStatus,
  SkillSyncStatusInput,
} from '@librechat/data-schemas';
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
            path: 'skills/research/SKILL.md',
            mode: '100644',
            type: 'blob',
            sha: 'skill-md-sha',
            url: 'https://api.github.test/blob/skill',
          },
          {
            path: 'skills/research/scripts/run.sh',
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

    expect(result.status).toBe('completed');
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
        }),
      }),
    );
  });
});
