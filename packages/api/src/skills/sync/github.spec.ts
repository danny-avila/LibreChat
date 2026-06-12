import crypto from 'crypto';
import { Types } from 'mongoose';
import { getTenantId } from '@librechat/data-schemas';
import type {
  ISkill,
  ISkillFile,
  CreateSkillInput,
  CreateSkillResult,
  ISkillSyncStatus,
  SkillSyncStatusInput,
  UpdateSkillInput,
  UpdateSkillResult,
} from '@librechat/data-schemas';
import type { GitHubSkillSyncDeps } from './github';
import { DEFAULT_SKILL_IMPORT_LIMITS } from '../limits';
import { createGitHubSkillSyncRunner } from './github';

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
    tenantId: input.tenantId,
  };
}

function makeSkillFile(
  skill: ISkill & { _id: Types.ObjectId },
  overrides: Partial<ISkillFile> = {},
): ISkillFile & { _id: Types.ObjectId } {
  return {
    _id: new Types.ObjectId(),
    skillId: skill._id,
    relativePath: 'scripts/run.sh',
    file_id: 'old-file-id',
    filename: 'run.sh',
    filepath: '/uploads/old-file-id__run.sh',
    source: 'local',
    sourceMetadata: {
      provider: 'github',
      sourceId: 'librechat-skills',
      upstreamId: 'librechat-skills:skills/research',
      commitSha: 'old-commit-sha',
      blobSha: 'old-file-sha',
      path: 'skills/research/scripts/run.sh',
    },
    mimeType: 'application/x-sh',
    bytes: 7,
    category: 'script',
    isExecutable: false,
    author: skill.author,
    ...overrides,
  };
}

