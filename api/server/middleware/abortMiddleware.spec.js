/**
 * Tests for abortMiddleware - spendCollectedUsage function
 *
 * This tests the token spending logic for abort scenarios,
 * particularly for parallel agents (addedConvo) where multiple
 * models need their tokens spent.
 *
 * spendCollectedUsage delegates to recordCollectedUsage from @librechat/api,
 * passing pricing + bulkWriteOps deps, with context: 'abort'.
 * After spending, it clears the collectedUsage array to prevent double-spending
 * from the AgentClient finally block (which shares the same array reference).
 */

const mockSpendTokens = jest.fn().mockResolvedValue();
const mockSpendStructuredTokens = jest.fn().mockResolvedValue();
const mockRecordCollectedUsage = jest
  .fn()
  .mockResolvedValue({ input_tokens: 100, output_tokens: 50 });

const mockGetMultiplier = jest.fn().mockReturnValue(1);
const mockGetCacheMultiplier = jest.fn().mockReturnValue(null);
const mockGetTransactionsConfig = jest.fn().mockReturnValue({ enabled: false });

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock('@librechat/api', () => ({
  /** Real implementation: these tests exist to verify abort classification
   *  itself, so mocking it would assert the mock rather than the behavior. */
  isAbortError: jest.requireActual('@librechat/api').isAbortError,
  countTokens: jest.fn().mockResolvedValue(100),
  isEnabled: jest.fn().mockReturnValue(false),
  sendEvent: jest.fn(),
  GenerationJobManager: {
    abortJob: jest.fn(),
  },
  recordCollectedUsage: mockRecordCollectedUsage,
  getTransactionsConfig: (...args) => mockGetTransactionsConfig(...args),
  sanitizeMessageForTransmit: jest.fn((msg) => msg),
  buildAbortedResponseMetadata: jest.fn().mockReturnValue(null),
}));

jest.mock('librechat-data-provider', () => ({
  /** Keep the module real: `@librechat/api` is partially un-mocked above and
   *  reads constants (`CacheKeys`, ...) from it at import time. */
  ...jest.requireActual('librechat-data-provider'),
  isAssistantsEndpoint: jest.fn().mockReturnValue(false),
  ErrorTypes: { INVALID_REQUEST: 'INVALID_REQUEST', NO_SYSTEM_MESSAGES: 'NO_SYSTEM_MESSAGES' },
}));

jest.mock('~/app/clients/prompts', () => ({
  truncateText: jest.fn((text) => text),
  smartTruncateText: jest.fn((text) => text),
}));

jest.mock('~/cache/clearPendingReq', () => jest.fn().mockResolvedValue());

jest.mock('~/server/middleware/error', () => ({
  sendError: jest.fn(),
}));

const mockUpdateBalance = jest.fn().mockResolvedValue({});
const mockBulkInsertTransactions = jest.fn().mockResolvedValue(undefined);
jest.mock('~/models', () => ({
  saveMessage: jest.fn().mockResolvedValue(),
  getConvo: jest.fn().mockResolvedValue({ title: 'Test Chat' }),
  updateBalance: mockUpdateBalance,
  bulkInsertTransactions: mockBulkInsertTransactions,
  spendTokens: (...args) => mockSpendTokens(...args),
  spendStructuredTokens: (...args) => mockSpendStructuredTokens(...args),
  getMultiplier: mockGetMultiplier,
  getCacheMultiplier: mockGetCacheMultiplier,
}));

jest.mock('./abortRun', () => ({
  abortRun: jest.fn(),
}));

const { logger } = require('@librechat/data-schemas');
const { sendError } = require('~/server/middleware/error');
const { GenerationJobManager } = require('@librechat/api');
const db = require('~/models');
const { handleAbort, handleAbortError, spendCollectedUsage } = require('./abortMiddleware');

const buildAbortRequest = () => ({
  body: {
    model: 'gpt-4',
  },
  user: {
    id: 'user-123',
  },
});

