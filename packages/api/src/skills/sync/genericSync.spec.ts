import { Types } from 'mongoose';
import type {
  ISkill,
  ISkillSyncStatus,
  CreateSkillInput,
  CreateSkillResult,
  SkillSyncStatusInput,
} from '@librechat/data-schemas';
import type { SkillSyncConfig } from 'librechat-data-provider';
import type { GitHubSkillSyncDeps } from './github';
import { createGitHubSkillSyncRunner } from './github';

function makeSkill(input: CreateSkillInput): ISkill & { _id: Types.ObjectId } {
  return {
    _id: new Types.ObjectId(),
    name: input.name,
    description: input.description ?? '',
    body: input.body ?? '',
    source: input.source ?? 'inline',
    sourceMetadata: input.sourceMetadata,
    author: input.author ?? new Types.ObjectId(),
    authorName: input.authorName ?? '',
    version: 1,
    fileCount: 0,
    alwaysApply: input.alwaysApply ?? false,
    tenantId: input.tenantId,
  } as ISkill & { _id: Types.ObjectId };
}

/**
 * Builds a mock fetch that emulates a GitLab-like API:
 * - GET /api/v4/projects/:id/repository/commits/:ref → commit
 * - GET /api/v4/projects/:id/repository/tree → tree listing
 * - GET /api/v4/projects/:id/repository/blobs/:sha/raw → blob content
 */
function gitlabFetch(skillMd: string): typeof fetch {
  return jest.fn(async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.includes('/repository/commits/')) {
      return { ok: true, status: 200, json: async () => ({ id: 'gl-commit-sha', parent_ids: [] }) } as Response;
    }
    if (url.includes('/repository/tree')) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => [
          { id: 'gl-skill-sha', name: 'SKILL.md', type: 'blob', path: 'skills/research/SKILL.md', mode: '100644' },
        ],
      } as unknown as Response;
    }
    if (url.includes('/blobs/') && url.includes('/raw')) {
      const buf = Buffer.from(skillMd);
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      } as unknown as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
  }) as unknown as typeof fetch;
}

/**
 * Builds a mock fetch that emulates a Bitbucket-like API:
 * - GET /repositories/:ws/:repo/commit/:ref → commit
 * - GET /repositories/:ws/:repo/src/:ref/ → tree listing
 * - GET /repositories/:ws/:repo/src/:ref/:path → blob content
 */
function bitbucketFetch(skillMd: string): typeof fetch {
  return jest.fn(async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.includes('/commit/')) {
      return { ok: true, status: 200, json: async () => ({ hash: 'bb-commit-sha' }) } as Response;
    }
    if (url.match(/\/src\/[^/]+\/\?/) || url.match(/\/src\/[^/]+\?/)) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          values: [
            { path: 'skills/writer/SKILL.md', type: 'commit_file', size: skillMd.length, commit: { hash: 'bb-commit-sha' } },
          ],
          next: undefined,
        }),
      } as unknown as Response;
    }
    if (url.includes('/src/')) {
      const buf = Buffer.from(skillMd);
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      } as unknown as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
  }) as unknown as typeof fetch;
}

/**
 * Builds a mock fetch that emulates Azure DevOps API:
 * - GET /_apis/git/repositories/:repo/refs → refs
 * - GET /_apis/git/repositories/:repo/commits/:id → commit
 * - GET /_apis/git/repositories/:repo/trees/:sha → tree listing
 * - GET /_apis/git/repositories/:repo/blobs/:sha → blob content
 */
function azureFetch(skillMd: string): typeof fetch {
  return jest.fn(async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.includes('/refs?')) {
      return { ok: true, status: 200, json: async () => ({ value: [{ name: 'refs/heads/main', objectId: 'az-commit-sha' }] }) } as Response;
    }
    if (url.includes('/commits/')) {
      return { ok: true, status: 200, json: async () => ({ commitId: 'az-commit-sha', treeId: 'az-tree-sha' }) } as Response;
    }
    if (url.includes('/trees/')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          treeEntries: [
            { objectId: 'az-blob-sha', relativePath: 'skills/coder/SKILL.md', gitObjectType: 'blob', size: skillMd.length, mode: '100644' },
          ],
        }),
      } as unknown as Response;
    }
    if (url.includes('/blobs/')) {
      const buf = Buffer.from(skillMd);
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      } as unknown as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
  }) as unknown as typeof fetch;
}

function createMultiProviderConfig(): SkillSyncConfig {
  return {
    github: {
      enabled: false,
      intervalMinutes: 60,
      runOnStartup: false,
      sources: [],
    },
    gitlab: {
      enabled: true,
      intervalMinutes: 30,
      runOnStartup: false,
      sources: [
        {
          id: 'gl-skills',
          projectId: '12345',
          ref: 'main',
          paths: ['skills'],
          token: '${GITLAB_SKILLS_TOKEN}',
        },
      ],
    },
    bitbucket: {
      enabled: true,
      intervalMinutes: 45,
      runOnStartup: false,
      sources: [
        {
          id: 'bb-skills',
          workspace: 'myteam',
          repository: 'skills-repo',
          ref: 'main',
          paths: ['skills'],
          token: '${BITBUCKET_SKILLS_TOKEN}',
        },
      ],
    },
    azuredevops: {
      enabled: true,
      intervalMinutes: 60,
      runOnStartup: false,
      sources: [
        {
          id: 'az-skills',
          organization: 'myorg',
          project: 'myproj',
          repository: 'skills-repo',
          ref: 'main',
          paths: ['skills'],
          token: '${AZUREDEVOPS_SKILLS_TOKEN}',
        },
      ],
    },
  };
}

