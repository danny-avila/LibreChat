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

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: () => null,
    },
    json: async () => body,
  } as Response;
}

function blob(content: string) {
  return {
    sha: 'blob-sha',
    encoding: 'base64',
    size: Buffer.byteLength(content),
    content: Buffer.from(content).toString('base64'),
  };
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
    fetchFn: jest.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/commits/main')) {
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
        return response(
          blob('---\nname: research\ndescription: Research things\nalways-apply: true\n---\nBody'),
        );
      }
      if (url.includes('/git/blobs/file-sha')) {
        return response(blob('echo ok'));
      }
      return response({ message: 'not found' }, 404);
    }),
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
          upstreamId: 'librechat-skills:LibreChat/skills:main:skills/research',
          skillBlobSha: 'skill-md-sha',
        }),
      }),
    );
    expect(deps.upsertSkillFile).toHaveBeenCalledWith(
      expect.objectContaining({
        relativePath: 'scripts/run.sh',
        sourceMetadata: expect.objectContaining({
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
});
