const mockLogger = {
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};

let activeTenantContext;
const mockTenantStorageRun = jest.fn(async (context, callback) => {
  activeTenantContext = context;
  try {
    return await callback();
  } finally {
    activeTenantContext = undefined;
  }
});
const mockSaveMessage = jest.fn();
const mockGetConvo = jest.fn();
const mockGetMessages = jest.fn();
const mockFilterPersistableAbortContent = jest.fn((content) => content);
const mockCheckAndIncrementPendingRequest = jest.fn();
const mockDecrementPendingRequest = jest.fn();
const mockGenerationJobManager = {
  createJob: jest.fn(),
  emitError: jest.fn(),
  completeJob: jest.fn(),
  getResumeState: jest.fn(),
  updateMetadata: jest.fn(),
  claimGeneration: jest.fn(),
  releaseGeneration: jest.fn(),
  hasJob: jest.fn(),
  steering: {
    closeAndDrain: jest.fn(),
    park: jest.fn(),
  },
};

jest.mock('@librechat/data-schemas', () => ({
  logger: mockLogger,
  tenantStorage: {
    run: (...args) => mockTenantStorageRun(...args),
  },
}));

jest.mock('@librechat/api', () => ({
  sendEvent: jest.fn(),
  toPendingSteer: jest.fn((item) => item),
  isSteerPreemptSupported: jest.fn(() => true),
  buildRecoveredSteerPayload: jest.fn(() => null),
  deleteAgentCheckpoint: jest.fn(),
  getViolationInfo: jest.fn(() => ({
    type: 'concurrent',
    limit: 2,
    pendingRequests: 3,
    score: 1,
  })),
  buildMessageFiles: jest.fn(() => []),
  resolveTitleTiming: jest.fn(() => 'immediate'),
  resolveConversationAnchor: jest.requireActual('@librechat/api').resolveConversationAnchor,
  GenerationJobManager: mockGenerationJobManager,
  getReferencedQuotes: jest.fn(() => null),
  cleanupMCPRequestContext: jest.fn(),
  createMCPRequestContext: jest.fn(() => ({
    connections: new Map(),
    pending: new Map(),
    cleanupStarted: false,
  })),
  getMCPRequestContext: jest.fn(() => ({
    connections: new Map(),
    pending: new Map(),
    cleanupStarted: false,
  })),
  filterPersistableAbortContent: (...args) => mockFilterPersistableAbortContent(...args),
  cleanupMCPRequestContextForReq: jest.fn(),
  decrementPendingRequest: (...args) => mockDecrementPendingRequest(...args),
  sanitizeMessageForTransmit: jest.fn((message) => message),
  checkAndIncrementPendingRequest: (...args) => mockCheckAndIncrementPendingRequest(...args),
  getAgentStartupTelemetry: jest.fn(() => undefined),
  acceptAgentStartupTelemetry: jest.fn(),
  isUnpersistedPreliminaryParent: jest.fn(async () => false),
}));

jest.mock('~/server/cleanup', () => ({
  disposeClient: jest.fn(),
  clientRegistry: null,
  requestDataMap: {
    set: jest.fn(),
  },
}));

jest.mock('~/server/middleware', () => ({
  handleAbortError: jest.fn(() => Promise.resolve()),
}));

jest.mock('~/cache', () => ({
  logViolation: jest.fn(),
}));

jest.mock('~/models', () => ({
  saveMessage: (...args) => mockSaveMessage(...args),
  getMessages: (...args) => mockGetMessages(...args),
  getConvo: (...args) => mockGetConvo(...args),
}));

const AgentController = require('../request');

describe('ResumableAgentController tenant context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    activeTenantContext = undefined;
    mockCheckAndIncrementPendingRequest.mockResolvedValue({ allowed: true });
    mockDecrementPendingRequest.mockResolvedValue(undefined);
    mockGetConvo.mockResolvedValue({ createdAt: '2026-07-31T00:00:00.000Z' });
    mockGetMessages.mockResolvedValue([]);
    mockGenerationJobManager.updateMetadata.mockResolvedValue(undefined);
    mockGenerationJobManager.emitError.mockResolvedValue(undefined);
    mockGenerationJobManager.completeJob.mockResolvedValue(undefined);
    mockGenerationJobManager.claimGeneration.mockResolvedValue({ claimed: true });
    mockGenerationJobManager.releaseGeneration.mockResolvedValue(undefined);
    mockGenerationJobManager.hasJob.mockResolvedValue(true);
    mockGenerationJobManager.steering.closeAndDrain.mockResolvedValue([]);
    mockGenerationJobManager.steering.park.mockResolvedValue(undefined);
  });

  /**
   * Drives the controller far enough to register the `allSubscribersLeft` handler,
   * fires it, and returns the tenant context that was active during `saveMessage`.
   */
  const firePartialDisconnect = async (user) => {
    let allSubscribersLeftHandler;
    mockGenerationJobManager.createJob.mockResolvedValue({
      createdAt: 1000,
      readyPromise: Promise.resolve(),
      abortController: new AbortController(),
      emitter: {
        on: jest.fn((event, handler) => {
          if (event === 'allSubscribersLeft') {
            allSubscribersLeftHandler = handler;
          }
        }),
      },
    });
    mockGenerationJobManager.getResumeState.mockResolvedValue({
      conversationId: 'conversation-123',
      responseMessageId: 'response-message',
      userMessage: {
        messageId: 'user-message',
      },
    });

    let tenantSeenBySave;
    mockSaveMessage.mockImplementation(async () => {
      tenantSeenBySave = activeTenantContext;
      return {};
    });

    const initializeClient = jest.fn().mockRejectedValue(new Error('stop after setup'));
    const req = {
      user,
      body: {
        text: 'Continue the analysis',
        messageId: 'user-message',
        parentMessageId: 'parent-message',
        conversationId: 'conversation-123',
        endpointOption: {
          endpoint: 'agents',
          modelOptions: { model: 'gpt-4.1' },
        },
      },
      config: {},
    };
    const res = {
      headersSent: true,
      json: jest.fn(),
      status: jest.fn(() => res),
    };

    await AgentController(req, res, jest.fn(), initializeClient, null);
    expect(allSubscribersLeftHandler).toEqual(expect.any(Function));

    await allSubscribersLeftHandler([{ type: 'text', text: 'Partial response' }]);
    return tenantSeenBySave;
  };

  it('restores the authenticated tenant before saving a partial response on disconnect', async () => {
    const tenantSeenBySave = await firePartialDisconnect({ id: 'user-123', tenantId: 'tenant-a' });

    expect(mockTenantStorageRun).toHaveBeenCalledWith(
      { tenantId: 'tenant-a', userId: 'user-123' },
      expect.any(Function),
    );
    expect(tenantSeenBySave).toEqual({ tenantId: 'tenant-a', userId: 'user-123' });
    expect(mockSaveMessage).toHaveBeenCalledTimes(1);
  });

  it('saves the partial response without tenant context when the user has no tenant', async () => {
    const tenantSeenBySave = await firePartialDisconnect({ id: 'user-123' });

    expect(mockTenantStorageRun).not.toHaveBeenCalled();
    expect(tenantSeenBySave).toBeUndefined();
    expect(mockSaveMessage).toHaveBeenCalledTimes(1);
  });
});
