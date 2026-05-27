const mockGetAppConfig = jest.fn();
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

jest.mock('~/models', () => ({}));
jest.mock('~/server/services/PermissionService', () => ({ grantPermission: jest.fn() }));
jest.mock('~/server/services/Files/strategies', () => ({ getStrategyFunctions: jest.fn() }));
jest.mock('~/server/utils/getFileStrategy', () => ({ getFileStrategy: jest.fn() }));

describe('GitHub skill sync service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAppConfig.mockReset();
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
});
