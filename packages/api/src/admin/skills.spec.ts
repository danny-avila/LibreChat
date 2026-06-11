import { SystemCapabilities } from '@librechat/data-schemas';
import type { NextFunction, Response } from 'express';
import { createAdminSkillsSyncAccess, createAdminSkillsSyncHandlers } from './skills';

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

function createNext(): NextFunction & jest.Mock {
  return jest.fn() as NextFunction & jest.Mock;
}

function createHandlers({
  statusErrorCode,
  statusErrorMessage,
}: { statusErrorCode?: string; statusErrorMessage?: string } = {}) {
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
          errorCode: statusErrorCode,
          errorMessage: statusErrorMessage,
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
          errorCode: statusErrorCode,
          errorMessage: statusErrorMessage,
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
            owner: undefined,
            repo: undefined,
            ref: undefined,
            paths: undefined,
          }),
        ],
      }),
    );
  });

  it('redacts credential-related errors from tenant-scoped status reads', async () => {
    const { handlers } = createHandlers({
      statusErrorCode: 'MISSING_CREDENTIAL',
      statusErrorMessage: 'Missing GitHub token environment variable "GITHUB_SKILLS_TOKEN"',
    });
    const res = createResponse();

    await handlers.getSyncStatus({ skillSyncCanReadCredentials: false } as never, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [
          expect.objectContaining({
            errorCode: 'MISSING_CREDENTIAL',
            errorMessage: 'GitHub skill sync credentials are not available',
          }),
        ],
      }),
    );
  });

  it('includes credential summaries and source credential metadata for platform status reads', async () => {
    const { handlers } = createHandlers({
      statusErrorCode: 'MISSING_CREDENTIAL',
      statusErrorMessage: 'Missing GitHub credential "github-skills-prod"',
    });
    const res = createResponse();

    await handlers.getSyncStatus({ skillSyncCanReadCredentials: true } as never, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: [expect.objectContaining({ credentialKey: 'github-skills-prod' })],
        sources: [
          expect.objectContaining({
            credentialKey: 'github-skills-prod',
            credentialPresent: true,
            owner: 'LibreChat',
            repo: 'skills',
            ref: 'main',
            paths: ['skills'],
            errorMessage: 'Missing GitHub credential "github-skills-prod"',
          }),
        ],
      }),
    );
  });

  it('omits source credential metadata from tenant-scoped manual run responses', async () => {
    const { handlers } = createHandlers({
      statusErrorCode: 'MISSING_CREDENTIAL',
      statusErrorMessage: 'Missing GitHub credential "github-skills-prod"',
    });
    const res = createResponse();

    await handlers.runSync(
      {
        skillSyncAllowServerCredentials: true,
        skillSyncCanReadCredentials: false,
      } as never,
      res,
    );

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [
          expect.objectContaining({
            credentialKey: undefined,
            credentialPresent: false,
            errorMessage: 'GitHub skill sync credentials are not available',
          }),
        ],
      }),
    );
  });
});

