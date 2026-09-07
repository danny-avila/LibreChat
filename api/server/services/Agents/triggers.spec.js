const mockCreateAgentTriggerService = jest.fn();
const mockSweep = jest.fn();
const mockCreateActorCheckpointMaintenance = jest.fn(() => mockSweep);
const mockGetAppConfig = jest.fn();
const mockGenerationJobManager = {
  supportsDetachedAgentEventActions: true,
  getJob: jest.fn(),
  getGenerationAdmissionEvidence: jest.fn(),
  getCleanupBlockingJobIdsForConversations: jest.fn(),
};
const mockQueuedTurnLifecycle = {
  prepareContinue: jest.fn(),
  settleBeforeDeadLetter: jest.fn(),
  recordExecutionAdmission: jest.fn(),
  verifyExecutionAdmission: jest.fn(),
  initialize: jest.fn(),
  stop: jest.fn(),
  schedule: jest.fn(),
  cancel: jest.fn(),
};

jest.mock('@librechat/api', () => ({
  createAgentTriggerService: (...args) => mockCreateAgentTriggerService(...args),
  createActorCheckpointMaintenance: (...args) => mockCreateActorCheckpointMaintenance(...args),
  createAgentContinuationResolver: jest.fn(() => jest.fn()),
  createAgentEventContinueResolver: jest.fn(() => jest.fn()),
  createBackgroundToolCompletionWakeupResolver: jest.fn(() => jest.fn()),
  createSubagentCompletionWakeupResolver: jest.fn(() => jest.fn()),
  createAgentQueuedTurnLifecycle: jest.fn(() => mockQueuedTurnLifecycle),
  BACKGROUND_TOOL_COMPLETION_SOURCE: 'background-tool-completion',
  SUBAGENT_COMPLETION_SOURCE: 'subagent-completion',
  AGENT_QUEUED_TURN_SOURCE: 'agent-queued-turn',
  GenerationJobManager: mockGenerationJobManager,
}));

jest.mock('~/server/services/Config', () => ({
  getAppConfig: (...args) => mockGetAppConfig(...args),
}));

jest.mock('~/models', () => ({
  isAgentTriggerPrincipalActive: jest.fn(),
}));

describe('agent trigger service composition', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockGenerationJobManager.supportsDetachedAgentEventActions = true;
    mockCreateAgentTriggerService.mockReturnValue({
      initialize: jest.fn(),
      stop: jest.fn(),
      dispatch: jest.fn(),
      enqueue: jest.fn(),
      getDelivery: jest.fn(),
      getDeliveryStatus: jest.fn(),
      getDeadLetters: jest.fn(),
      requeue: jest.fn(),
      drainUser: jest.fn(),
      prepareUserPurge: jest.fn(),
      cancelUserPurge: jest.fn(),
      purgeUser: jest.fn(),
    });
  });

  it('uses the deployment checkpointer and active generation index for maintenance', async () => {
    const checkpointer = { type: 'mongo', checkpointCollectionName: 'custom_checkpoints' };
    mockGetAppConfig.mockResolvedValue({ endpoints: { agents: { checkpointer } } });
    mockSweep.mockResolvedValue(2);
    require('./triggers');
    const maintenance = mockCreateAgentTriggerService.mock.calls[0][0].sweepActorCheckpointScopes;
    expect(await maintenance()).toBe(2);
    expect(mockGetAppConfig).toHaveBeenCalledWith({ baseOnly: true });
    expect(mockSweep).toHaveBeenCalledWith(checkpointer);
    const { hasActiveGeneration } = mockCreateActorCheckpointMaintenance.mock.calls[0][0];
    mockGenerationJobManager.getCleanupBlockingJobIdsForConversations
      .mockResolvedValueOnce(['stream'])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('index unavailable'));
    expect(await hasActiveGeneration('owner', 'thread', 'tenant')).toBe(true);
    expect(await hasActiveGeneration('owner', 'thread', 'tenant')).toBe(false);
    await expect(hasActiveGeneration('owner', 'thread', 'tenant')).rejects.toThrow(
      'index unavailable',
    );
    expect(mockGenerationJobManager.getCleanupBlockingJobIdsForConversations).toHaveBeenCalledWith(
      'owner',
      ['thread'],
      'tenant',
    );
  });

  it('advertises detached completion capability for every compatible generation store', () => {
    require('./triggers');
    const supportsDetachedActionCompletion =
      mockCreateAgentTriggerService.mock.calls[0][0].supportsDetachedActionCompletion;

    expect(supportsDetachedActionCompletion()).toBe(true);
    mockGenerationJobManager.supportsDetachedAgentEventActions = false;
    expect(supportsDetachedActionCompletion()).toBe(false);
  });
});
