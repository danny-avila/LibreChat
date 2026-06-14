import type { TContextUsageEvent, TTokenUsageEvent } from 'librechat-data-provider';
import type { RecordUsageDeps, RecordUsageParams, SubagentUsageEvent } from './usage';
import type { UsageMetadata } from '../stream/interfaces/IJobStore';
import type { BulkWriteDeps, PricingFns } from './transactions';
import {
  computeUsageCostUSD,
  aggregateEmittedUsage,
  createSubagentUsageSink,
  recordCollectedUsage,
  buildPersistedContextUsage,
} from './usage';

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

  describe('summarization usage segregation', () => {
    it('includes summarization output tokens in total while billing under separate context', async () => {
      const collectedUsage: UsageMetadata[] = [
        {
          usage_type: 'message',
          input_tokens: 120,
          output_tokens: 40,
          model: 'gpt-4',
        },
        {
          usage_type: 'summarization',
          input_tokens: 30,
          output_tokens: 12,
          model: 'gpt-4.1-mini',
        },
      ];

      const result = await recordCollectedUsage(deps, {
        ...baseParams,
        collectedUsage,
      });

      expect(result).toEqual({ input_tokens: 120, output_tokens: 52 });
      expect(mockSpendTokens).toHaveBeenCalledTimes(2);
      expect(mockSpendTokens).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ context: 'message', model: 'gpt-4' }),
        expect.any(Object),
      );
      expect(mockSpendTokens).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          context: 'summarization',
          model: 'gpt-4.1-mini',
        }),
        expect.any(Object),
      );
    });
  });

  describe('subagent usage segregation', () => {
    it('bills subagent entries under separate context while excluding them from reported totals', async () => {
      const collectedUsage: UsageMetadata[] = [
        {
          usage_type: 'message',
          input_tokens: 120,
          output_tokens: 40,
          model: 'gpt-4',
        },
        {
          usage_type: 'subagent',
          input_tokens: 900,
          output_tokens: 700,
          model: 'claude-haiku-4-5',
          provider: 'anthropic',
        },
        {
          usage_type: 'subagent',
          input_tokens: 1100,
          output_tokens: 300,
          model: 'claude-haiku-4-5',
          provider: 'anthropic',
        },
      ];

      const result = await recordCollectedUsage(deps, {
        ...baseParams,
        collectedUsage,
      });

      /**
       * `input_tokens` comes from the first MESSAGE usage; `output_tokens`
       * excludes subagent completions — the result becomes the parent
       * response message's tokenCount, and child output the parent never
       * saw must not distort next-turn context accounting.
       */
      expect(result).toEqual({ input_tokens: 120, output_tokens: 40 });
      /** ...but every subagent call is still billed against balance. */
      expect(mockSpendTokens).toHaveBeenCalledTimes(3);
      expect(mockSpendTokens).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          context: 'subagent',
          model: 'claude-haiku-4-5',
        }),
        { promptTokens: 900, completionTokens: 700 },
      );
      expect(mockSpendTokens).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          context: 'subagent',
          model: 'claude-haiku-4-5',
        }),
        { promptTokens: 1100, completionTokens: 300 },
      );
    });

    it('bills hidden sequential-agent usage but excludes it from reported totals', async () => {
      const collectedUsage: UsageMetadata[] = [
        { usage_type: 'message', input_tokens: 120, output_tokens: 40, model: 'gpt-4' },
        { usage_type: 'sequential', input_tokens: 800, output_tokens: 250, model: 'gpt-4' },
      ];

      const result = await recordCollectedUsage(deps, { ...baseParams, collectedUsage });

      /** Hidden intermediate output stays out of the parent's tokenCount... */
      expect(result).toEqual({ input_tokens: 120, output_tokens: 40 });
      /** ...but is still billed under its own context. */
      expect(mockSpendTokens).toHaveBeenCalledTimes(2);
      expect(mockSpendTokens).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ context: 'sequential', model: 'gpt-4' }),
        { promptTokens: 800, completionTokens: 250 },
      );
    });

    it('does not let a leading subagent entry hijack reported input_tokens', async () => {
      const collectedUsage: UsageMetadata[] = [
        {
          usage_type: 'subagent',
          input_tokens: 5000,
          output_tokens: 900,
          model: 'claude-haiku-4-5',
        },
        {
          input_tokens: 120,
          output_tokens: 40,
          model: 'gpt-4',
        },
      ];

      const result = await recordCollectedUsage(deps, {
        ...baseParams,
        collectedUsage,
      });

      expect(result).toEqual({ input_tokens: 120, output_tokens: 40 });
      expect(mockSpendTokens).toHaveBeenCalledTimes(2);
    });

    it('uses structured spend for subagent entries with cache tokens', async () => {
      const collectedUsage: UsageMetadata[] = [
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4' },
        {
          usage_type: 'subagent',
          input_tokens: 200,
          output_tokens: 80,
          model: 'claude-haiku-4-5',
          provider: 'anthropic',
          input_token_details: { cache_creation: 60, cache_read: 30 },
        },
      ];

      await recordCollectedUsage(deps, {
        ...baseParams,
        collectedUsage,
      });

      expect(mockSpendStructuredTokens).toHaveBeenCalledTimes(1);
      expect(mockSpendStructuredTokens).toHaveBeenCalledWith(
        expect.objectContaining({
          context: 'subagent',
          model: 'claude-haiku-4-5',
        }),
        {
          promptTokens: { input: 200, write: 60, read: 30 },
          completionTokens: 80,
        },
      );
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

  describe('cache token handling - subset providers (input_tokens already includes cache)', () => {
    it('subtracts cache from input_tokens for OpenAI to avoid double-counting', async () => {
      const collectedUsage: UsageMetadata[] = [
        {
          input_tokens: 100,
          output_tokens: 50,
          model: 'gpt-4',
          provider: 'openAI',
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
          promptTokens: { input: 70, write: 20, read: 10 },
          completionTokens: 50,
        },
      );
      expect(result?.input_tokens).toBe(100);
    });

    it('does not double-count cache_read for Gemini — issue #12855', async () => {
      // Real numbers from the issue report
      const collectedUsage: UsageMetadata[] = [
        {
          input_tokens: 11125,
          output_tokens: 20,
          model: 'gemini-3-flash-preview',
          provider: 'google',
          input_token_details: { cache_read: 7441 },
        },
      ];

      const result = await recordCollectedUsage(deps, {
        ...baseParams,
        collectedUsage,
      });

      expect(mockSpendStructuredTokens).toHaveBeenCalledTimes(1);
      expect(mockSpendStructuredTokens).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-3-flash-preview' }),
        {
          promptTokens: { input: 3684, write: 0, read: 7441 },
          completionTokens: 20,
        },
      );
      expect(result?.input_tokens).toBe(11125);
    });

    it('also applies to Vertex AI', async () => {
      const collectedUsage: UsageMetadata[] = [
        {
          input_tokens: 5000,
          output_tokens: 100,
          model: 'gemini-2.5-pro',
          provider: 'vertexai',
          input_token_details: { cache_read: 4000 },
        },
      ];

      await recordCollectedUsage(deps, {
        ...baseParams,
        collectedUsage,
      });

      expect(mockSpendStructuredTokens).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-2.5-pro' }),
        {
          promptTokens: { input: 1000, write: 0, read: 4000 },
          completionTokens: 100,
        },
      );
    });

    it('handles cache_read >= input_tokens defensively (clamps inputOnly to 0)', async () => {
      const collectedUsage: UsageMetadata[] = [
        {
          input_tokens: 1000,
          output_tokens: 30,
          model: 'gemini-2.5-pro',
          provider: 'google',
          input_token_details: { cache_read: 1000 },
        },
      ];

      await recordCollectedUsage(deps, {
        ...baseParams,
        collectedUsage,
      });

      expect(mockSpendStructuredTokens).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-2.5-pro' }),
        {
          promptTokens: { input: 0, write: 0, read: 1000 },
          completionTokens: 30,
        },
      );
    });

    it('falls through to additive (historical default) when provider is missing', async () => {
      // Defensive: an unclassified or pre-this-PR usage entry should keep old behavior
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

      expect(mockSpendStructuredTokens).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-4' }),
        {
          promptTokens: { input: 100, write: 20, read: 10 },
          completionTokens: 50,
        },
      );
      expect(result?.input_tokens).toBe(130);
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

  describe('reasoning token handling - issue #13006', () => {
    it('uses total - input when output_tokens undercounts (Vertex stream undercount with details present)', async () => {
      const collectedUsage: UsageMetadata[] = [
        {
          input_tokens: 80657,
          output_tokens: 766,
          total_tokens: 83265,
          output_token_details: { reasoning: 1842 },
          model: 'gemini-3-flash-preview',
          provider: 'vertexai',
        },
      ];

      const result = await recordCollectedUsage(deps, {
        ...baseParams,
        collectedUsage,
      });

      expect(mockSpendTokens).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-3-flash-preview' }),
        { promptTokens: 80657, completionTokens: 2608 },
      );
      expect(result?.output_tokens).toBe(2608);
    });

    it('uses total - input even when output_token_details is missing (raw langchain google-common path)', async () => {
      const collectedUsage: UsageMetadata[] = [
        {
          input_tokens: 12,
          output_tokens: 135,
          total_tokens: 309,
          model: 'gemini-3-flash-preview',
          provider: 'vertexai',
        },
      ];

      const result = await recordCollectedUsage(deps, {
        ...baseParams,
        collectedUsage,
      });

      expect(mockSpendTokens).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-3-flash-preview' }),
        { promptTokens: 12, completionTokens: 297 },
      );
      expect(result?.output_tokens).toBe(297);
    });

    it('does not change output when invariant already holds (OpenAI o-series, reasoning already a subset)', async () => {
      const collectedUsage: UsageMetadata[] = [
        {
          input_tokens: 100,
          output_tokens: 500,
          total_tokens: 600,
          output_token_details: { reasoning: 200 },
          model: 'o1-preview',
          provider: 'openAI',
        },
      ];

      const result = await recordCollectedUsage(deps, {
        ...baseParams,
        collectedUsage,
      });

      expect(mockSpendTokens).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'o1-preview' }),
        { promptTokens: 100, completionTokens: 500 },
      );
      expect(result?.output_tokens).toBe(500);
    });

    it('routes correction through structured spend when cache tokens are present', async () => {
      const collectedUsage: UsageMetadata[] = [
        {
          input_tokens: 80657,
          output_tokens: 766,
          total_tokens: 83265,
          output_token_details: { reasoning: 1842 },
          input_token_details: { cache_read: 30000 },
          model: 'gemini-3-flash-preview',
          provider: 'vertexai',
        },
      ];

      await recordCollectedUsage(deps, {
        ...baseParams,
        collectedUsage,
      });

      expect(mockSpendStructuredTokens).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-3-flash-preview' }),
        {
          promptTokens: { input: 50657, write: 0, read: 30000 },
          completionTokens: 2608,
        },
      );
    });

    it('no-op when total_tokens is absent or zero', async () => {
      const collectedUsage: UsageMetadata[] = [
        {
          input_tokens: 100,
          output_tokens: 50,
          model: 'gpt-4',
          provider: 'openAI',
        },
      ];

      const result = await recordCollectedUsage(deps, {
        ...baseParams,
        collectedUsage,
      });

      expect(mockSpendTokens).toHaveBeenCalledWith(expect.anything(), {
        promptTokens: 100,
        completionTokens: 50,
      });
      expect(result?.output_tokens).toBe(50);
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
          provider: 'openAI',
          input_token_details: { cache_creation: 20, cache_read: 10 },
        },
      ];

      const result = await recordCollectedUsage(deps, {
        ...baseParams,
        collectedUsage,
      });

      // openAI is a subset provider → input_tokens already includes cache
      expect(result).toEqual({ input_tokens: 100, output_tokens: 50 });
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
        messageId: 'msg-123',
        endpointTokenConfig,
        collectedUsage,
      });

      expect(mockSpendTokens).toHaveBeenCalledWith(
        {
          user: 'user-123',
          conversationId: 'convo-123',
          model: 'gpt-4',
          context: 'message',
          messageId: 'msg-123',
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

  describe('messageId propagation', () => {
    it('should pass messageId to spendTokens', async () => {
      const collectedUsage: UsageMetadata[] = [
        { input_tokens: 10, output_tokens: 5, model: 'gpt-4' },
      ];

      await recordCollectedUsage(deps, {
        ...baseParams,
        messageId: 'msg-1',
        collectedUsage,
      });

      expect(mockSpendTokens).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: 'msg-1' }),
        expect.any(Object),
      );
    });

    it('should pass messageId to spendStructuredTokens for cache paths', async () => {
      const collectedUsage: UsageMetadata[] = [
        {
          input_tokens: 100,
          output_tokens: 50,
          model: 'claude-3',
          cache_creation_input_tokens: 25,
          cache_read_input_tokens: 15,
        },
      ];

      await recordCollectedUsage(deps, {
        ...baseParams,
        messageId: 'msg-cache-1',
        collectedUsage,
      });

      expect(mockSpendStructuredTokens).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: 'msg-cache-1' }),
        expect.any(Object),
      );
      expect(mockSpendTokens).not.toHaveBeenCalled();
    });

    it('should pass undefined messageId when not provided', async () => {
      const collectedUsage: UsageMetadata[] = [
        { input_tokens: 10, output_tokens: 5, model: 'gpt-4' },
      ];

      await recordCollectedUsage(deps, {
        user: 'user-123',
        conversationId: 'convo-123',
        collectedUsage,
      });

      expect(mockSpendTokens).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: undefined }),
        expect.any(Object),
      );
    });

    it('should propagate messageId across multiple usage entries', async () => {
      const collectedUsage: UsageMetadata[] = [
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4' },
        { input_tokens: 200, output_tokens: 60, model: 'gpt-4' },
        {
          input_tokens: 150,
          output_tokens: 30,
          model: 'gpt-4',
          input_token_details: { cache_creation: 10, cache_read: 5 },
        },
      ];

      await recordCollectedUsage(deps, {
        ...baseParams,
        messageId: 'msg-multi',
        collectedUsage,
      });

      expect(mockSpendTokens).toHaveBeenCalledTimes(2);
      expect(mockSpendStructuredTokens).toHaveBeenCalledTimes(1);

      for (const call of mockSpendTokens.mock.calls) {
        expect(call[0]).toEqual(expect.objectContaining({ messageId: 'msg-multi' }));
      }
      expect(mockSpendStructuredTokens.mock.calls[0][0]).toEqual(
        expect.objectContaining({ messageId: 'msg-multi' }),
      );
    });
  });

  describe('bulk write path', () => {
    let mockInsertMany: jest.Mock;
    let mockUpdateBalance: jest.Mock;
    let mockPricing: PricingFns;
    let mockBulkWriteOps: BulkWriteDeps;
    let bulkDeps: RecordUsageDeps;

    beforeEach(() => {
      mockInsertMany = jest.fn().mockResolvedValue(undefined);
      mockUpdateBalance = jest.fn().mockResolvedValue({});
      mockPricing = {
        getMultiplier: jest.fn().mockReturnValue(1),
        getCacheMultiplier: jest.fn().mockReturnValue(null),
      };
      mockBulkWriteOps = {
        insertMany: mockInsertMany,
        updateBalance: mockUpdateBalance,
      };
      bulkDeps = {
        spendTokens: mockSpendTokens,
        spendStructuredTokens: mockSpendStructuredTokens,
        pricing: mockPricing,
        bulkWriteOps: mockBulkWriteOps,
      };
    });

    it('should use bulk path when pricing and bulkWriteOps are provided', async () => {
      const collectedUsage: UsageMetadata[] = [
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4' },
      ];

      const result = await recordCollectedUsage(bulkDeps, {
        ...baseParams,
        collectedUsage,
      });

      expect(mockInsertMany).toHaveBeenCalledTimes(1);
      expect(mockSpendTokens).not.toHaveBeenCalled();
      expect(mockSpendStructuredTokens).not.toHaveBeenCalled();
      expect(result).toEqual({ input_tokens: 100, output_tokens: 50 });
    });

    it('should batch all entries into a single insertMany call', async () => {
      const collectedUsage: UsageMetadata[] = [
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4' },
        { input_tokens: 200, output_tokens: 60, model: 'gpt-4' },
        { input_tokens: 300, output_tokens: 70, model: 'gpt-4' },
      ];

      await recordCollectedUsage(bulkDeps, {
        ...baseParams,
        collectedUsage,
      });

      expect(mockInsertMany).toHaveBeenCalledTimes(1);
      const insertedDocs = mockInsertMany.mock.calls[0][0];
      expect(insertedDocs.length).toBe(6); // 2 per entry (prompt + completion)
    });

    it('should call updateBalance once when balance is enabled', async () => {
      const collectedUsage: UsageMetadata[] = [
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4' },
        { input_tokens: 200, output_tokens: 60, model: 'gpt-4' },
      ];

      await recordCollectedUsage(bulkDeps, {
        ...baseParams,
        balance: { enabled: true },
        collectedUsage,
      });

      expect(mockUpdateBalance).toHaveBeenCalledTimes(1);
      expect(mockUpdateBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          user: 'user-123',
          incrementValue: expect.any(Number),
        }),
      );
    });

    it('should not call updateBalance when balance is disabled', async () => {
      const collectedUsage: UsageMetadata[] = [
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4' },
      ];

      await recordCollectedUsage(bulkDeps, {
        ...baseParams,
        balance: { enabled: false },
        collectedUsage,
      });

      expect(mockInsertMany).toHaveBeenCalledTimes(1);
      expect(mockUpdateBalance).not.toHaveBeenCalled();
    });

    it('should handle cache tokens via bulk path', async () => {
      const collectedUsage: UsageMetadata[] = [
        {
          input_tokens: 100,
          output_tokens: 50,
          model: 'gpt-4',
          input_token_details: { cache_creation: 20, cache_read: 10 },
        },
      ];

      const result = await recordCollectedUsage(bulkDeps, {
        ...baseParams,
        collectedUsage,
      });

      expect(mockInsertMany).toHaveBeenCalledTimes(1);
      expect(mockSpendStructuredTokens).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should handle mixed cache and non-cache entries in bulk', async () => {
      const collectedUsage: UsageMetadata[] = [
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4' },
        {
          input_tokens: 150,
          output_tokens: 30,
          model: 'gpt-4',
          input_token_details: { cache_creation: 10, cache_read: 5 },
        },
      ];

      const result = await recordCollectedUsage(bulkDeps, {
        ...baseParams,
        collectedUsage,
      });

      expect(mockInsertMany).toHaveBeenCalledTimes(1);
      expect(mockSpendTokens).not.toHaveBeenCalled();
      expect(mockSpendStructuredTokens).not.toHaveBeenCalled();
      expect(result?.output_tokens).toBe(80);
    });

    it('should fall back to legacy path when pricing is missing', async () => {
      const legacyDeps: RecordUsageDeps = {
        spendTokens: mockSpendTokens,
        spendStructuredTokens: mockSpendStructuredTokens,
        bulkWriteOps: mockBulkWriteOps,
        // no pricing
      };

      const collectedUsage: UsageMetadata[] = [
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4' },
      ];

      await recordCollectedUsage(legacyDeps, {
        ...baseParams,
        collectedUsage,
      });

      expect(mockSpendTokens).toHaveBeenCalledTimes(1);
      expect(mockInsertMany).not.toHaveBeenCalled();
    });

    it('should fall back to legacy path when bulkWriteOps is missing', async () => {
      const legacyDeps: RecordUsageDeps = {
        spendTokens: mockSpendTokens,
        spendStructuredTokens: mockSpendStructuredTokens,
        pricing: mockPricing,
        // no bulkWriteOps
      };

      const collectedUsage: UsageMetadata[] = [
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4' },
      ];

      await recordCollectedUsage(legacyDeps, {
        ...baseParams,
        collectedUsage,
      });

      expect(mockSpendTokens).toHaveBeenCalledTimes(1);
      expect(mockInsertMany).not.toHaveBeenCalled();
    });

    it('should handle errors in bulk write gracefully', async () => {
      mockInsertMany.mockRejectedValue(new Error('DB error'));

      const collectedUsage: UsageMetadata[] = [
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4' },
      ];

      const result = await recordCollectedUsage(bulkDeps, {
        ...baseParams,
        collectedUsage,
      });

      expect(result).toEqual({ input_tokens: 100, output_tokens: 50 });
    });
  });

  describe('Bedrock prompt caching — completion token inflation regression', () => {
    it('does not fold cache_creation into completion on the first cached step', async () => {
      // Bedrock: total = input + output + cache_creation (additive, not subset).
      // Before fix: resolveCompletionTokens returned output + cache_creation (5500)
      // instead of output (500).
      const collectedUsage: UsageMetadata[] = [
        {
          input_tokens: 100,
          output_tokens: 500,
          total_tokens: 5600,
          cache_creation_input_tokens: 5000,
          cache_read_input_tokens: 0,
          model: 'claude-sonnet-4-6',
        },
      ];

      const result = await recordCollectedUsage(deps, { ...baseParams, collectedUsage });

      expect(mockSpendStructuredTokens).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-sonnet-4-6' }),
        {
          promptTokens: { input: 100, write: 5000, read: 0 },
          completionTokens: 500,
        },
      );
      expect(result?.output_tokens).toBe(500);
    });

    it('does not fold cache_read into completion on subsequent cached steps', async () => {
      // Bedrock: total = input + output + cache_read on every read step.
      // Before fix: each step returned output + cache_read instead of output.
      const collectedUsage: UsageMetadata[] = [
        {
          input_tokens: 200,
          output_tokens: 300,
          total_tokens: 4500,
          cache_read_input_tokens: 4000,
          cache_creation_input_tokens: 0,
          model: 'claude-sonnet-4-6',
        },
      ];

      const result = await recordCollectedUsage(deps, { ...baseParams, collectedUsage });

      expect(mockSpendStructuredTokens).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-sonnet-4-6' }),
        {
          promptTokens: { input: 200, write: 0, read: 4000 },
          completionTokens: 300,
        },
      );
      expect(result?.output_tokens).toBe(300);
    });

    it('handles cache tokens in input_token_details format (alternate field path)', async () => {
      const collectedUsage: UsageMetadata[] = [
        {
          input_tokens: 200,
          output_tokens: 300,
          total_tokens: 4500,
          input_token_details: { cache_read: 4000, cache_creation: 0 },
          model: 'claude-sonnet-4-6',
        },
      ];

      const result = await recordCollectedUsage(deps, { ...baseParams, collectedUsage });

      expect(result?.output_tokens).toBe(300);
    });

    it('accumulates only true output across a multi-step cached agent run', async () => {
      // 1 write step + 4 read steps. Without the fix, each step folds its
      // cache tokens into completion, inflating the total by the full cache size.
      const writeStep: UsageMetadata = {
        input_tokens: 100,
        output_tokens: 500,
        total_tokens: 5600,
        cache_creation_input_tokens: 5000,
        cache_read_input_tokens: 0,
        model: 'claude-sonnet-4-6',
      };
      const readSteps: UsageMetadata[] = Array.from({ length: 4 }, (_, i) => ({
        input_tokens: 200,
        output_tokens: 300 + i * 50,
        total_tokens: 200 + (300 + i * 50) + 5000,
        cache_read_input_tokens: 5000,
        cache_creation_input_tokens: 0,
        model: 'claude-sonnet-4-6',
      }));

      const result = await recordCollectedUsage(deps, {
        ...baseParams,
        collectedUsage: [writeStep, ...readSteps],
      });

      // True output: 500 + 300 + 350 + 400 + 450 = 2000
      const trueOutput = 500 + readSteps.reduce((sum, s) => sum + (s.output_tokens ?? 0), 0);
      expect(result?.output_tokens).toBe(trueOutput);
    });
  });

  describe('bulk write with summarization usage', () => {
    let mockInsertMany: jest.Mock;
    let mockUpdateBalance: jest.Mock;
    let mockPricing: PricingFns;
    let mockBulkWriteOps: BulkWriteDeps;
    let bulkDeps: RecordUsageDeps;

    beforeEach(() => {
      mockInsertMany = jest.fn().mockResolvedValue(undefined);
      mockUpdateBalance = jest.fn().mockResolvedValue({});
      mockPricing = {
        getMultiplier: jest.fn().mockReturnValue(1),
        getCacheMultiplier: jest.fn().mockReturnValue(null),
      };
      mockBulkWriteOps = {
        insertMany: mockInsertMany,
        updateBalance: mockUpdateBalance,
      };
      bulkDeps = {
        spendTokens: mockSpendTokens,
        spendStructuredTokens: mockSpendStructuredTokens,
        pricing: mockPricing,
        bulkWriteOps: mockBulkWriteOps,
      };
    });

    it('combines message and summarization docs into a single bulk write', async () => {
      const collectedUsage: UsageMetadata[] = [
        {
          usage_type: 'message',
          input_tokens: 200,
          output_tokens: 80,
          model: 'gpt-4',
        },
        {
          usage_type: 'summarization',
          input_tokens: 50,
          output_tokens: 20,
          model: 'gpt-4.1-mini',
        },
      ];

      const result = await recordCollectedUsage(bulkDeps, {
        ...baseParams,
        collectedUsage,
      });

      expect(mockInsertMany).toHaveBeenCalledTimes(1);
      expect(mockUpdateBalance).toHaveBeenCalledTimes(1);
      expect(mockSpendTokens).not.toHaveBeenCalled();
      expect(mockSpendStructuredTokens).not.toHaveBeenCalled();

      const insertedDocs = mockInsertMany.mock.calls[0][0];
      // 2 docs per entry (prompt + completion) x 2 entries = 4 docs
      expect(insertedDocs).toHaveLength(4);

      const messageContextDocs = insertedDocs.filter(
        (d: Record<string, unknown>) => d.context === 'message',
      );
      const summarizationContextDocs = insertedDocs.filter(
        (d: Record<string, unknown>) => d.context === 'summarization',
      );
      expect(messageContextDocs).toHaveLength(2);
      expect(summarizationContextDocs).toHaveLength(2);

      expect(result).toEqual({ input_tokens: 200, output_tokens: 100 });
    });

    it('handles summarization-only usage in bulk mode', async () => {
      const collectedUsage: UsageMetadata[] = [
        {
          usage_type: 'summarization',
          input_tokens: 60,
          output_tokens: 25,
          model: 'gpt-4.1-mini',
        },
      ];

      const result = await recordCollectedUsage(bulkDeps, {
        ...baseParams,
        collectedUsage,
      });

      expect(mockInsertMany).toHaveBeenCalledTimes(1);
      expect(mockSpendTokens).not.toHaveBeenCalled();
      expect(mockSpendStructuredTokens).not.toHaveBeenCalled();

      const insertedDocs = mockInsertMany.mock.calls[0][0];
      expect(insertedDocs).toHaveLength(2);

      const summarizationContextDocs = insertedDocs.filter(
        (d: Record<string, unknown>) => d.context === 'summarization',
      );
      expect(summarizationContextDocs).toHaveLength(2);

      expect(result).toEqual({ input_tokens: 0, output_tokens: 25 });
    });

    it('handles message-only usage in bulk mode', async () => {
      const collectedUsage: UsageMetadata[] = [
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4' },
        { input_tokens: 200, output_tokens: 60, model: 'gpt-4' },
      ];

      const result = await recordCollectedUsage(bulkDeps, {
        ...baseParams,
        collectedUsage,
      });

      expect(mockInsertMany).toHaveBeenCalledTimes(1);
      expect(mockSpendTokens).not.toHaveBeenCalled();
      expect(mockSpendStructuredTokens).not.toHaveBeenCalled();

      const insertedDocs = mockInsertMany.mock.calls[0][0];
      // 2 docs per entry x 2 entries = 4 docs
      expect(insertedDocs).toHaveLength(4);

      const messageContextDocs = insertedDocs.filter(
        (d: Record<string, unknown>) => d.context === 'message',
      );
      expect(messageContextDocs).toHaveLength(4);

      expect(result).toEqual({ input_tokens: 100, output_tokens: 110 });
    });
  });
});