function makeSourceAuthorId(sourceId = 'librechat-skills', tenantId?: string): Types.ObjectId {
  const seed = tenantId ? `github:${sourceId}:${tenantId}` : `github:${sourceId}`;
  return new Types.ObjectId(crypto.createHash('sha256').update(seed).digest('hex').slice(0, 24));
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
      provider: 'github' as const,
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
        tenantId: input.tenantId,
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
          upstreamId: 'librechat-skills:skills/research',
          skillBlobSha: 'skill-md-sha',
        }),
      }),
    );
    expect(deps.upsertSkillFile).toHaveBeenCalledWith(
      expect.objectContaining({
        relativePath: 'scripts/run.sh',
        sourceMetadata: expect.objectContaining({
          upstreamId: 'librechat-skills:skills/research',
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

  it('drops an invalid alwaysApply alias when canonical always-apply is valid', async () => {
    const deps = createDeps({
      fetchFn: githubFetch(
        '---\nname: research\ndescription: Research things\nalways-apply: true\nalwaysApply: yes\n---\nBody',
      ),
    });
    const runner = createGitHubSkillSyncRunner(deps);
    const result = await runner.runOnce();

    expect(result.status).toBe('completed');
    expect(deps.createSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        alwaysApply: true,
        frontmatter: { 'always-apply': true },
      }),
    );
  });

  it('fails duplicate discovered skill names before publishing partial mirrors', async () => {
    const duplicateFetch = jest.fn(async (input: RequestInfo | URL) => {
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
              sha: 'skill-a-sha',
              size: 50,
              url: 'https://api.github.test/blob/skill-a',
            },
            {
              path: 'analysis/SKILL.md',
              mode: '100644',
              type: 'blob',
              sha: 'skill-b-sha',
              size: 50,
              url: 'https://api.github.test/blob/skill-b',
            },
          ],
        });
      }
      if (url.includes('/git/blobs/skill-a-sha')) {
        return response(blob('---\nname: duplicate\ndescription: First\n---\nBody'));
      }
      if (url.includes('/git/blobs/skill-b-sha')) {
        return response(blob('---\nname: duplicate\ndescription: Second\n---\nBody'));
      }
      return response({ message: 'not found' }, 404);
    }) as unknown as typeof fetch;
    const deps = createDeps({ fetchFn: duplicateFetch });
    const runner = createGitHubSkillSyncRunner(deps);
    const result = await runner.runOnce();

    expect(result.status).toBe('failed');
    expect(deps.createSkill).not.toHaveBeenCalled();
    expect(deps.updateSkill).not.toHaveBeenCalled();
    expect(deps.upsertStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorCode: 'DUPLICATE_SKILL_NAME',
        errorMessage: 'GitHub source "librechat-skills" contains multiple skills named "duplicate"',
      }),
    );
  });

  it('fails duplicate root and nested skill names before publishing partial mirrors', async () => {
    const duplicateFetch = jest.fn(async (input: RequestInfo | URL) => {
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
              path: 'SKILL.md',
              mode: '100644',
              type: 'blob',
              sha: 'root-skill-sha',
              size: 50,
              url: 'https://api.github.test/blob/root-skill',
            },
            {
              path: 'child/SKILL.md',
              mode: '100644',
              type: 'blob',
              sha: 'child-skill-sha',
              size: 50,
              url: 'https://api.github.test/blob/child-skill',
            },
          ],
        });
      }
      if (url.includes('/git/blobs/root-skill-sha')) {
        return response(blob('---\nname: duplicate\ndescription: Root\n---\nBody'));
      }
      if (url.includes('/git/blobs/child-skill-sha')) {
        return response(blob('---\nname: duplicate\ndescription: Child\n---\nBody'));
      }
      return response({ message: 'not found' }, 404);
    }) as unknown as typeof fetch;
    const deps = createDeps({
      fetchFn: duplicateFetch,
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
              paths: [''],
              credentialKey: 'github-skills-prod',
            },
          ],
        },
      }),
    });
    const runner = createGitHubSkillSyncRunner(deps);
    const result = await runner.runOnce();

    expect(result.status).toBe('failed');
    expect(deps.createSkill).not.toHaveBeenCalled();
    expect(deps.updateSkill).not.toHaveBeenCalled();
    expect(deps.upsertStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorCode: 'DUPLICATE_SKILL_NAME',
        errorMessage: 'GitHub source "librechat-skills" contains multiple skills named "duplicate"',
      }),
    );
  });

  it('discovers nested skill roots within the configured discovery depth', async () => {
    const skillMarkdown = '---\nname: tdd\ndescription: Test-driven development\n---\nBody';
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
              path: 'engineering/tdd/SKILL.md',
              mode: '100644',
              type: 'blob',
              sha: 'skill-md-sha',
              size: Buffer.byteLength(skillMarkdown),
              url: 'https://api.github.test/blob/skill',
            },
            {
              path: 'engineering/tdd/tests.md',
              mode: '100644',
              type: 'blob',
              sha: 'tests-md-sha',
              size: 5,
              url: 'https://api.github.test/blob/tests',
            },
          ],
        });
      }
      if (url.includes('/git/blobs/skill-md-sha')) {
        return response(blob(skillMarkdown));
      }
      if (url.includes('/git/blobs/tests-md-sha')) {
        return response(blob('tests'));
      }
      return response({ message: 'not found' }, 404);
    }) as unknown as typeof fetch;
    const deps = createDeps({
      fetchFn,
      getConfig: () => ({
        github: {
          enabled: true,
          intervalMinutes: 60,
          runOnStartup: false,
          sources: [
            {
              id: 'mattpocock-skills',
              owner: 'mattpocock',
              repo: 'skills',
              ref: 'main',
              paths: ['skills'],
              skillDiscoveryDepth: 2,
              credentialKey: 'github-skills-prod',
            },
          ],
        },
      }),
    });
    const runner = createGitHubSkillSyncRunner(deps);
    const result = await runner.runOnce();

    expect(result.status).toBe('completed');
    expect(deps.createSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'tdd',
        sourceMetadata: expect.objectContaining({
          sourceId: 'mattpocock-skills',
          upstreamId: 'mattpocock-skills:skills/engineering/tdd',
        }),
      }),
    );
    expect(deps.upsertSkillFile).toHaveBeenCalledWith(
      expect.objectContaining({
        relativePath: 'tests.md',
        sourceMetadata: expect.objectContaining({
          path: 'skills/engineering/tdd/tests.md',
        }),
      }),
    );
  });

  it('uses an env-backed source token without loading a stored credential', async () => {
    const previousToken = process.env.GITHUB_SKILLS_TOKEN;
    process.env.GITHUB_SKILLS_TOKEN = 'github_pat_from_env';
    const getCredentialToken = jest.fn(async () => 'github_pat_from_db');
    const deps = createDeps({
      getCredentialToken,
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
              token: '${GITHUB_SKILLS_TOKEN}',
            },
          ],
        },
      }),
    });
    const runner = createGitHubSkillSyncRunner(deps);

    try {
      const status = await runner.getStatus();
      const result = await runner.runOnce();

      expect(status.sources[0]?.credentialPresent).toBe(true);
      expect(result.status).toBe('completed');
      expect(getCredentialToken).not.toHaveBeenCalled();
      expect(deps.createSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceMetadata: expect.objectContaining({ sourceId: 'librechat-skills' }),
        }),
      );
    } finally {
      if (previousToken == null) {
        delete process.env.GITHUB_SKILLS_TOKEN;
      } else {
        process.env.GITHUB_SKILLS_TOKEN = previousToken;
      }
    }
  });

  it('does not list or resolve server credentials and skips runs when they are disabled', async () => {
    const previousToken = process.env.GITHUB_SKILLS_TOKEN;
    process.env.GITHUB_SKILLS_TOKEN = 'github_pat_from_env';
    const getCredentialToken = jest.fn(async () => 'github_pat_from_db');
    const listCredentials = jest.fn(async () => [
      {
        provider: 'github' as const,
        credentialKey: 'github-skills-prod',
        credentialPresent: true,
        tokenFingerprint: 'abc123',
      },
    ]);
    const deps = createDeps({
      allowServerCredentials: false,
      getCredentialToken,
      listCredentials,
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
              token: '${GITHUB_SKILLS_TOKEN}',
            },
            {
              id: 'stored-credential-skills',
              owner: 'LibreChat',
              repo: 'skills',
              ref: 'main',
              paths: ['skills'],
              credentialKey: 'github-skills-prod',
            },
          ],
        },
      }),
    });
    const runner = createGitHubSkillSyncRunner(deps);

    try {
      const status = await runner.getStatus();
      const result = await runner.runOnce();

      expect(status.credentials).toEqual([]);
      expect(status.sources).toEqual([
        expect.objectContaining({ sourceId: 'librechat-skills', credentialPresent: false }),
        expect.objectContaining({
          sourceId: 'stored-credential-skills',
          credentialPresent: false,
        }),
      ]);
      expect(result.status).toBe('skipped');
      expect(result.message).toBe(
        'GitHub skill sync credentials are not available for this runner',
      );
      expect(result.sources).toEqual([
        expect.objectContaining({ sourceId: 'librechat-skills', credentialPresent: false }),
        expect.objectContaining({
          sourceId: 'stored-credential-skills',
          credentialPresent: false,
        }),
      ]);
      expect(listCredentials).not.toHaveBeenCalled();
      expect(getCredentialToken).not.toHaveBeenCalled();
      expect(deps.fetchFn).not.toHaveBeenCalled();
      expect(deps.tryAcquireLock).not.toHaveBeenCalled();
      expect(deps.upsertStatus).not.toHaveBeenCalled();
    } finally {
      if (previousToken == null) {
        delete process.env.GITHUB_SKILLS_TOKEN;
      } else {
        process.env.GITHUB_SKILLS_TOKEN = previousToken;
      }
    }
  });

  it('preserves slash-delimited refs when fetching the GitHub commit', async () => {
    const baseFetch = githubFetch();
    const fetchFn = jest.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/commits/')) {
        expect(url).toContain('/commits/heads/release/2026-05');
        expect(url).not.toContain('heads%2Frelease%2F2026-05');
      }
      return baseFetch(input);
    }) as unknown as typeof fetch;
    const deps = createDeps({
      fetchFn,
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
              ref: 'heads/release/2026-05',
              paths: ['skills'],
              credentialKey: 'github-skills-prod',
            },
          ],
        },
      }),
    });
    const result = await createGitHubSkillSyncRunner(deps).runOnce();

    expect(result.status).toBe('completed');
    expect(fetchFn).toHaveBeenCalled();
  });

  it('runs a tenant-scoped source inside its tenant context and stamps the skill tenantId', async () => {
    let observedTenantId: string | undefined = 'unset';
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
              ref: 'main',
              paths: ['skills'],
              credentialKey: 'github-skills-prod',
              tenantId: 'tenant-a',
            },
          ],
        },
      }),
      createSkill: jest.fn(async (input: CreateSkillInput): Promise<CreateSkillResult> => {
        observedTenantId = getTenantId();
        return { skill: makeSkill(input), warnings: [] };
      }),
    });
    const runner = createGitHubSkillSyncRunner(deps);
    const result = await runner.runOnce();

    expect(result.status).toBe('completed');
    expect(observedTenantId).toBe('tenant-a');
    expect(deps.findSkillBySourceIdentity).toHaveBeenCalledWith({
      source: 'github',
      upstreamId: 'librechat-skills:skills/research',
      tenantId: 'tenant-a',
    });
    expect(deps.createSkill).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'research', tenantId: 'tenant-a' }),
    );
    expect(deps.upsertStatus).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: 'librechat-skills', tenantId: 'tenant-a' }),
    );
    const [lockParams] = (deps.tryAcquireLock as jest.Mock).mock.calls[0];
    expect(lockParams).not.toHaveProperty('tenantId');
  });

  it('matches stored source status by tenant and source id', async () => {
    const deps = createDeps({
      listStatuses: jest.fn(async () => [
        {
          provider: 'github',
          sourceId: 'librechat-skills',
          tenantId: 'tenant-a',
          status: 'succeeded',
          syncedSkillCount: 1,
          syncedFileCount: 2,
          deletedSkillCount: 0,
          deletedFileCount: 0,
        } as ISkillSyncStatus,
        {
          provider: 'github',
          sourceId: 'librechat-skills',
          tenantId: 'tenant-b',
          status: 'failed',
          errorCode: 'OTHER_TENANT',
          syncedSkillCount: 0,
          syncedFileCount: 0,
          deletedSkillCount: 0,
          deletedFileCount: 0,
        } as ISkillSyncStatus,
      ]),
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
              tenantId: 'tenant-b',
            },
          ],
        },
      }),
    });

    const status = await createGitHubSkillSyncRunner(deps).getStatus();

    expect(status.sources[0]).toEqual(
      expect.objectContaining({
        sourceId: 'librechat-skills',
        tenantId: 'tenant-b',
        status: 'failed',
        errorCode: 'OTHER_TENANT',
      }),
    );
  });

  it('runs in the ambient context when a source has no configured tenantId', async () => {
    let observedTenantId: string | undefined = 'unset';
    const deps = createDeps({
      createSkill: jest.fn(async (input: CreateSkillInput): Promise<CreateSkillResult> => {
        observedTenantId = getTenantId();
        return { skill: makeSkill(input), warnings: [] };
      }),
    });
    const runner = createGitHubSkillSyncRunner(deps);
    const result = await runner.runOnce();

    expect(result.status).toBe('completed');
    expect(observedTenantId).toBeUndefined();
    expect(deps.createSkill).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'research', tenantId: undefined }),
    );
  });

  it('scopes mirror cleanup to the current source and deletes only its absent upstream skills', async () => {
    const keptId = new Types.ObjectId();
    const staleId = new Types.ObjectId();
    const existingSkill = (upstreamId: string, _id: Types.ObjectId) => {
      const skill = makeSkill({
        name: 'research',
        description: 'Research things',
        author: new Types.ObjectId(),
        authorName: 'GitHub Sync',
        source: 'github',
        sourceMetadata: { provider: 'github', sourceId: 'librechat-skills', upstreamId },
      });
      skill._id = _id;
      return skill;
    };
    const listSkillsBySource = jest.fn(async () => [
      existingSkill('librechat-skills:skills/research', keptId),
      existingSkill('librechat-skills:skills/removed', staleId),
    ]);
    const deps = createDeps({ listSkillsBySource });
    const runner = createGitHubSkillSyncRunner(deps);
    const result = await runner.runOnce();

    expect(result.status).toBe('completed');
    expect(listSkillsBySource).toHaveBeenCalledWith({
      source: 'github',
      sourceId: 'librechat-skills',
    });
    expect(deps.deleteSkill).toHaveBeenCalledTimes(1);
    expect(deps.deleteSkill).toHaveBeenCalledWith(staleId.toString());
  });

  it('deletes stale name-conflicting mirrors after file sync and before same-commit renames', async () => {
    const staleId = new Types.ObjectId();
    const existingId = new Types.ObjectId();
    const author = makeSourceAuthorId();
    const existingSkill = (
      upstreamId: string,
      _id: Types.ObjectId,
      name: string,
    ): ISkill & { _id: Types.ObjectId } => {
      const skill = makeSkill({
        name,
        description: `${name} skill`,
        body: 'Old body',
        author,
        authorName: 'GitHub Sync',
        source: 'github',
        sourceMetadata: { provider: 'github', sourceId: 'librechat-skills', upstreamId },
      });
      skill._id = _id;
      return skill;
    };
    const staleSkill = existingSkill('librechat-skills:skills/removed', staleId, 'renamed');
    const syncedSkill = existingSkill('librechat-skills:skills/research', existingId, 'research');
    const existingById = new Map([[existingId.toString(), syncedSkill]]);
    const deletedIds = new Set<string>();
    const listSkillsBySource = jest.fn(async () =>
      [staleSkill, syncedSkill].filter((skill) => !deletedIds.has(skill._id.toString())),
    );
    const deleteSkill = jest.fn(async (id: string) => {
      deletedIds.add(id);
      return { deleted: true };
    });
    const updateSkill = jest.fn(
      async ({
        id,
        update,
      }: {
        id: string;
        expectedVersion: number;
        update: UpdateSkillInput;
      }): Promise<UpdateSkillResult> => {
        if (!deletedIds.has(staleId.toString()) && update.name === 'renamed') {
          throw new Error('duplicate key');
        }
        const skill = existingById.get(id);
        if (!skill) {
          return { status: 'not_found' as const };
        }
        const updated = { ...skill, ...update, version: skill.version + 1 };
        existingById.set(id, updated);
        return { status: 'updated' as const, skill: updated, warnings: [] };
      },
    );
    const deps = createDeps({
      fetchFn: githubFetch('---\nname: renamed\ndescription: Renamed skill\n---\nBody'),
      findSkillBySourceIdentity: jest.fn(async ({ upstreamId }) =>
        upstreamId === 'librechat-skills:skills/research' ? syncedSkill : null,
      ),
      getSkillById: jest.fn(async (id) => existingById.get(id.toString()) ?? null),
      listSkillsBySource,
      deleteSkill,
      updateSkill,
    });
    const runner = createGitHubSkillSyncRunner(deps);
    const result = await runner.runOnce();

    expect(result.status).toBe('completed');
    expect(deleteSkill).toHaveBeenCalledWith(staleId.toString());
    expect(updateSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        id: existingId.toString(),
        update: expect.objectContaining({ name: 'renamed' }),
      }),
    );
    expect((deps.upsertSkillFile as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      deleteSkill.mock.invocationCallOrder[0],
    );
    expect(deleteSkill.mock.invocationCallOrder[0]).toBeLessThan(
      updateSkill.mock.invocationCallOrder[0],
    );
  });

  it('does not delete stale name-conflicting mirrors before another skill file sync fails', async () => {
    const renamedMarkdown = '---\nname: renamed\ndescription: Renamed skill\n---\nBody';
    const brokenMarkdown = '---\nname: broken\ndescription: Broken skill\n---\nBody';
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
              sha: 'research-skill-sha',
              size: Buffer.byteLength(renamedMarkdown),
              url: 'https://api.github.test/blob/research-skill',
            },
            {
              path: 'research/scripts/run.sh',
              mode: '100644',
              type: 'blob',
              sha: 'research-file-sha',
              size: 7,
              url: 'https://api.github.test/blob/research-file',
            },
            {
              path: 'broken/SKILL.md',
              mode: '100644',
              type: 'blob',
              sha: 'broken-skill-sha',
              size: Buffer.byteLength(brokenMarkdown),
              url: 'https://api.github.test/blob/broken-skill',
            },
            {
              path: 'broken/scripts/run.sh',
              mode: '100644',
              type: 'blob',
              sha: 'broken-file-sha',
              size: 7,
              url: 'https://api.github.test/blob/broken-file',
            },
          ],
        });
      }
      if (url.includes('/git/blobs/research-skill-sha')) {
        return response(blob(renamedMarkdown));
      }
      if (url.includes('/git/blobs/broken-skill-sha')) {
        return response(blob(brokenMarkdown));
      }
      if (url.includes('/git/blobs/research-file-sha')) {
        return response(blob('echo ok'));
      }
      if (url.includes('/git/blobs/broken-file-sha')) {
        return response(blob('echo ok'));
      }
      return response({ message: 'not found' }, 404);
    }) as unknown as typeof fetch;
    const staleId = new Types.ObjectId();
    const existingId = new Types.ObjectId();
    const author = makeSourceAuthorId();
    const makeExisting = (
      upstreamId: string,
      _id: Types.ObjectId,
      name: string,
    ): ISkill & { _id: Types.ObjectId } => {
      const skill = makeSkill({
        name,
        description: `${name} skill`,
        body: 'Old body',
        author,
        authorName: 'GitHub Sync',
        source: 'github',
        sourceMetadata: { provider: 'github', sourceId: 'librechat-skills', upstreamId },
      });
      skill._id = _id;
      return skill;
    };
    const staleSkill = makeExisting('librechat-skills:skills/removed', staleId, 'renamed');
    const syncedSkill = makeExisting('librechat-skills:skills/research', existingId, 'research');
    const createdIds: string[] = [];
    const deleteSkill = jest.fn(async (id: string) => ({ deleted: createdIds.includes(id) }));
    const deps = createDeps({
      fetchFn,
      findSkillBySourceIdentity: jest.fn(async ({ upstreamId }) =>
        upstreamId === 'librechat-skills:skills/research' ? syncedSkill : null,
      ),
      getSkillById: jest.fn(async (id) =>
        id.toString() === existingId.toString() ? syncedSkill : null,
      ),
      listSkillsBySource: jest.fn(async () => [staleSkill, syncedSkill]),
      createSkill: jest.fn(async (input: CreateSkillInput): Promise<CreateSkillResult> => {
        const skill = makeSkill(input);
        createdIds.push(skill._id.toString());
        return { skill, warnings: [] };
      }),
      saveBuffer: jest.fn(async () => {
        throw new Error('storage unavailable');
      }),
      deleteSkill,
      updateSkill: jest.fn(),
    });
    const runner = createGitHubSkillSyncRunner(deps);
    const result = await runner.runOnce();

    expect(result.status).toBe('failed');
    expect(deleteSkill).not.toHaveBeenCalledWith(staleId.toString());
    expect(deps.updateSkill).not.toHaveBeenCalled();
    expect(deps.upsertStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorMessage: 'storage unavailable',
      }),
    );
  });

  it('restores a stale name-conflicting mirror when the rename update fails after deletion', async () => {
    const staleId = new Types.ObjectId();
    const existingId = new Types.ObjectId();
    const author = makeSourceAuthorId();
    const makeExisting = (
      upstreamId: string,
      _id: Types.ObjectId,
      name: string,
    ): ISkill & { _id: Types.ObjectId } => {
      const skill = makeSkill({
        name,
        description: `${name} skill`,
        body: 'Old body',
        author,
        authorName: 'GitHub Sync',
        source: 'github',
        sourceMetadata: { provider: 'github', sourceId: 'librechat-skills', upstreamId },
      });
      skill._id = _id;
      return skill;
    };
    const staleSkill = makeExisting('librechat-skills:skills/removed', staleId, 'renamed');
    const syncedSkill = makeExisting('librechat-skills:skills/research', existingId, 'research');
    const deletedIds = new Set<string>();
    let restoredSkill: (ISkill & { _id: Types.ObjectId }) | undefined;
    const createSkill = jest.fn(async (input: CreateSkillInput): Promise<CreateSkillResult> => {
      restoredSkill = makeSkill(input);
      return { skill: restoredSkill, warnings: [] };
    });
    const deleteSkill = jest.fn(async (id: string) => {
      deletedIds.add(id);
      return { deleted: true };
    });
    const deps = createDeps({
      fetchFn: githubFetch('---\nname: renamed\ndescription: Renamed skill\n---\nBody'),
      findSkillBySourceIdentity: jest.fn(async ({ upstreamId }) =>
        upstreamId === 'librechat-skills:skills/research' ? syncedSkill : null,
      ),
      getSkillById: jest.fn(async (id) =>
        id.toString() === existingId.toString() ? syncedSkill : null,
      ),
      listSkillsBySource: jest.fn(async () =>
        [staleSkill, syncedSkill].filter((skill) => !deletedIds.has(skill._id.toString())),
      ),
      createSkill,
      deleteSkill,
      updateSkill: jest.fn(async () => ({ status: 'conflict' as const, current: syncedSkill })),
    });
    const runner = createGitHubSkillSyncRunner(deps);
    const result = await runner.runOnce();

    expect(result.status).toBe('failed');
    expect(deleteSkill).toHaveBeenCalledWith(staleId.toString());
    expect(createSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'renamed',
        sourceMetadata: expect.objectContaining({
          upstreamId: 'librechat-skills:skills/removed',
        }),
      }),
    );
    expect(deps.grantPermission).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: restoredSkill?._id }),
    );
  });

  it("does not mirror-delete another tenant's skills from an ambient source run", async () => {
    const ambientStaleId = new Types.ObjectId();
    const otherTenantId = new Types.ObjectId();
    const makeExisting = (
      upstreamId: string,
      _id: Types.ObjectId,
      tenantId?: string,
    ): ISkill & { _id: Types.ObjectId } => {
      const skill = makeSkill({
        name: 'research',
        description: 'Research things',
        author: new Types.ObjectId(),
        authorName: 'GitHub Sync',
        source: 'github',
        sourceMetadata: { provider: 'github', sourceId: 'librechat-skills', upstreamId },
      });
      skill._id = _id;
      skill.tenantId = tenantId;
      return skill;
    };
    // The configured source is ambient (no tenantId), but listSkillsBySource
    // (non-strict) returns a skill owned by tenant-b. It must not be deleted.
    const listSkillsBySource = jest.fn(async () => [
      makeExisting('librechat-skills:skills/removed', ambientStaleId, undefined),
      makeExisting('librechat-skills:skills/removed', otherTenantId, 'tenant-b'),
    ]);
    const deps = createDeps({ listSkillsBySource });
    const runner = createGitHubSkillSyncRunner(deps);
    const result = await runner.runOnce();

    expect(result.status).toBe('completed');
    expect(deps.deleteSkill).toHaveBeenCalledTimes(1);
    expect(deps.deleteSkill).toHaveBeenCalledWith(ambientStaleId.toString());
    expect(deps.deleteSkill).not.toHaveBeenCalledWith(otherTenantId.toString());
  });

  it('derives distinct synthetic authors for the same source mirrored into different tenants', async () => {
    const authorForTenant = async (tenantId: string): Promise<string> => {
      let author = '';
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
                ref: 'main',
                paths: ['skills'],
                credentialKey: 'github-skills-prod',
                tenantId,
              },
            ],
          },
        }),
        createSkill: jest.fn(async (input: CreateSkillInput): Promise<CreateSkillResult> => {
          author = input.author.toString();
          return { skill: makeSkill(input), warnings: [] };
        }),
      });
      await createGitHubSkillSyncRunner(deps).runOnce();
      return author;
    };

    const [authorA, authorB] = [
      await authorForTenant('tenant-a'),
      await authorForTenant('tenant-b'),
    ];
    expect(authorA).not.toBe('');
    expect(authorA).not.toBe(authorB);
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
        upstreamId: 'librechat-skills:skills/research',
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
      upstreamId: 'librechat-skills:skills/research',
      tenantId: undefined,
    });
    expect(deps.createSkill).not.toHaveBeenCalled();
    expect(deps.updateSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          sourceMetadata: expect.objectContaining({
            ref: 'release',
            upstreamId: 'librechat-skills:skills/research',
          }),
          frontmatter: {},
        }),
      }),
    );
  });

  it('ignores source identity matches from a different tenant bucket', async () => {
    const otherTenantSkill = makeSkill({
      name: 'research',
      description: 'Tenant skill',
      author: makeSourceAuthorId('librechat-skills', 'tenant-b'),
      authorName: 'GitHub Sync',
      frontmatter: {},
      source: 'github',
      tenantId: 'tenant-b',
      sourceMetadata: {
        provider: 'github',
        sourceId: 'librechat-skills',
        upstreamId: 'librechat-skills:skills/research',
        owner: 'LibreChat',
        repo: 'skills',
        ref: 'main',
        skillPath: 'skills/research',
      },
    }) as ISkill & { _id: Types.ObjectId };
    const deps = createDeps({
      findSkillBySourceIdentity: jest.fn(async () => otherTenantSkill),
      listSkillsBySource: jest.fn(async () => [otherTenantSkill]),
    });
    const runner = createGitHubSkillSyncRunner(deps);
    const result = await runner.runOnce();

    expect(result.status).toBe('completed');
    expect(deps.createSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'research',
        tenantId: undefined,
      }),
    );
    expect(deps.updateSkill).not.toHaveBeenCalled();
    expect(deps.deleteSkill).not.toHaveBeenCalledWith(otherTenantSkill._id.toString());
  });

  it('does not match still-discovered mirrors as moved skills when new skills sync first', async () => {
    const newSkillMarkdown = '---\nname: research\ndescription: New research skill\n---\nNew';
    const renamedSkillMarkdown = '---\nname: renamed\ndescription: Renamed skill\n---\nRenamed';
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
              path: 'new/SKILL.md',
              mode: '100644',
              type: 'blob',
              sha: 'new-skill-sha',
              size: Buffer.byteLength(newSkillMarkdown),
              url: 'https://api.github.test/blob/new-skill',
            },
            {
              path: 'research/SKILL.md',
              mode: '100644',
              type: 'blob',
              sha: 'renamed-skill-sha',
              size: Buffer.byteLength(renamedSkillMarkdown),
              url: 'https://api.github.test/blob/renamed-skill',
            },
          ],
        });
      }
      if (url.includes('/git/blobs/new-skill-sha')) {
        return response(blob(newSkillMarkdown));
      }
      if (url.includes('/git/blobs/renamed-skill-sha')) {
        return response(blob(renamedSkillMarkdown));
      }
      return response({ message: 'not found' }, 404);
    }) as unknown as typeof fetch;
    const existing = makeSkill({
      name: 'research',
      description: 'Old research skill',
      body: 'Old body',
      author: makeSourceAuthorId(),
      authorName: 'GitHub Sync',
      source: 'github',
      sourceMetadata: {
        provider: 'github',
        sourceId: 'librechat-skills',
        upstreamId: 'librechat-skills:skills/research',
        owner: 'LibreChat',
        repo: 'skills',
        ref: 'main',
        skillPath: 'skills/research',
      },
    }) as ISkill & { _id: Types.ObjectId };
    const deps = createDeps({
      fetchFn,
      findSkillBySourceIdentity: jest.fn(async ({ upstreamId }) =>
        upstreamId === 'librechat-skills:skills/research' ? existing : null,
      ),
      listSkillsBySource: jest.fn(async () => [existing]),
      getSkillById: jest.fn(async (id) =>
        id.toString() === existing._id.toString() ? existing : null,
      ),
      updateSkill: jest.fn(async ({ update }) => ({
        status: 'updated' as const,
        skill: { ...existing, ...update, version: existing.version + 1 },
        warnings: [],
      })),
    });
    const runner = createGitHubSkillSyncRunner(deps);
    const result = await runner.runOnce();

    expect(result.status).toBe('completed');
    expect(deps.createSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'research',
        sourceMetadata: expect.objectContaining({
          upstreamId: 'librechat-skills:skills/new',
        }),
      }),
    );
    expect(deps.updateSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        id: existing._id.toString(),
        update: expect.objectContaining({
          name: 'renamed',
          sourceMetadata: expect.objectContaining({
            upstreamId: 'librechat-skills:skills/research',
          }),
        }),
      }),
    );
  });

  it('reuses a same-named source mirror when a skill moves configured paths', async () => {
    const existing = makeSkill({
      name: 'research',
      description: 'Old description',
      author: makeSourceAuthorId(),
      authorName: 'GitHub Sync',
      frontmatter: {},
      source: 'github',
      sourceMetadata: {
        provider: 'github',
        sourceId: 'librechat-skills',
        upstreamId: 'librechat-skills:skills/old-research',
        owner: 'LibreChat',
        repo: 'skills',
        ref: 'main',
        skillPath: 'skills/old-research',
      },
    }) as ISkill & { _id: Types.ObjectId };
    const unchangedFile = makeSkillFile(existing, {
      sourceMetadata: {
        provider: 'github',
        sourceId: 'librechat-skills',
        upstreamId: 'librechat-skills:skills/old-research',
        commitSha: 'old-commit-sha',
        blobSha: 'file-sha',
        path: 'skills/old-research/scripts/run.sh',
      },
    });
    const deps = createDeps({
      findSkillBySourceIdentity: jest.fn(async () => null),
      listSkillsBySource: jest.fn(async () => [existing]),
      getSkillById: jest.fn(async () => existing),
      getSkillFileByPath: jest.fn(async () => unchangedFile),
      listSkillFiles: jest.fn(async () => [unchangedFile]),
      updateSkill: jest.fn(async ({ update }) => {
        Object.assign(existing, update, { version: existing.version + 1 });
        return { status: 'updated' as const, skill: existing, warnings: [] };
      }),
    });
    const runner = createGitHubSkillSyncRunner(deps);
    const result = await runner.runOnce();

    expect(result.status).toBe('completed');
    expect(deps.createSkill).not.toHaveBeenCalled();
    expect(deps.updateSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        id: existing._id.toString(),
        update: expect.objectContaining({
          sourceMetadata: expect.objectContaining({
            upstreamId: 'librechat-skills:skills/research',
            skillPath: 'skills/research',
          }),
        }),
      }),
    );
    expect(deps.deleteSkill).not.toHaveBeenCalled();
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
        upstreamId: 'librechat-skills:skills/research',
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

  it('treats frontmatter-only edits during sync as conflicts', async () => {
    const existing = makeSkill({
      name: 'research',
      description: 'Old description',
      body: 'Old body',
      frontmatter: { 'allowed-tools': ['old-tool'] },
      author: new Types.ObjectId(),
      authorName: 'GitHub Sync',
      source: 'github',
      sourceMetadata: {
        provider: 'github',
        sourceId: 'librechat-skills',
        upstreamId: 'librechat-skills:skills/research',
        owner: 'LibreChat',
        repo: 'skills',
        ref: 'main',
        skillPath: 'skills/research',
      },
    }) as ISkill & { _id: Types.ObjectId };
    const edited = {
      ...existing,
      version: existing.version + 1,
      frontmatter: { 'allowed-tools': ['user-tool'] },
    };
    const deps = createDeps({
      findSkillBySourceIdentity: jest.fn(async () => existing),
      getSkillById: jest.fn(async () => edited),
    });
    const runner = createGitHubSkillSyncRunner(deps);
    const result = await runner.runOnce();

    expect(result.status).toBe('failed');
    expect(deps.upsertSkillFile).not.toHaveBeenCalled();
    expect(deps.updateSkill).not.toHaveBeenCalled();
    expect(deps.upsertStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorCode: 'SKILL_CONFLICT',
      }),
    );
  });

  it('skips existing skill updates when the upstream package is unchanged', async () => {
    const skillMarkdown = '---\nname: research\ndescription: Research things\n---\nBody';
    const existing = makeSkill({
      name: 'research',
      description: 'Research things',
      body: skillMarkdown,
      frontmatter: {},
      author: new Types.ObjectId(),
      authorName: 'GitHub Sync',
      source: 'github',
      sourceMetadata: {
        provider: 'github',
        sourceId: 'librechat-skills',
        upstreamId: 'librechat-skills:skills/research',
        owner: 'LibreChat',
        repo: 'skills',
        ref: 'main',
        skillPath: 'skills/research',
        commitSha: 'old-commit-sha',
        skillBlobSha: 'skill-md-sha',
        syncedAt: '2026-05-30T00:00:00.000Z',
        syncStatus: 'synced',
      },
    }) as ISkill & { _id: Types.ObjectId };
    const unchangedFile = makeSkillFile(existing, {
      sourceMetadata: {
        provider: 'github',
        sourceId: 'librechat-skills',
        upstreamId: 'librechat-skills:skills/research',
        commitSha: 'old-commit-sha',
        blobSha: 'file-sha',
        path: 'skills/research/scripts/run.sh',
      },
    });
    const deps = createDeps({
      fetchFn: githubFetch(skillMarkdown),
      findSkillBySourceIdentity: jest.fn(async () => existing),
      getSkillById: jest.fn(async () => existing),
      getSkillFileByPath: jest.fn(async () => unchangedFile),
      listSkillFiles: jest.fn(async () => [unchangedFile]),
      updateSkill: jest.fn(),
    });
    const runner = createGitHubSkillSyncRunner(deps);
    const result = await runner.runOnce();

    expect(result.status).toBe('completed');
    expect(deps.saveBuffer).not.toHaveBeenCalled();
    expect(deps.upsertSkillFile).not.toHaveBeenCalled();
    expect(deps.updateSkill).not.toHaveBeenCalled();
    expect(deps.grantPermission).toHaveBeenCalled();
  });

  it('does not mutate existing skill files when permission grant fails', async () => {
    const existing = makeSkill({
      name: 'research',
      description: 'Old description',
      body: 'Old body',
      author: new Types.ObjectId(),
      authorName: 'GitHub Sync',
      source: 'github',
      sourceMetadata: {
        provider: 'github',
        sourceId: 'librechat-skills',
        upstreamId: 'librechat-skills:skills/research',
        owner: 'LibreChat',
        repo: 'skills',
        ref: 'main',
        skillPath: 'skills/research',
      },
    }) as ISkill & { _id: Types.ObjectId };
    const deps = createDeps({
      findSkillBySourceIdentity: jest.fn(async () => existing),
      getSkillById: jest.fn(async () => existing),
      grantPermission: jest.fn(async () => {
        throw new Error('permission unavailable');
      }),
    });
    const runner = createGitHubSkillSyncRunner(deps);
    const result = await runner.runOnce();

    expect(result.status).toBe('failed');
    expect(deps.grantPermission).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: existing._id }),
    );
    expect(deps.listSkillFiles).not.toHaveBeenCalled();
    expect(deps.saveBuffer).not.toHaveBeenCalled();
    expect(deps.upsertSkillFile).not.toHaveBeenCalled();
    expect(deps.updateSkill).not.toHaveBeenCalled();
  });

  it('restores existing skill files when the skill update fails after file sync', async () => {
    const existing = makeSkill({
      name: 'research',
      description: 'Old description',
      body: 'Old body',
      author: new Types.ObjectId(),
      authorName: 'GitHub Sync',
      source: 'github',
      sourceMetadata: {
        provider: 'github',
        sourceId: 'librechat-skills',
        upstreamId: 'librechat-skills:skills/research',
        owner: 'LibreChat',
        repo: 'skills',
        ref: 'main',
        skillPath: 'skills/research',
      },
    }) as ISkill & { _id: Types.ObjectId };
    const oldFile = makeSkillFile(existing);
    const files = new Map<string, ISkillFile & { _id: Types.ObjectId }>([
      [oldFile.relativePath, oldFile],
    ]);
    const upsertSkillFile = jest.fn(
      async (
        row: Parameters<GitHubSkillSyncDeps['upsertSkillFile']>[0],
      ): Promise<ISkillFile & { _id: Types.ObjectId }> => {
        const current = files.get(row.relativePath);
        const next = {
          _id: current?._id ?? new Types.ObjectId(),
          skillId: row.skillId as Types.ObjectId,
          relativePath: row.relativePath,
          file_id: row.file_id,
          filename: row.filename,
          filepath: row.filepath,
          storageKey: row.storageKey,
          storageRegion: row.storageRegion,
          source: row.source,
          sourceMetadata: row.sourceMetadata,
          mimeType: row.mimeType,
          bytes: row.bytes,
          category: 'script' as const,
          isExecutable: row.isExecutable ?? false,
          author: row.author,
          tenantId: row.tenantId,
        };
        files.set(row.relativePath, next);
        return next;
      },
    );
    const deps = createDeps({
      findSkillBySourceIdentity: jest.fn(async () => existing),
      getSkillById: jest.fn(async () => ({ ...existing, version: existing.version + 1 })),
      getSkillFileByPath: jest.fn(
        async (_skillId, relativePath) => files.get(relativePath) ?? null,
      ),
      listSkillFiles: jest.fn(async () => Array.from(files.values())),
      upsertSkillFile,
      deleteSkillFile: jest.fn(async (_skillId, relativePath) => ({
        deleted: files.delete(relativePath),
      })),
      saveBuffer: jest.fn(async () => ({
        filepath: '/uploads/new-file-id__run.sh',
        source: 'local',
      })),
      deleteFile: jest.fn(async () => undefined),
      updateSkill: jest.fn(async () => ({ status: 'conflict' as const, current: existing })),
    });
    const runner = createGitHubSkillSyncRunner(deps);
    const result = await runner.runOnce();

    expect(result.status).toBe('failed');
    expect(deps.upsertStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorCode: 'SKILL_CONFLICT',
      }),
    );
    expect(files.get('scripts/run.sh')).toEqual(
      expect.objectContaining({ filepath: oldFile.filepath }),
    );
    expect(deps.deleteFile).toHaveBeenCalledWith(
      expect.objectContaining({ filepath: '/uploads/new-file-id__run.sh' }),
    );
    expect(deps.deleteFile).not.toHaveBeenCalledWith(
      expect.objectContaining({ filepath: oldFile.filepath }),
    );
  });

  it('preserves credential presence when a manual run is skipped by an active lock', async () => {
    const deps = createDeps({
      tryAcquireLock: jest.fn(async () => false),
      listCredentials: jest.fn(async () => [
        {
          provider: 'github' as const,
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

  it('uses a fresh lock owner for each sync run', async () => {
    const deps = createDeps({ lockOwner: 'worker-a' });
    const runner = createGitHubSkillSyncRunner(deps);

    await runner.runOnce();
    await runner.runOnce();

    const lockOwners = (deps.tryAcquireLock as jest.Mock).mock.calls.map(
      ([params]: [Parameters<GitHubSkillSyncDeps['tryAcquireLock']>[0]]) => params.lockOwner,
    );
    const releasedOwners = (deps.releaseLock as jest.Mock).mock.calls.map(
      ([params]: [Parameters<GitHubSkillSyncDeps['releaseLock']>[0]]) => params.lockOwner,
    );

    expect(lockOwners).toHaveLength(2);
    expect(lockOwners[0]).not.toBe(lockOwners[1]);
    expect(lockOwners.every((owner) => owner.startsWith('worker-a:'))).toBe(true);
    expect(releasedOwners).toEqual(lockOwners);
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
            upstreamId: 'librechat-skills:skills',
          }),
        }),
        expect.objectContaining({
          relativePath: 'child.txt',
          sourceMetadata: expect.objectContaining({
            upstreamId: 'librechat-skills:skills/child',
          }),
        }),
      ]),
    );
    expect(fileCalls).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relativePath: 'child/SKILL.md',
          sourceMetadata: expect.objectContaining({
            upstreamId: 'librechat-skills:skills',
          }),
        }),
        expect.objectContaining({
          relativePath: 'child/child.txt',
          sourceMetadata: expect.objectContaining({
            upstreamId: 'librechat-skills:skills',
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
