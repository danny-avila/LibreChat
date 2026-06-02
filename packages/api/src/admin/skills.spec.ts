import type { Response } from 'express';
import { createAdminSkillsSyncHandlers } from './skills';

function createResponse() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response & {
    status: jest.Mock;
    json: jest.Mock;
  };
}

function createHandlers() {
  const runner = {
    getStatus: jest.fn(async () => ({
      enabled: true,
      intervalMinutes: 60,
      runOnStartup: false,
      sources: [
        {
          provider: 'github' as const,
          sourceId: 'tenant-skills',
          tenantId: 'tenant-a',
          status: 'idle' as const,
          credentialKey: 'github-skills-prod',
          credentialPresent: true,
          owner: 'LibreChat',
          repo: 'skills',
          ref: 'main',
          paths: ['skills'],
          syncedSkillCount: 0,
          syncedFileCount: 0,
          deletedSkillCount: 0,
          deletedFileCount: 0,
          errorCode: undefined,
          errorMessage: undefined,
          startedAt: undefined,
          finishedAt: undefined,
          lastSuccessAt: undefined,
          lastFailureAt: undefined,
          createdAt: undefined,
          updatedAt: undefined,
        },
      ],
      credentials: [
        {
          provider: 'github' as const,
          credentialKey: 'github-skills-prod',
          credentialPresent: true,
          tokenFingerprint: 'abc123',
        },
      ],
      fineGrainedTokenRecommendation: 'Use a fine-grained token.',
    })),
    runOnce: jest.fn(async () => ({
      status: 'completed' as const,
      sources: [
        {
          provider: 'github' as const,
          sourceId: 'tenant-skills',
          tenantId: 'tenant-a',
          status: 'succeeded' as const,
          credentialKey: 'github-skills-prod',
          credentialPresent: true,
          syncedSkillCount: 1,
          syncedFileCount: 2,
          deletedSkillCount: 0,
          deletedFileCount: 0,
          errorCode: undefined,
          errorMessage: undefined,
          startedAt: undefined,
          finishedAt: undefined,
          lastSuccessAt: undefined,
          lastFailureAt: undefined,
          createdAt: undefined,
          updatedAt: undefined,
        },
      ],
    })),
  };
  const handlers = createAdminSkillsSyncHandlers({
    runner,
    upsertCredential: jest.fn(),
    deleteCredential: jest.fn(),
  });
  return { handlers, runner };
}

describe('createAdminSkillsSyncHandlers', () => {
  it('omits credential summaries and source credential metadata for tenant-scoped status reads', async () => {
    const { handlers } = createHandlers();
    const res = createResponse();

    await handlers.getSyncStatus({ skillSyncCanReadCredentials: false } as never, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: [],
        sources: [
          expect.objectContaining({
            credentialKey: undefined,
            credentialPresent: false,
          }),
        ],
      }),
    );
  });

  it('includes credential summaries and source credential metadata for platform status reads', async () => {
    const { handlers } = createHandlers();
    const res = createResponse();

    await handlers.getSyncStatus({ skillSyncCanReadCredentials: true } as never, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: [expect.objectContaining({ credentialKey: 'github-skills-prod' })],
        sources: [
          expect.objectContaining({
            credentialKey: 'github-skills-prod',
            credentialPresent: true,
          }),
        ],
      }),
    );
  });

  it('omits source credential metadata from tenant-scoped manual run responses', async () => {
    const { handlers } = createHandlers();
    const res = createResponse();

    await handlers.runSync({ skillSyncAllowServerCredentials: false } as never, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [
          expect.objectContaining({
            credentialKey: undefined,
            credentialPresent: false,
          }),
        ],
      }),
    );
  });
});
