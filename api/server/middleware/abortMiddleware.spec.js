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

jest.mock('~/models/spendTokens', () => ({
  spendTokens: (...args) => mockSpendTokens(...args),
  spendStructuredTokens: (...args) => mockSpendStructuredTokens(...args),
}));

jest.mock('~/models/tx', () => ({
  getMultiplier: mockGetMultiplier,
  getCacheMultiplier: mockGetCacheMultiplier,
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock('@librechat/api', () => ({
  countTokens: jest.fn().mockResolvedValue(100),
  isEnabled: jest.fn().mockReturnValue(false),
  sendEvent: jest.fn(),
  GenerationJobManager: {
    abortJob: jest.fn(),
  },
  recordCollectedUsage: mockRecordCollectedUsage,
  sanitizeMessageForTransmit: jest.fn((msg) => msg),
}));

jest.mock('librechat-data-provider', () => ({
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
}));

jest.mock('./abortRun', () => ({
  abortRun: jest.fn(),
}));

const { spendCollectedUsage } = require('./abortMiddleware');

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