describe('createAdminSkillsSyncAccess', () => {
  const baseSkillSync = {
    github: {
      enabled: true,
      intervalMinutes: 60,
      runOnStartup: false,
      sources: [
        {
          id: 'base-skills',
          owner: 'LibreChat',
          repo: 'skills',
          ref: 'main',
          paths: ['skills'],
          token: '${GITHUB_SKILLS_TOKEN}',
        },
      ],
    },
  };

  function createAccess({
    hasCapability = jest.fn().mockResolvedValue(true),
    getAppConfig = jest.fn().mockResolvedValue({ skillSync: undefined }),
  }: {
    hasCapability?: jest.Mock;
    getAppConfig?: jest.Mock;
  } = {}) {
    return {
      access: createAdminSkillsSyncAccess({ getAppConfig, hasCapability }),
      getAppConfig,
      hasCapability,
    };
  }

  it('attaches the base skill sync config for override comparison', async () => {
    const getAppConfig = jest.fn().mockResolvedValue({ skillSync: baseSkillSync });
    const { access } = createAccess({ getAppConfig });
    const req = { config: { skillSync: undefined, config: { endpoints: {} } } };
    const res = createResponse();
    const next = createNext();

    await access.attachBaseSkillSyncConfig(req as never, res, next);

    expect(getAppConfig).toHaveBeenCalledWith({ baseOnly: true });
    expect(req.config.config).toEqual({ endpoints: {}, skillSync: baseSkillSync });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('marks credential metadata hidden for tenant-scoped status reads', async () => {
    const hasCapability = jest.fn(
      async (user: { tenantId?: string }, capability: string): Promise<boolean> => {
        if (capability === SystemCapabilities.READ_SKILLS) {
          return Boolean(user.tenantId);
        }
        return true;
      },
    );
    const { access } = createAccess({ hasCapability });
    const req = { user: { id: 'user-1', role: 'ADMIN', tenantId: 'tenant-a' } };
    const res = createResponse();
    const next = createNext();

    await access.requireReadSkills(req as never, res, next);
    await access.attachCredentialReadAccess(req as never, res, next);

    expect(req).toMatchObject({
      skillSyncCanReadCredentials: false,
      skillSyncAllowServerCredentials: false,
    });
    expect(hasCapability).toHaveBeenCalledWith(
      { id: 'user-1', role: 'ADMIN', tenantId: 'tenant-a' },
      SystemCapabilities.READ_SKILLS,
    );
    expect(hasCapability).toHaveBeenCalledWith(
      { id: 'user-1', role: 'ADMIN' },
      SystemCapabilities.READ_SKILLS,
    );
  });

  it('prevents tenant admins from running overrides that require server credentials', async () => {
    const tenantSkillSync = {
      github: {
        enabled: true,
        intervalMinutes: 60,
        runOnStartup: false,
        sources: [
          {
            id: 'tenant-skills',
            owner: 'LibreChat',
            repo: 'skills',
            ref: 'main',
            paths: ['skills'],
            token: '${GITHUB_SKILLS_TOKEN}',
          },
        ],
      },
    };
    const hasCapability = jest.fn(
      async (user: { tenantId?: string }, capability: string): Promise<boolean> => {
        if (capability === SystemCapabilities.MANAGE_SKILLS) {
          return Boolean(user.tenantId);
        }
        return true;
      },
    );
    const { access } = createAccess({ hasCapability });
    const req = {
      user: { id: 'user-1', role: 'ADMIN', tenantId: 'tenant-a' },
      config: { skillSync: tenantSkillSync, config: {} },
    };
    const res = createResponse();
    const next = createNext();

    await access.requireSyncRunCapability(req as never, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Tenant-scoped manual skill sync requires platform credential access',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('prevents tenant admins from manually running base skill sync config', async () => {
    const hasCapability = jest.fn(
      async (user: { tenantId?: string }, capability: string): Promise<boolean> => {
        if (capability === SystemCapabilities.MANAGE_SKILLS) {
          return Boolean(user.tenantId);
        }
        return true;
      },
    );
    const { access } = createAccess({ hasCapability });
    const req = {
      user: { id: 'user-1', role: 'ADMIN', tenantId: 'tenant-a' },
      config: { skillSync: baseSkillSync, config: { skillSync: baseSkillSync } },
    };
    const res = createResponse();
    const next = createNext();

    await access.requireSyncRunCapability(req as never, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'Forbidden' });
    expect(next).not.toHaveBeenCalled();
  });

  it('allows platform admins to manually run base skill sync config with server credentials', async () => {
    const { access } = createAccess();
    const req = {
      user: { id: 'user-1', role: 'ADMIN', tenantId: 'tenant-a' },
      config: { skillSync: baseSkillSync, config: { skillSync: baseSkillSync } },
    };
    const res = createResponse();
    const next = createNext();

    await access.requireSyncRunCapability(req as never, res, next);

    expect(req).toMatchObject({
      skillSyncAllowServerCredentials: true,
      skillSyncCanReadCredentials: true,
    });
    expect(next).toHaveBeenCalledTimes(1);
  });
});