describe('createSubagentUsageSink', () => {
  const makeEvent = (overrides: Partial<SubagentUsageEvent> = {}): SubagentUsageEvent => ({
    usage: { input_tokens: 900, output_tokens: 700, total_tokens: 1600 },
    model: 'claude-haiku-4-5',
    provider: 'anthropic',
    subagentType: 'researcher',
    subagentRunId: 'run-1_sub_abc',
    subagentAgentId: 'researcher',
    runId: 'run-1',
    ...overrides,
  });

  it('pushes usage tagged with usage_type subagent and the child model/provider', () => {
    const collectedUsage: UsageMetadata[] = [];
    const sink = createSubagentUsageSink(collectedUsage);

    sink(makeEvent());

    expect(collectedUsage).toEqual([
      {
        usage_type: 'subagent',
        input_tokens: 900,
        output_tokens: 700,
        total_tokens: 1600,
        model: 'claude-haiku-4-5',
        provider: 'anthropic',
      },
    ]);
  });

  it('preserves cache token details from the child call', () => {
    const collectedUsage: UsageMetadata[] = [];
    const sink = createSubagentUsageSink(collectedUsage);

    sink(
      makeEvent({
        usage: {
          input_tokens: 200,
          output_tokens: 80,
          total_tokens: 280,
          input_token_details: { cache_creation: 60, cache_read: 30 },
        } as SubagentUsageEvent['usage'],
      }),
    );

    expect(collectedUsage[0].input_token_details).toEqual({
      cache_creation: 60,
      cache_read: 30,
    });
  });

  it('omits model/provider tags when the event carries none', () => {
    const collectedUsage: UsageMetadata[] = [];
    const sink = createSubagentUsageSink(collectedUsage);

    sink(makeEvent({ model: undefined, provider: undefined }));

    expect(collectedUsage).toHaveLength(1);
    expect(collectedUsage[0].usage_type).toBe('subagent');
    expect(collectedUsage[0]).not.toHaveProperty('model');
    expect(collectedUsage[0]).not.toHaveProperty('provider');
  });

  it('ignores events without usage', () => {
    const collectedUsage: UsageMetadata[] = [];
    const sink = createSubagentUsageSink(collectedUsage);

    sink(makeEvent({ usage: undefined as unknown as SubagentUsageEvent['usage'] }));

    expect(collectedUsage).toEqual([]);
  });

  it('round-trips into recordCollectedUsage as billed subagent transactions', async () => {
    const collectedUsage: UsageMetadata[] = [];
    const sink = createSubagentUsageSink(collectedUsage);

    /** Parent's own call, collected by ModelEndHandler as usual. */
    collectedUsage.push({ input_tokens: 120, output_tokens: 40, model: 'gpt-4' });
    /** Child calls reported through the sink mid-run. */
    sink(makeEvent());
    sink(
      makeEvent({
        usage: { input_tokens: 1100, output_tokens: 300, total_tokens: 1400 },
      }),
    );

    const spendTokens = jest.fn().mockResolvedValue(undefined);
    const spendStructuredTokens = jest.fn().mockResolvedValue(undefined);
    const result = await recordCollectedUsage(
      { spendTokens, spendStructuredTokens },
      {
        user: 'user-123',
        conversationId: 'convo-123',
        model: 'gpt-4',
        collectedUsage,
      },
    );

    /** All three calls billed; child output excluded from reported totals. */
    expect(spendTokens).toHaveBeenCalledTimes(3);
    expect(spendTokens).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ context: 'subagent', model: 'claude-haiku-4-5' }),
      { promptTokens: 900, completionTokens: 700 },
    );
    expect(result).toEqual({ input_tokens: 120, output_tokens: 40 });
  });
});

