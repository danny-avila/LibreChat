const mockCreateAgentTriggerService = jest.fn();
const mockIsProducerEnabled = jest.fn();
const mockGenerationJobManager = {
  isRedis: true,
  getJob: jest.fn(),
};

jest.mock('@librechat/api', () => ({
  createAgentTriggerService: (...args) => mockCreateAgentTriggerService(...args),
  createAgentEventContinueResolver: jest.fn(() => jest.fn()),
  createSubagentCompletionWakeupResolver: jest.fn(() => jest.fn()),
  GenerationJobManager: mockGenerationJobManager,
  isAgentEventActorDetachedActionProducerEnabled: () => mockIsProducerEnabled(),
}));

jest.mock('~/models', () => ({
  isAgentTriggerPrincipalActive: jest.fn(),
}));

describe('agent trigger service composition', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockGenerationJobManager.isRedis = true;
    mockIsProducerEnabled.mockReturnValue(true);
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

  it('advertises detached completion capability only after Redis and producer activation', () => {
    require('./triggers');
    const supportsDetachedActionCompletion =
      mockCreateAgentTriggerService.mock.calls[0][0].supportsDetachedActionCompletion;

    expect(supportsDetachedActionCompletion()).toBe(true);
    mockIsProducerEnabled.mockReturnValue(false);
    expect(supportsDetachedActionCompletion()).toBe(false);
    mockIsProducerEnabled.mockReturnValue(true);
    mockGenerationJobManager.isRedis = false;
    expect(supportsDetachedActionCompletion()).toBe(false);
  });
});