function createDeps(overrides: Partial<GitHubSkillSyncDeps> = {}): GitHubSkillSyncDeps {
  const statuses: ISkillSyncStatus[] = [];
  return {
    getConfig: async () => createMultiProviderConfig(),
    getCredentialToken: jest.fn(async () => null),
    getCredentialSummary: jest.fn(async () => null),
    listCredentials: jest.fn(async () => []),
    listStatuses: jest.fn(async () => statuses),
    upsertStatus: jest.fn(async (input: SkillSyncStatusInput) => {
      const status = {
        provider: input.provider,
        sourceId: input.sourceId,
        tenantId: input.tenantId,
        status: input.status,
        credentialKey: input.credentialKey,
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
      } as ISkillSyncStatus;
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
    upsertSkillFile: jest.fn(async () => ({
      _id: new Types.ObjectId(),
      skillId: new Types.ObjectId(),
      relativePath: 'file',
      file_id: 'fid',
      filename: 'file',
      filepath: '/uploads/file',
      source: 'local',
      mimeType: 'text/plain',
      bytes: 1,
      category: 'file',
      isExecutable: false,
      author: new Types.ObjectId(),
    })),
    deleteSkillFile: jest.fn(async () => ({ deleted: true })),
    deleteSkill: jest.fn(async () => ({ deleted: true })),
    saveBuffer: jest.fn(async () => ({ filepath: '/uploads/file', source: 'local' })),
    deleteFile: jest.fn(async () => undefined),
    grantPermission: jest.fn(async () => undefined),
    fetchFn: jest.fn(async () => ({ ok: false, status: 404 })) as unknown as typeof fetch,
    ...overrides,
  };
}

describe('Multi-provider skill sync integration wiring', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      GITLAB_SKILLS_TOKEN: 'glpat-test-token',
      BITBUCKET_SKILLS_TOKEN: 'bb-test-token',
      AZUREDEVOPS_SKILLS_TOKEN: 'az-test-token',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('syncs a GitLab source when GitHub is disabled', async () => {
    const glFetch = gitlabFetch('---\nname: research\ndescription: From GitLab\n---\nGL body');
    const config = createMultiProviderConfig();
    // Only enable GitLab
    config.bitbucket!.enabled = false;
    config.azuredevops!.enabled = false;
    const deps = createDeps({
      fetchFn: glFetch,
      getConfig: async () => config,
    });
    const runner = createGitHubSkillSyncRunner(deps);

    const result = await runner.runOnce();

    expect(result.status).toBe('completed');
    expect(deps.createSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'research',
        description: 'From GitLab',
        source: 'gitlab',
        sourceMetadata: expect.objectContaining({
          provider: 'gitlab',
          sourceId: 'gl-skills',
        }),
      }),
    );
  });

  it('syncs a Bitbucket source when GitHub is disabled', async () => {
    const bbFetch = bitbucketFetch('---\nname: writer\ndescription: From Bitbucket\n---\nBB body');
    const config = createMultiProviderConfig();
    // Only enable Bitbucket
    config.gitlab!.enabled = false;
    config.azuredevops!.enabled = false;
    const deps = createDeps({
      fetchFn: bbFetch,
      getConfig: async () => config,
    });
    const runner = createGitHubSkillSyncRunner(deps);

    const result = await runner.runOnce();

    expect(result.status).toBe('completed');
    expect(deps.createSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'writer',
        source: 'bitbucket',
        sourceMetadata: expect.objectContaining({
          provider: 'bitbucket',
          sourceId: 'bb-skills',
        }),
      }),
    );
  });

  it('syncs an Azure DevOps source when GitHub is disabled', async () => {
    const azFetch = azureFetch('---\nname: coder\ndescription: From Azure\n---\nAZ body');
    const config = createMultiProviderConfig();
    // Only enable Azure DevOps
    config.gitlab!.enabled = false;
    config.bitbucket!.enabled = false;
    const deps = createDeps({
      fetchFn: azFetch,
      getConfig: async () => config,
    });
    const runner = createGitHubSkillSyncRunner(deps);

    const result = await runner.runOnce();

    expect(result.status).toBe('completed');
    expect(deps.createSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'coder',
        source: 'azuredevops',
        sourceMetadata: expect.objectContaining({
          provider: 'azuredevops',
          sourceId: 'az-skills',
        }),
      }),
    );
  });

  it('reports failed status when token env var is missing', async () => {
    delete process.env.GITLAB_SKILLS_TOKEN;
    const config = createMultiProviderConfig();
    config.bitbucket!.enabled = false;
    config.azuredevops!.enabled = false;
    const deps = createDeps({ getConfig: async () => config });
    const runner = createGitHubSkillSyncRunner(deps);

    const result = await runner.runOnce();

    expect(result.status).toBe('failed');
    expect(result.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'gitlab',
          sourceId: 'gl-skills',
          status: 'failed',
          errorCode: 'MISSING_CREDENTIAL',
        }),
      ]),
    );
  });

  it('skips disabled providers and syncs only enabled ones', async () => {
    const config = createMultiProviderConfig();
    config.gitlab!.enabled = false;
    config.bitbucket!.enabled = false;
    config.azuredevops!.enabled = false;
    const deps = createDeps({ getConfig: async () => config });
    const runner = createGitHubSkillSyncRunner(deps);

    const result = await runner.runOnce();

    expect(result.status).toBe('skipped');
    expect(result.sources).toHaveLength(0);
  });
});