describe('computeUsageCostUSD', () => {
  /** Stub pricing: base prompt 3 / completion 15, cache write 3.75 / read 0.3;
   *  a premium tier above 200k input prompt tokens (8 / 40). Mirrors the
   *  shape of the real getMultiplier(inputTokenCount) premium switch. */
  const pricing: PricingFns = {
    getMultiplier: ({ tokenType, inputTokenCount }) => {
      const premium = (inputTokenCount ?? 0) > 200000;
      if (tokenType === 'completion') {
        return premium ? 40 : 15;
      }
      return premium ? 8 : 3;
    },
    getCacheMultiplier: ({ cacheType }) => (cacheType === 'write' ? 3.75 : 0.3),
  };

  it('prices a standard call at base rates', () => {
    const cost = computeUsageCostUSD(
      { input_tokens: 1000, output_tokens: 500, model: 'gpt-4', provider: 'openAI' },
      pricing,
    );
    expect(cost).toBeCloseTo((1000 * 3 + 500 * 15) / 1e6);
  });

  it('applies the premium tier when the call exceeds the input threshold', () => {
    /** The exact gap finding A flagged: a long-context call bills premium */
    const cost = computeUsageCostUSD(
      { input_tokens: 300000, output_tokens: 1000, model: 'gpt-5.5', provider: 'openAI' },
      pricing,
    );
    expect(cost).toBeCloseTo((300000 * 8 + 1000 * 40) / 1e6);
  });

  it('prices additive cache tokens (Anthropic) at cache rates', () => {
    const cost = computeUsageCostUSD(
      {
        input_tokens: 1000,
        output_tokens: 500,
        model: 'claude-haiku-4-5',
        provider: 'anthropic',
        input_token_details: { cache_creation: 2000, cache_read: 10000 },
      },
      pricing,
    );
    expect(cost).toBeCloseTo((1000 * 3 + 2000 * 3.75 + 10000 * 0.3 + 500 * 15) / 1e6);
  });
});

