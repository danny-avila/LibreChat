import { recordCollectedUsage } from './usage';
import type { RecordUsageDeps, RecordUsageParams } from './usage';
import type { UsageMetadata } from '../stream/interfaces/IJobStore';

describe('recordCollectedUsage', () => {
  let mockSpendTokens: jest.Mock;
  let mockSpendStructuredTokens: jest.Mock;
  let deps: RecordUsageDeps;

  const baseParams: Omit<RecordUsageParams, 'collectedUsage'> = {
    user: 'user-123',
    conversationId: 'convo-123',
    model: 'gpt-4',
    context: 'message',
    balance: { enabled: true },
    transactions: { enabled: true },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSpendTokens = jest.fn().mockResolvedValue(undefined);
    mockSpendStructuredTokens = jest.fn().mockResolvedValue(undefined);
    deps = {
      spendTokens: mockSpendTokens,
      spendStructuredTokens: mockSpendStructuredTokens,
    };
  });

  describe('basic functionality', () => {
    it('should return undefined if collectedUsage is empty', async () => {
      const result = await recordCollectedUsage(deps, {
        ...baseParams,
        collectedUsage: [],
      });

      expect(result).toBeUndefined();
      expect(mockSpendTokens).not.toHaveBeenCalled();
      expect(mockSpendStructuredTokens).not.toHaveBeenCalled();
    });

    it('should return undefined if collectedUsage is null-ish', async () => {
      const result = await recordCollectedUsage(deps, {
        ...baseParams,
        collectedUsage: null as unknown as UsageMetadata[],
      });

      expect(result).toBeUndefined();
      expect(mockSpendTokens).not.toHaveBeenCalled();
    });

    it('should handle single usage entry correctly', async () => {
      const collectedUsage: UsageMetadata[] = [
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4' },
      ];

      const result = await recordCollectedUsage(deps, {
        ...baseParams,
        collectedUsage,
      });

      expect(mockSpendTokens).toHaveBeenCalledTimes(1);
      expect(mockSpendTokens).toHaveBeenCalledWith(
        expect.objectContaining({
          user: 'user-123',
          conversationId: 'convo-123',
          model: 'gpt-4',
          context: 'message',
        }),
        { promptTokens: 100, completionTokens: 50 },
      );
      expect(result).toEqual({ input_tokens: 100, output_tokens: 50 });
    });

    it('should skip null entries in collectedUsage', async () => {
      const collectedUsage = [
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4' },
        null,
        { input_tokens: 200, output_tokens: 60, model: 'gpt-4' },
      ] as UsageMetadata[];

      const result = await recordCollectedUsage(deps, {
        ...baseParams,
        collectedUsage,
      });

      expect(mockSpendTokens).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ input_tokens: 100, output_tokens: 110 });
    });
  });

  describe('sequential execution (tool calls)', () => {
    it('should calculate tokens correctly for sequential tool calls', async () => {
      const collectedUsage: UsageMetadata[] = [
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4' },
        { input_tokens: 150, output_tokens: 30, model: 'gpt-4' },
        { input_tokens: 180, output_tokens: 20, model: 'gpt-4' },
      ];

      const result = await recordCollectedUsage(deps, {
        ...baseParams,
        collectedUsage,
      });

      expect(mockSpendTokens).toHaveBeenCalledTimes(3);
      expect(result?.output_tokens).toBe(100); // 50 + 30 + 20
      expect(result?.input_tokens).toBe(100); // First entry's input
    });
  });

  describe('parallel execution (multiple agents)', () => {
    it('should handle parallel agents with independent input tokens', async () => {
      const collectedUsage: UsageMetadata[] = [
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4' },
        { input_tokens: 80, output_tokens: 40, model: 'gpt-4' },
      ];

      const result = await recordCollectedUsage(deps, {
        ...baseParams,
        collectedUsage,
      });

      expect(mockSpendTokens).toHaveBeenCalledTimes(2);
      expect(result?.output_tokens).toBe(90); // 50 + 40
      expect(result?.output_tokens).toBeGreaterThan(0);
    });

    it('should NOT produce negative output_tokens for parallel execution', async () => {
      const collectedUsage: UsageMetadata[] = [
        { input_tokens: 200, output_tokens: 100, model: 'gpt-4' },
        { input_tokens: 50, output_tokens: 30, model: 'gpt-4' },
      ];

      const result = await recordCollectedUsage(deps, {
        ...baseParams,
        collectedUsage,
      });

      expect(result?.output_tokens).toBeGreaterThan(0);
      expect(result?.output_tokens).toBe(130); // 100 + 30
    });

    it('should calculate correct total output for multiple parallel agents', async () => {
      const collectedUsage: UsageMetadata[] = [
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4' },
        { input_tokens: 120, output_tokens: 60, model: 'gpt-4-turbo' },
        { input_tokens: 80, output_tokens: 40, model: 'claude-3' },
      ];

      const result = await recordCollectedUsage(deps, {
        ...baseParams,
        collectedUsage,
      });

      expect(mockSpendTokens).toHaveBeenCalledTimes(3);
      expect(result?.output_tokens).toBe(150); // 50 + 60 + 40
    });
  });

  describe('cache token handling - OpenAI format', () => {
    it('should use spendStructuredTokens for cache tokens (input_token_details)', async () => {
      const collectedUsage: UsageMetadata[] = [
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

      const result = await recordCollectedUsage(deps, {
        ...baseParams,
        collectedUsage,
      });

      expect(mockSpendStructuredTokens).toHaveBeenCalledTimes(1);
      expect(mockSpendTokens).not.toHaveBeenCalled();
      expect(mockSpendStructuredTokens).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-4' }),
        {
          promptTokens: { input: 100, write: 20, read: 10 },
          completionTokens: 50,
        },
      );
      expect(result?.input_tokens).toBe(130); // 100 + 20 + 10
    });
  });

  describe('cache token handling - Anthropic format', () => {
    it('should use spendStructuredTokens for cache tokens (cache_*_input_tokens)', async () => {
      const collectedUsage: UsageMetadata[] = [
        {
          input_tokens: 100,
          output_tokens: 50,
          model: 'claude-3',
          cache_creation_input_tokens: 25,
          cache_read_input_tokens: 15,
        },
      ];

      const result = await recordCollectedUsage(deps, {
        ...baseParams,
        collectedUsage,
      });

      expect(mockSpendStructuredTokens).toHaveBeenCalledTimes(1);
      expect(mockSpendTokens).not.toHaveBeenCalled();
      expect(mockSpendStructuredTokens).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-3' }),
        {
          promptTokens: { input: 100, write: 25, read: 15 },
          completionTokens: 50,
        },
      );
      expect(result?.input_tokens).toBe(140); // 100 + 25 + 15
    });
  });

  describe('mixed cache and non-cache entries', () => {
    it('should handle mixed entries correctly', async () => {
      const collectedUsage: UsageMetadata[] = [
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4' },
        {
          input_tokens: 150,
          output_tokens: 30,
          model: 'gpt-4',
          input_token_details: { cache_creation: 10, cache_read: 5 },
        },
        { input_tokens: 200, output_tokens: 20, model: 'gpt-4' },
      ];

      const result = await recordCollectedUsage(deps, {
        ...baseParams,
        collectedUsage,
      });

      expect(mockSpendTokens).toHaveBeenCalledTimes(2);
      expect(mockSpendStructuredTokens).toHaveBeenCalledTimes(1);
      expect(result?.output_tokens).toBe(100); // 50 + 30 + 20
    });
  });

  describe('model fallback', () => {
    it('should use usage.model when available', async () => {
      const collectedUsage: UsageMetadata[] = [
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4-turbo' },
      ];

      await recordCollectedUsage(deps, {
        ...baseParams,
        model: 'fallback-model',
        collectedUsage,
      });

      expect(mockSpendTokens).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-4-turbo' }),
        expect.any(Object),
      );
    });

    it('should fallback to param model when usage.model is missing', async () => {
      const collectedUsage: UsageMetadata[] = [{ input_tokens: 100, output_tokens: 50 }];

      await recordCollectedUsage(deps, {
        ...baseParams,
        model: 'param-model',
        collectedUsage,
      });

      expect(mockSpendTokens).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'param-model' }),
        expect.any(Object),
      );
    });
  });

  describe('real-world scenarios', () => {
    it('should correctly sum output tokens for sequential tool calls with growing context', async () => {
      const collectedUsage: UsageMetadata[] = [
        { input_tokens: 31596, output_tokens: 151, model: 'claude-opus' },
        { input_tokens: 35368, output_tokens: 150, model: 'claude-opus' },
        { input_tokens: 58362, output_tokens: 295, model: 'claude-opus' },
        { input_tokens: 112604, output_tokens: 193, model: 'claude-opus' },
        { input_tokens: 257440, output_tokens: 2217, model: 'claude-opus' },
      ];

      const result = await recordCollectedUsage(deps, {
        ...baseParams,
        collectedUsage,
      });

      expect(result?.input_tokens).toBe(31596);
      expect(result?.output_tokens).toBe(3006); // 151 + 150 + 295 + 193 + 2217
      expect(mockSpendTokens).toHaveBeenCalledTimes(5);
    });

    it('should handle cache tokens with multiple tool calls', async () => {
      const collectedUsage: UsageMetadata[] = [
        {
          input_tokens: 788,
          output_tokens: 163,
          model: 'claude-opus',
          input_token_details: { cache_read: 0, cache_creation: 30808 },
        },
        {
          input_tokens: 3802,
          output_tokens: 149,
          model: 'claude-opus',
          input_token_details: { cache_read: 30808, cache_creation: 768 },
        },
        {
          input_tokens: 26808,
          output_tokens: 225,
          model: 'claude-opus',
          input_token_details: { cache_read: 31576, cache_creation: 0 },
        },
      ];

      const result = await recordCollectedUsage(deps, {
        ...baseParams,
        collectedUsage,
      });

      // input_tokens = 788 + 30808 + 0 = 31596
      expect(result?.input_tokens).toBe(31596);
      // output_tokens = 163 + 149 + 225 = 537
      expect(result?.output_tokens).toBe(537);
      expect(mockSpendStructuredTokens).toHaveBeenCalledTimes(3);
      expect(mockSpendTokens).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should catch and log errors from spendTokens without throwing', async () => {
      mockSpendTokens.mockRejectedValue(new Error('DB error'));

      const collectedUsage: UsageMetadata[] = [
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4' },
      ];

      const result = await recordCollectedUsage(deps, {
        ...baseParams,
        collectedUsage,
      });

      expect(result).toEqual({ input_tokens: 100, output_tokens: 50 });
    });

    it('should catch and log errors from spendStructuredTokens without throwing', async () => {
      mockSpendStructuredTokens.mockRejectedValue(new Error('DB error'));

      const collectedUsage: UsageMetadata[] = [
        {
          input_tokens: 100,
          output_tokens: 50,
          model: 'gpt-4',
          input_token_details: { cache_creation: 20, cache_read: 10 },
        },
      ];

      const result = await recordCollectedUsage(deps, {
        ...baseParams,
        collectedUsage,
      });

      expect(result).toEqual({ input_tokens: 130, output_tokens: 50 });
    });
  });

  describe('transaction metadata', () => {
    it('should pass all metadata fields to spend functions', async () => {
      const collectedUsage: UsageMetadata[] = [
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4' },
      ];

      const endpointTokenConfig = { 'gpt-4': { prompt: 0.01, completion: 0.03, context: 8192 } };

      await recordCollectedUsage(deps, {
        ...baseParams,
        endpointTokenConfig,
        collectedUsage,
      });

      expect(mockSpendTokens).toHaveBeenCalledWith(
        {
          user: 'user-123',
          conversationId: 'convo-123',
          model: 'gpt-4',
          context: 'message',
          balance: { enabled: true },
          transactions: { enabled: true },
          endpointTokenConfig,
        },
        { promptTokens: 100, completionTokens: 50 },
      );
    });

    it('should use default context "message" when not provided', async () => {
      const collectedUsage: UsageMetadata[] = [
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4' },
      ];

      await recordCollectedUsage(deps, {
        user: 'user-123',
        conversationId: 'convo-123',
        collectedUsage,
      });

      expect(mockSpendTokens).toHaveBeenCalledWith(
        expect.objectContaining({ context: 'message' }),
        expect.any(Object),
      );
    });

    it('should allow custom context like "title"', async () => {
      const collectedUsage: UsageMetadata[] = [
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4' },
      ];

      await recordCollectedUsage(deps, {
        ...baseParams,
        context: 'title',
        collectedUsage,
      });

      expect(mockSpendTokens).toHaveBeenCalledWith(
        expect.objectContaining({ context: 'title' }),
        expect.any(Object),
      );
    });
  });
});