describe('abortMiddleware - spendCollectedUsage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('spendCollectedUsage delegation', () => {
    it('should return early if collectedUsage is empty', async () => {
      await spendCollectedUsage({
        userId: 'user-123',
        conversationId: 'convo-123',
        collectedUsage: [],
        fallbackModel: 'gpt-4',
      });

      expect(mockRecordCollectedUsage).not.toHaveBeenCalled();
    });

    it('should return early if collectedUsage is null', async () => {
      await spendCollectedUsage({
        userId: 'user-123',
        conversationId: 'convo-123',
        collectedUsage: null,
        fallbackModel: 'gpt-4',
      });

      expect(mockRecordCollectedUsage).not.toHaveBeenCalled();
    });

    it('should call recordCollectedUsage with abort context and full deps', async () => {
      const collectedUsage = [{ input_tokens: 100, output_tokens: 50, model: 'gpt-4' }];

      await spendCollectedUsage({
        userId: 'user-123',
        conversationId: 'convo-123',
        collectedUsage,
        fallbackModel: 'gpt-4',
        messageId: 'msg-123',
      });

      expect(mockRecordCollectedUsage).toHaveBeenCalledTimes(1);
      expect(mockRecordCollectedUsage).toHaveBeenCalledWith(
        {
          spendTokens: expect.any(Function),
          spendStructuredTokens: expect.any(Function),
          pricing: {
            getMultiplier: mockGetMultiplier,
            getCacheMultiplier: mockGetCacheMultiplier,
          },
          bulkWriteOps: {
            insertMany: mockBulkInsertTransactions,
            updateBalance: mockUpdateBalance,
          },
        },
        {
          user: 'user-123',
          conversationId: 'convo-123',
          collectedUsage,
          context: 'abort',
          messageId: 'msg-123',
          model: 'gpt-4',
        },
      );
    });

    it('should pass context abort for multiple models (parallel agents)', async () => {
      const collectedUsage = [
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4' },
        { input_tokens: 80, output_tokens: 40, model: 'claude-3' },
        { input_tokens: 120, output_tokens: 60, model: 'gemini-pro' },
      ];

      await spendCollectedUsage({
        userId: 'user-123',
        conversationId: 'convo-123',
        collectedUsage,
        fallbackModel: 'gpt-4',
      });

      expect(mockRecordCollectedUsage).toHaveBeenCalledTimes(1);
      expect(mockRecordCollectedUsage).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          context: 'abort',
          collectedUsage,
        }),
      );
    });

    it('should handle real-world parallel agent abort scenario', async () => {
      const collectedUsage = [
        { input_tokens: 31596, output_tokens: 151, model: 'gemini-3-flash-preview' },
        { input_tokens: 28000, output_tokens: 120, model: 'gpt-5.2' },
      ];

      await spendCollectedUsage({
        userId: 'user-123',
        conversationId: 'convo-123',
        collectedUsage,
        fallbackModel: 'gemini-3-flash-preview',
      });

      expect(mockRecordCollectedUsage).toHaveBeenCalledTimes(1);
      expect(mockRecordCollectedUsage).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          user: 'user-123',
          conversationId: 'convo-123',
          context: 'abort',
          model: 'gemini-3-flash-preview',
        }),
      );
    });

    /**
     * Race condition prevention: after abort middleware spends tokens,
     * the collectedUsage array is cleared so AgentClient.recordCollectedUsage()
     * (which shares the same array reference) sees an empty array and returns early.
     */
    it('should clear collectedUsage array after spending to prevent double-spending', async () => {
      const collectedUsage = [
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4' },
        { input_tokens: 80, output_tokens: 40, model: 'claude-3' },
      ];

      expect(collectedUsage.length).toBe(2);

      await spendCollectedUsage({
        userId: 'user-123',
        conversationId: 'convo-123',
        collectedUsage,
        fallbackModel: 'gpt-4',
      });

      expect(mockRecordCollectedUsage).toHaveBeenCalledTimes(1);
      expect(collectedUsage.length).toBe(0);
    });

    it('should await recordCollectedUsage before clearing array', async () => {
      let resolved = false;
      mockRecordCollectedUsage.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        resolved = true;
        return { input_tokens: 100, output_tokens: 50 };
      });

      const collectedUsage = [
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4' },
        { input_tokens: 80, output_tokens: 40, model: 'claude-3' },
      ];

      await spendCollectedUsage({
        userId: 'user-123',
        conversationId: 'convo-123',
        collectedUsage,
        fallbackModel: 'gpt-4',
      });

      expect(resolved).toBe(true);
      expect(collectedUsage.length).toBe(0);
    });
  });
});

describe('abortMiddleware - handleAbortError', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    [
      'native DOMException AbortError',
      new DOMException('The operation was aborted', 'AbortError'),
      'AbortError',
    ],
    [
      'wrapped AbortError message',
      new Error('SSE stream disconnected: AbortError: The operation was aborted'),
      'Error',
    ],
    [
      'cause-nested AbortError',
      new Error('Request failed', {
        cause: new DOMException('The operation was aborted', 'AbortError'),
      }),
      'Error',
    ],
  ])('logs a %s as a debug event instead of an error', async (_label, error, name) => {
    await handleAbortError({}, buildAbortRequest(), error, {
      sender: 'AI',
      conversationId: 'convo-123',
      messageId: 'message-123',
      parentMessageId: 'parent-123',
      userMessageId: 'user-message-123',
    });

    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith('[handleAbortError] AI response aborted by user', {
      conversationId: 'convo-123',
      code: error.code,
      name,
      message: error.message,
    });
    expect(sendError).toHaveBeenCalledTimes(1);
  });

  it('keeps unexpected generation errors classified as errors', async () => {
    const error = new Error('Provider failed');

    await handleAbortError({}, buildAbortRequest(), error, {
      sender: 'AI',
      conversationId: 'convo-123',
      messageId: 'message-123',
      parentMessageId: 'parent-123',
      userMessageId: 'user-message-123',
    });

    expect(logger.error).toHaveBeenCalledWith(
      '[handleAbortError] AI response error; aborting request:',
      error,
    );
    expect(logger.debug).not.toHaveBeenCalled();
    expect(sendError).toHaveBeenCalledTimes(1);
  });
});

