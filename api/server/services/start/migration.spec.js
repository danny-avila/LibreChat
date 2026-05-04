describe('checkMigrations', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('runs migration checks in system tenant context', async () => {
    const mockAgentResult = { totalToMigrate: 0 };
    const mockPromptResult = { totalToMigrate: 0 };
    const mockRunAsSystem = jest.fn((fn) => fn());
    const mockCheckAgentPermissionsMigration = jest.fn().mockResolvedValue(mockAgentResult);
    const mockCheckPromptPermissionsMigration = jest.fn().mockResolvedValue(mockPromptResult);
    const mockLogAgentMigrationWarning = jest.fn();
    const mockLogPromptMigrationWarning = jest.fn();
    const mockFindRoleByIdentifier = jest.fn();

    jest.mock('mongoose', () => ({
      models: {
        Agent: { modelName: 'Agent' },
        PromptGroup: { modelName: 'PromptGroup' },
      },
    }));
    jest.mock('@librechat/data-schemas', () => ({
      logger: { error: jest.fn() },
      runAsSystem: mockRunAsSystem,
    }));
    jest.mock('@librechat/api', () => ({
      checkAgentPermissionsMigration: mockCheckAgentPermissionsMigration,
      checkPromptPermissionsMigration: mockCheckPromptPermissionsMigration,
      logAgentMigrationWarning: mockLogAgentMigrationWarning,
      logPromptMigrationWarning: mockLogPromptMigrationWarning,
    }));
    jest.mock('~/models', () => ({
      findRoleByIdentifier: mockFindRoleByIdentifier,
    }));

    const { checkMigrations } = require('./migration');

    await checkMigrations();

    expect(mockRunAsSystem).toHaveBeenCalledTimes(2);
    expect(mockCheckAgentPermissionsMigration).toHaveBeenCalledWith({
      mongoose: expect.objectContaining({
        models: expect.objectContaining({ Agent: { modelName: 'Agent' } }),
      }),
      methods: { findRoleByIdentifier: mockFindRoleByIdentifier },
      AgentModel: { modelName: 'Agent' },
    });
    expect(mockCheckPromptPermissionsMigration).toHaveBeenCalledWith({
      mongoose: expect.objectContaining({
        models: expect.objectContaining({ PromptGroup: { modelName: 'PromptGroup' } }),
      }),
      methods: { findRoleByIdentifier: mockFindRoleByIdentifier },
      PromptGroupModel: { modelName: 'PromptGroup' },
    });
    expect(mockLogAgentMigrationWarning).toHaveBeenCalledWith(mockAgentResult);
    expect(mockLogPromptMigrationWarning).toHaveBeenCalledWith(mockPromptResult);
  });
});
