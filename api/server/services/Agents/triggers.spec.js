const mockCreateAgentTriggerService = jest.fn();
const mockGenerationJobManager = {
  supportsDetachedAgentEventActions: true,
  getJob: jest.fn(),
  getGenerationAdmissionEvidence: jest.fn(),
};
const mockQueuedTurnLifecycle = {
  prepareContinue: jest.fn(),
  settleBeforeDeadLetter: jest.fn(),
  recordExecutionAdmission: jest.fn(),
  initialize: jest.fn(),
  stop: jest.fn(),
  schedule: jest.fn(),
  cancel: jest.fn(),
};

jest.mock('@librechat/api', () => ({
  createAgentTriggerService: (...args) => mockCreateAgentTriggerService(...args),
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

  it('advertises detached completion capability for every compatible generation store', () => {
    require('./triggers');
    const supportsDetachedActionCompletion =
      mockCreateAgentTriggerService.mock.calls[0][0].supportsDetachedActionCompletion;

    expect(supportsDetachedActionCompletion()).toBe(true);
    mockGenerationJobManager.supportsDetachedAgentEventActions = false;
    expect(supportsDetachedActionCompletion()).toBe(false);
  });
});