/**
 * The transactions config is resolved from the request's app config and must reach
 * every write path in this file. `createTransaction` reads `transactions` from the
 * caller-supplied data, so an omitted value is indistinguishable from enabled and
 * the write proceeds even when `transactions.enabled` is false.
 */
describe('abortMiddleware - transactions config', () => {
  const buildJobData = () => ({
    model: 'gpt-4',
    responseMessageId: 'msg-123',
    conversationId: 'convo-123',
    endpoint: 'agents',
    sender: 'AI',
    promptTokens: 25,
    userMessage: {
      messageId: 'user-msg-123',
      parentMessageId: 'parent-123',
      conversationId: 'convo-123',
      text: 'hello',
    },
  });

  const buildReq = () => ({
    body: { abortKey: 'convo-123:1', endpoint: 'agents' },
    user: { id: 'user-123', email: 'user@example.com' },
    config: { transactions: { enabled: false } },
  });

  const buildRes = () => ({
    headersSent: false,
    setHeader: jest.fn(),
    send: jest.fn(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTransactionsConfig.mockReturnValue({ enabled: false });
    mockRecordCollectedUsage.mockResolvedValue({ input_tokens: 100, output_tokens: 50 });
    db.getConvo.mockResolvedValue({ title: 'Test Chat' });
  });

  it('forwards transactions through spendCollectedUsage to recordCollectedUsage', async () => {
    const collectedUsage = [{ input_tokens: 100, output_tokens: 50, model: 'gpt-4' }];

    await spendCollectedUsage({
      userId: 'user-123',
      conversationId: 'convo-123',
      collectedUsage,
      fallbackModel: 'gpt-4',
      transactions: { enabled: false },
    });

    expect(mockRecordCollectedUsage).toHaveBeenCalledTimes(1);
    expect(mockRecordCollectedUsage).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ context: 'abort', transactions: { enabled: false } }),
    );
  });

  it('resolves the config from req and forwards it on the collected-usage path', async () => {
    const collectedUsage = [{ input_tokens: 100, output_tokens: 50, model: 'gpt-4' }];
    GenerationJobManager.abortJob.mockResolvedValue({
      success: true,
      jobData: buildJobData(),
      content: [],
      text: 'partial',
      collectedUsage,
    });

    const req = buildReq();
    await handleAbort()(req, buildRes());

    expect(logger.error).not.toHaveBeenCalled();
    expect(mockGetTransactionsConfig).toHaveBeenCalledWith(req.config);
    expect(mockRecordCollectedUsage).toHaveBeenCalledTimes(1);
    expect(mockRecordCollectedUsage).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ context: 'abort', transactions: { enabled: false } }),
    );
  });

  it('carries the context meta the run published onto the job into the stopped response', async () => {
    const contextMeta = {
      calibrationRatio: 1.2,
      encoding: 'claude',
      fading: { v: 1, budgetTokens: 50_000, masked: true },
    };
    GenerationJobManager.abortJob.mockResolvedValue({
      success: true,
      jobData: { ...buildJobData(), contextMeta },
      content: [],
      text: 'partial',
      collectedUsage: [],
    });
    const res = buildRes();

    await handleAbort()(buildReq(), res);

    expect(db.saveMessage).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ messageId: 'msg-123', contextMeta }),
      expect.any(Object),
    );
    const finalEvent = JSON.parse(res.send.mock.calls[0][0]);
    expect(finalEvent.responseMessage.contextMeta).toEqual(contextMeta);
  });

  it('unsets context meta on a stopped response when the job carries none', async () => {
    GenerationJobManager.abortJob.mockResolvedValue({
      success: true,
      jobData: buildJobData(),
      content: [],
      text: 'partial',
      collectedUsage: [],
    });

    await handleAbort()(buildReq(), buildRes());

    const [, savedMessage] = db.saveMessage.mock.calls[0];
    expect(savedMessage.contextMeta).toBeNull();
  });

  it('resolves the config from req and forwards it on the token-count fallback path', async () => {
    GenerationJobManager.abortJob.mockResolvedValue({
      success: true,
      jobData: buildJobData(),
      content: [],
      text: 'partial',
      collectedUsage: [],
    });

    const req = buildReq();
    await handleAbort()(req, buildRes());

    expect(logger.error).not.toHaveBeenCalled();
    expect(mockGetTransactionsConfig).toHaveBeenCalledWith(req.config);
    expect(mockRecordCollectedUsage).not.toHaveBeenCalled();
    expect(mockSpendTokens).toHaveBeenCalledTimes(1);
    expect(mockSpendTokens).toHaveBeenCalledWith(
      expect.objectContaining({ context: 'incomplete', transactions: { enabled: false } }),
      expect.any(Object),
    );
  });
});