describe('aggregateEmittedUsage', () => {
  it('returns null for no emitted events', () => {
    expect(aggregateEmittedUsage([])).toBeNull();
  });

  it('normalizes each call into display units (input excludes cache) and sums cost', () => {
    const events: TTokenUsageEvent[] = [
      {
        input_tokens: 100,
        output_tokens: 20,
        total_tokens: 120,
        model: 'gpt-4o-mini',
        provider: 'openAI',
        cost: 0.001,
      },
      {
        input_tokens: 150,
        output_tokens: 10,
        total_tokens: 160,
        input_token_details: { cache_creation: 30, cache_read: 50 },
        model: 'gpt-4o-mini',
        provider: 'openAI',
        cost: 0.002,
      },
    ];
    /** openAI is cache-subset: input excludes cache (150−30−50=70) */
    expect(aggregateEmittedUsage(events)).toEqual({
      input: 170,
      output: 30,
      cacheWrite: 30,
      cacheRead: 50,
      cost: 0.003,
    });
  });

  it('omits cost when no event carried it (contextCost off)', () => {
    const rollup = aggregateEmittedUsage([
      { input_tokens: 100, output_tokens: 20, total_tokens: 120, provider: 'openAI' },
    ]);
    expect(rollup).toEqual({ input: 100, output: 20, cacheWrite: 0, cacheRead: 0 });
    expect(rollup?.cost).toBeUndefined();
  });

  it('normalizes mixed-provider calls per their own provider before summing', () => {
    /** anthropic is additive (cache separate from input), openAI is subset */
    const rollup = aggregateEmittedUsage([
      {
        input_tokens: 100,
        output_tokens: 20,
        provider: 'anthropic',
        input_token_details: { cache_read: 40 },
        cost: 0.01,
      },
      {
        input_tokens: 90,
        output_tokens: 5,
        usage_type: 'subagent',
        provider: 'openAI',
        input_token_details: { cache_read: 30 },
        cost: 0.02,
      },
    ]);
    /** anthropic input stays 100 (additive); openAI input 90−30=60 → 160 */
    expect(rollup?.input).toBe(160);
    expect(rollup?.output).toBe(25);
    expect(rollup?.cacheRead).toBe(70);
    expect(rollup?.cost).toBeCloseTo(0.03);
  });

  it('uses the magnitude fallback for provider-less cached events (matches live)', () => {
    /** No provider: the client's normalizeUsageUnits uses a magnitude heuristic
     *  (cache ≤ input ⇒ input includes cache), so the rollup must too — billing
     *  splitUsage would treat it as additive and leave input at 1000, diverging
     *  from the live display after reload. */
    const rollup = aggregateEmittedUsage([
      { input_tokens: 1000, output_tokens: 100, input_token_details: { cache_read: 400 } },
    ]);
    expect(rollup).toEqual({ input: 600, output: 100, cacheWrite: 0, cacheRead: 400 });
  });
});

