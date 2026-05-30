const mockGetAppConfig = jest.fn();
const mockGetStrategyFunctions = jest.fn();
const mockGetFileStrategy = jest.fn();
const mockFindRoleByIdentifier = jest.fn();
const mockGrantPermission = jest.fn();
let mockRunnerDeps;

jest.mock('~/server/services/Config', () => ({
  getAppConfig: mockGetAppConfig,
}));

jest.mock('@librechat/api', () => ({
  createGitHubSkillSyncRunner: jest.fn((deps) => {
    mockRunnerDeps = deps;
    return {
      getStatus: jest.fn(async () => deps.getConfig()),
      runOnce: jest.fn(async () => deps.getConfig()),
    };
  }),
  getStorageMetadata: jest.fn(() => ({})),
  startGitHubSkillSyncScheduler: jest.fn(() => ({ stop: jest.fn() })),
}));

jest.mock('@librechat/data-schemas', () => ({
  runAsSystem: jest.fn((fn) => fn()),
}));

jest.mock('~/models', () => ({
  findRoleByIdentifier: mockFindRoleByIdentifier,
  grantPermission: mockGrantPermission,
}));
jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: mockGetStrategyFunctions,
}));
jest.mock('~/server/utils/getFileStrategy', () => ({ getFileStrategy: mockGetFileStrategy }));

describe('GitHub skill sync service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAppConfig.mockReset();
    mockGetStrategyFunctions.mockReset();
    mockGetFileStrategy.mockReset();
    mockFindRoleByIdentifier.mockReset();
    mockGrantPermission.mockReset();
    mockRunnerDeps = undefined;
  });

  it('resolves sync config from fresh base app config for runner operations', async () => {
    const startupSkillSync = {
      github: {
        enabled: false,
        intervalMinutes: 60,
        runOnStartup: false,
        sources: [],
      },
    };
    const freshSkillSync = {
      github: {
        enabled: true,
        intervalMinutes: 5,
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
    };
    mockGetAppConfig.mockResolvedValue({ skillSync: freshSkillSync });

    const service = require('./sync');
    const { runner } = service.initializeGitHubSkillSync({ skillSync: startupSkillSync });
    const result = await runner.runOnce();

    expect(result).toBe(freshSkillSync);
    expect(mockRunnerDeps.getConfig).toBeDefined();
    expect(mockGetAppConfig).toHaveBeenCalledWith({ baseOnly: true });
  });

  it('does not return raw unvalidated config.skillSync as sync config', async () => {
    const rawSkillSync = {
      github: {
        enabled: true,
        sources: 'not-an-array',
      },
    };
    mockGetAppConfig.mockResolvedValue({ config: { skillSync: rawSkillSync } });

    const service = require('./sync');
    const { runner } = service.initializeGitHubSkillSync({ config: { skillSync: rawSkillSync } });
    const result = await runner.runOnce();

    expect(result).toBeUndefined();
    expect(mockGetAppConfig).toHaveBeenCalledWith({ baseOnly: true });
  });

  it('uses the file owner when deleting synced files from storage', async () => {
    const deleteFile = jest.fn(async () => undefined);
    const ownerId = '507f1f77bcf86cd799439011';
    mockGetAppConfig.mockResolvedValue({ skillSync: undefined, paths: {} });
    mockGetStrategyFunctions.mockReturnValue({ deleteFile });

    const service = require('./sync');
    service.initializeGitHubSkillSync({ skillSync: undefined });
    await mockRunnerDeps.deleteFile({
      filepath: `/uploads/${ownerId}/file.txt`,
      source: 'local',
      user: ownerId,
      tenantId: 'tenant-a',
    });

    expect(deleteFile).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({
          id: ownerId,
          _id: ownerId,
          tenantId: 'tenant-a',
        }),
      }),
      expect.objectContaining({
        user: ownerId,
        tenantId: 'tenant-a',
      }),
    );
  });

  it('does not force manual sync runs into the system tenant context', async () => {
    const { runAsSystem } = require('@librechat/data-schemas');
    mockGetAppConfig.mockResolvedValue({ skillSync: undefined, paths: {} });

    const service = require('./sync');
    const { runner } = service.initializeGitHubSkillSync({ skillSync: undefined });
    await runner.runOnce();

    expect(runAsSystem).not.toHaveBeenCalled();
  });

  it('resolves the access role outside tenant isolation but writes the ACL in context', async () => {
    const { runAsSystem } = require('@librechat/data-schemas');
    mockGetAppConfig.mockResolvedValue({ skillSync: undefined, paths: {} });
    mockFindRoleByIdentifier.mockResolvedValue({
      _id: 'role-object-id',
      resourceType: 'skill',
      permBits: 1,
    });
    mockGrantPermission.mockResolvedValue({ _id: 'acl-entry-id' });

    const service = require('./sync');
    service.initializeGitHubSkillSync({ skillSync: undefined });
    await mockRunnerDeps.grantPermission({
      principalType: 'public',
      principalId: null,
      resourceType: 'skill',
      resourceId: 'skill-id',
      accessRoleId: 'skill_viewer',
      grantedBy: 'system',
    });

    expect(runAsSystem).toHaveBeenCalledTimes(1);
    expect(mockFindRoleByIdentifier).toHaveBeenCalledWith('skill_viewer');
    expect(mockGrantPermission).toHaveBeenCalledWith(
      'public',
      null,
      'skill',
      'skill-id',
      1,
      'system',
      undefined,
      'role-object-id',
    );
  });

  it('fails the grant when the access role does not exist', async () => {
    mockGetAppConfig.mockResolvedValue({ skillSync: undefined, paths: {} });
    mockFindRoleByIdentifier.mockResolvedValue(null);

    const service = require('./sync');
    service.initializeGitHubSkillSync({ skillSync: undefined });

    await expect(
      mockRunnerDeps.grantPermission({
        principalType: 'public',
        principalId: null,
        resourceType: 'skill',
        resourceId: 'skill-id',
        accessRoleId: 'skill_viewer',
        grantedBy: 'system',
      }),
    ).rejects.toThrow('Role skill_viewer not found');
    expect(mockGrantPermission).not.toHaveBeenCalled();
  });
});
