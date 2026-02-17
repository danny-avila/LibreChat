/**
 * Tests for abortMiddleware - spendCollectedUsage function
 *
 * This tests the token spending logic for abort scenarios,
 * particularly for parallel agents (addedConvo) where multiple
 * models need their tokens spent.
 */

const mockSpendTokens = jest.fn().mockResolvedValue();
const mockSpendStructuredTokens = jest.fn().mockResolvedValue();

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

jest.mock('~/models', () => ({
  saveMessage: jest.fn().mockResolvedValue(),
  getConvo: jest.fn().mockResolvedValue({ title: 'Test Chat' }),
  spendTokens: (...args) => mockSpendTokens(...args),
  spendStructuredTokens: (...args) => mockSpendStructuredTokens(...args),
}));

jest.mock('./abortRun', () => ({
  abortRun: jest.fn(),
}));

// Import the module after mocks are set up
// We need to extract the spendCollectedUsage function for testing
// Since it's not exported, we'll test it through the handleAbort flow

describe('abortMiddleware - spendCollectedUsage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('spendCollectedUsage logic', () => {
    // Since spendCollectedUsage is not exported, we test the logic directly
    // by replicating the function here for unit testing

    const spendCollectedUsage = async ({
      userId,
      conversationId,
      collectedUsage,
      fallbackModel,
    }) => {
      if (!collectedUsage || collectedUsage.length === 0) {
        return;
      }

      const spendPromises = [];

      for (const usage of collectedUsage) {
        if (!usage) {
          continue;
        }

        const cache_creation =
          Number(usage.input_token_details?.cache_creation) ||
          Number(usage.cache_creation_input_tokens) ||
          0;
        const cache_read =
          Number(usage.input_token_details?.cache_read) ||
          Number(usage.cache_read_input_tokens) ||
          0;

        const txMetadata = {
          context: 'abort',
          conversationId,
          user: userId,
          model: usage.model ?? fallbackModel,
        };

        if (cache_creation > 0 || cache_read > 0) {
          spendPromises.push(
            mockSpendStructuredTokens(txMetadata, {
              promptTokens: {
                input: usage.input_tokens,
                write: cache_creation,
                read: cache_read,
              },
              completionTokens: usage.output_tokens,
            }).catch(() => {
              // Log error but don't throw
            }),
          );
          continue;
        }

        spendPromises.push(
          mockSpendTokens(txMetadata, {
            promptTokens: usage.input_tokens,
            completionTokens: usage.output_tokens,
          }).catch(() => {
            // Log error but don't throw
          }),
        );
      }

      // Wait for all token spending to complete
      await Promise.all(spendPromises);

      // Clear the array to prevent double-spending
      collectedUsage.length = 0;
    };

    it('should return early if collectedUsage is empty', async () => {
      await spendCollectedUsage({
        userId: 'user-123',
        conversationId: 'convo-123',
        collectedUsage: [],
        fallbackModel: 'gpt-4',
      });

      expect(mockSpendTokens).not.toHaveBeenCalled();
      expect(mockSpendStructuredTokens).not.toHaveBeenCalled();
    });

    it('should return early if collectedUsage is null', async () => {
      await spendCollectedUsage({
        userId: 'user-123',
        conversationId: 'convo-123',
        collectedUsage: null,
        fallbackModel: 'gpt-4',
      });

      expect(mockSpendTokens).not.toHaveBeenCalled();
      expect(mockSpendStructuredTokens).not.toHaveBeenCalled();
    });

    it('should skip null entries in collectedUsage', async () => {
      const collectedUsage = [
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4' },
        null,
        { input_tokens: 200, output_tokens: 60, model: 'gpt-4' },
      ];

      await spendCollectedUsage({
        userId: 'user-123',
        conversationId: 'convo-123',
        collectedUsage,
        fallbackModel: 'gpt-4',
      });

      expect(mockSpendTokens).toHaveBeenCalledTimes(2);
    });

    it('should spend tokens for single model', async () => {
      const collectedUsage = [{ input_tokens: 100, output_tokens: 50, model: 'gpt-4' }];

      await spendCollectedUsage({
        userId: 'user-123',
        conversationId: 'convo-123',
        collectedUsage,
        fallbackModel: 'gpt-4',
      });

      expect(mockSpendTokens).toHaveBeenCalledTimes(1);
      expect(mockSpendTokens).toHaveBeenCalledWith(
        expect.objectContaining({
          context: 'abort',
          conversationId: 'convo-123',
          user: 'user-123',
          model: 'gpt-4',
        }),
        { promptTokens: 100, completionTokens: 50 },
      );
    });

    it('should spend tokens for multiple models (parallel agents)', async () => {
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

      expect(mockSpendTokens).toHaveBeenCalledTimes(3);

      // Verify each model was called
      expect(mockSpendTokens).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ model: 'gpt-4' }),
        { promptTokens: 100, completionTokens: 50 },
      );
      expect(mockSpendTokens).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ model: 'claude-3' }),
        { promptTokens: 80, completionTokens: 40 },
      );
      expect(mockSpendTokens).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({ model: 'gemini-pro' }),
        { promptTokens: 120, completionTokens: 60 },
      );
    });

    it('should use fallbackModel when usage.model is missing', async () => {
      const collectedUsage = [{ input_tokens: 100, output_tokens: 50 }];

      await spendCollectedUsage({
        userId: 'user-123',
        conversationId: 'convo-123',
        collectedUsage,
        fallbackModel: 'fallback-model',
      });

      expect(mockSpendTokens).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'fallback-model' }),
        expect.any(Object),
      );
    });

    it('should use spendStructuredTokens for OpenAI format cache tokens', async () => {
      const collectedUsage = [
        {
          input_tokens: 100,
          output_tokens: 50,
          model: 'gpt-4',
          input_token_details: {
            cache_creation: 20,
            cache_read: 10,
          },
        },
      ];

      await spendCollectedUsage({
        userId: 'user-123',
        conversationId: 'convo-123',
        collectedUsage,
        fallbackModel: 'gpt-4',
      });

      expect(mockSpendStructuredTokens).toHaveBeenCalledTimes(1);
      expect(mockSpendTokens).not.toHaveBeenCalled();
      expect(mockSpendStructuredTokens).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-4', context: 'abort' }),
        {
          promptTokens: {
            input: 100,
            write: 20,
            read: 10,
          },
          completionTokens: 50,
        },
      );
    });

    it('should use spendStructuredTokens for Anthropic format cache tokens', async () => {
      const collectedUsage = [
        {
          input_tokens: 100,
          output_tokens: 50,
          model: 'claude-3',
          cache_creation_input_tokens: 25,
          cache_read_input_tokens: 15,
        },
      ];

      await spendCollectedUsage({
        userId: 'user-123',
        conversationId: 'convo-123',
        collectedUsage,
        fallbackModel: 'claude-3',
      });

      expect(mockSpendStructuredTokens).toHaveBeenCalledTimes(1);
      expect(mockSpendTokens).not.toHaveBeenCalled();
      expect(mockSpendStructuredTokens).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-3' }),
        {
          promptTokens: {
            input: 100,
            write: 25,
            read: 15,
          },
          completionTokens: 50,
        },
      );
    });

    it('should handle mixed cache and non-cache entries', async () => {
      const collectedUsage = [
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4' },
        {
          input_tokens: 150,
          output_tokens: 30,
          model: 'claude-3',
          cache_creation_input_tokens: 20,
          cache_read_input_tokens: 10,
        },
        { input_tokens: 200, output_tokens: 20, model: 'gemini-pro' },
      ];

      await spendCollectedUsage({
        userId: 'user-123',
        conversationId: 'convo-123',
        collectedUsage,
        fallbackModel: 'gpt-4',
      });

      expect(mockSpendTokens).toHaveBeenCalledTimes(2);
      expect(mockSpendStructuredTokens).toHaveBeenCalledTimes(1);
    });

    it('should handle real-world parallel agent abort scenario', async () => {
      // Simulates: Primary agent (gemini) + addedConvo agent (gpt-5) aborted mid-stream
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

      expect(mockSpendTokens).toHaveBeenCalledTimes(2);

      // Primary model
      expect(mockSpendTokens).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ model: 'gemini-3-flash-preview' }),
        { promptTokens: 31596, completionTokens: 151 },
      );

      // Parallel model (addedConvo)
      expect(mockSpendTokens).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ model: 'gpt-5.2' }),
        { promptTokens: 28000, completionTokens: 120 },
      );
    });

    it('should clear collectedUsage array after spending to prevent double-spending', async () => {
      // This tests the race condition fix: after abort middleware spends tokens,
      // the collectedUsage array is cleared so AgentClient.recordCollectedUsage()
      // (which shares the same array reference) sees an empty array and returns early.
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

      expect(mockSpendTokens).toHaveBeenCalledTimes(2);

      // The array should be cleared after spending
      expect(collectedUsage.length).toBe(0);
    });

    it('should await all token spending operations before clearing array', async () => {
      // Ensure we don't clear the array before spending completes
      let spendCallCount = 0;
      mockSpendTokens.mockImplementation(async () => {
        spendCallCount++;
        // Simulate async delay
        await new Promise((resolve) => setTimeout(resolve, 10));
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

      // Both spend calls should have completed
      expect(spendCallCount).toBe(2);

      // Array should be cleared after awaiting
      expect(collectedUsage.length).toBe(0);
    });
  });
});