describe('buildPersistedContextUsage', () => {
  const baseSnapshot: TContextUsageEvent = {
    runId: 'run-1',
    breakdown: {
      maxContextTokens: 8000,
      instructionTokens: 100,
      systemMessageTokens: 80,
      dynamicInstructionTokens: 20,
      toolSchemaTokens: 30,
      summaryTokens: 0,
      toolCount: 2,
      messageCount: 3,
      messageTokens: 500,
      availableForMessages: 7000,
      toolTokenCounts: { add: 15, noop: 0 },
    },
    contextBudget: 7800,
  };

  it('trims zero-valued per-tool counts', () => {
    const result = buildPersistedContextUsage(baseSnapshot);
    expect(result.breakdown.toolTokenCounts).toEqual({ add: 15 });
    expect(result.contextBudget).toBe(7800);
  });

  it('drops the tool counts object entirely when all are zero', () => {
    const result = buildPersistedContextUsage({
      ...baseSnapshot,
      breakdown: { ...baseSnapshot.breakdown, toolTokenCounts: { add: 0 } },
    });
    expect(result.breakdown.toolTokenCounts).toBeUndefined();
  });

  it('passes through a snapshot without tool counts', () => {
    const { toolTokenCounts: _omit, ...breakdown } = baseSnapshot.breakdown;
    const result = buildPersistedContextUsage({ ...baseSnapshot, breakdown });
    expect(result.breakdown.toolTokenCounts).toBeUndefined();
    expect(result.breakdown.messageTokens).toBe(500);
  });

  it('records the final primary call output as completedOutputTokens', () => {
    /** The latest snapshot precedes the final call, so its post-snapshot delta
     *  is that call's output — not the full multi-call response tokenCount. */
    const events: TTokenUsageEvent[] = [
      { input_tokens: 100, output_tokens: 40, total_tokens: 140, provider: 'openAI' },
      { input_tokens: 200, output_tokens: 25, total_tokens: 225, provider: 'openAI' },
      {
        input_tokens: 50,
        output_tokens: 12,
        usage_type: 'subagent',
        provider: 'openAI',
      },
    ];
    const result = buildPersistedContextUsage(baseSnapshot, events);
    /** Last PRIMARY call's completion (25), skipping the trailing subagent event */
    expect(result.completedOutputTokens).toBe(25);
  });

  it('omits completedOutputTokens when there are no primary calls', () => {
    expect(buildPersistedContextUsage(baseSnapshot, []).completedOutputTokens).toBeUndefined();
  });
});
