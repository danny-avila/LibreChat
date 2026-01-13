/**
 * Tests for AgentClient.recordCollectedUsage
 *
 * This is a critical function that handles token spending for agent LLM calls.
 * It must correctly handle:
 * - Sequential execution (single agent with tool calls)
 * - Parallel execution (multiple agents with independent inputs)
 * - Cache token handling (OpenAI and Anthropic formats)
 */

const { EModelEndpoint } = require('librechat-data-provider');

// Mock dependencies before requiring the module
const mockSpendTokens = jest.fn().mockResolvedValue();
const mockSpendStructuredTokens = jest.fn().mockResolvedValue();

jest.mock('~/models/spendTokens', () => ({
  spendTokens: (...args) => mockSpendTokens(...args),
  spendStructuredTokens: (...args) => mockSpendStructuredTokens(...args),
}));

jest.mock('~/config', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
  getMCPManager: jest.fn(() => ({
    formatInstructionsForContext: jest.fn(),
  })),
}));

jest.mock('@librechat/agents', () => ({
  ...jest.requireActual('@librechat/agents'),
  createMetadataAggregator: () => ({
    handleLLMEnd: jest.fn(),
    collected: [],
  }),
}));

const AgentClient = require('./client');

describe('AgentClient - recordCollectedUsage', () => {
  let client;
  let mockAgent;
  let mockOptions;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAgent = {
      id: 'agent-123',
      endpoint: EModelEndpoint.openAI,
      provider: EModelEndpoint.openAI,
      model_parameters: {
        model: 'gpt-4',
      },
    };

    mockOptions = {
      req: {
        user: { id: 'user-123' },
        body: { model: 'gpt-4', endpoint: EModelEndpoint.openAI },
      },
      res: {},
      agent: mockAgent,
      endpointTokenConfig: {},
    };

    client = new AgentClient(mockOptions);
    client.conversationId = 'convo-123';
    client.user = 'user-123';
  });

  describe('basic functionality', () => {
    it('should return early if collectedUsage is empty', async () => {
      await client.recordCollectedUsage({
        collectedUsage: [],
        balance: { enabled: true },
        transactions: { enabled: true },
      });

      expect(mockSpendTokens).not.toHaveBeenCalled();
      expect(mockSpendStructuredTokens).not.toHaveBeenCalled();
      expect(client.usage).toBeUndefined();
    });

    it('should return early if collectedUsage is null', async () => {
      await client.recordCollectedUsage({
        collectedUsage: null,
        balance: { enabled: true },
        transactions: { enabled: true },
      });

      expect(mockSpendTokens).not.toHaveBeenCalled();
      expect(client.usage).toBeUndefined();
    });

    it('should handle single usage entry correctly', async () => {
      const collectedUsage = [{ input_tokens: 100, output_tokens: 50, model: 'gpt-4' }];

      await client.recordCollectedUsage({
        collectedUsage,
        balance: { enabled: true },
        transactions: { enabled: true },
      });

      expect(mockSpendTokens).toHaveBeenCalledTimes(1);
      expect(mockSpendTokens).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'convo-123',
          user: 'user-123',
          model: 'gpt-4',
        }),
        { promptTokens: 100, completionTokens: 50 },
      );
      expect(client.usage.input_tokens).toBe(100);
      expect(client.usage.output_tokens).toBe(50);
    });

    it('should skip null entries in collectedUsage', async () => {
      const collectedUsage = [
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4' },
        null,
        { input_tokens: 200, output_tokens: 60, model: 'gpt-4' },
      ];

      await client.recordCollectedUsage({
        collectedUsage,
        balance: { enabled: true },
        transactions: { enabled: true },
      });

      expect(mockSpendTokens).toHaveBeenCalledTimes(2);
    });
  });

  describe('sequential execution (single agent with tool calls)', () => {
    it('should calculate tokens correctly for sequential tool calls', async () => {
      // Sequential flow: output of call N becomes part of input for call N+1
      // Call 1: input=100, output=50
      // Call 2: input=150 (100+50), output=30
      // Call 3: input=180 (150+30), output=20
      const collectedUsage = [
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4' },
        { input_tokens: 150, output_tokens: 30, model: 'gpt-4' },
        { input_tokens: 180, output_tokens: 20, model: 'gpt-4' },
      ];

      await client.recordCollectedUsage({
        collectedUsage,
        balance: { enabled: true },
        transactions: { enabled: true },
      });

      expect(mockSpendTokens).toHaveBeenCalledTimes(3);
      // Total output should be sum of all output_tokens: 50 + 30 + 20 = 100
      expect(client.usage.output_tokens).toBe(100);
      expect(client.usage.input_tokens).toBe(100); // First entry's input
    });
  });

  describe('parallel execution (multiple agents)', () => {
    it('should handle parallel agents with independent input tokens', async () => {
      // Parallel agents have INDEPENDENT input tokens (not cumulative)
      // Agent A: input=100, output=50
      // Agent B: input=80, output=40 (different context, not 100+50)
      const collectedUsage = [
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4' },
        { input_tokens: 80, output_tokens: 40, model: 'gpt-4' },
      ];

      await client.recordCollectedUsage({
        collectedUsage,
        balance: { enabled: true },
        transactions: { enabled: true },
      });

      expect(mockSpendTokens).toHaveBeenCalledTimes(2);
      // Expected total output: 50 + 40 = 90
      // output_tokens must be positive and should reflect total output
      expect(client.usage.output_tokens).toBeGreaterThan(0);
    });

    it('should NOT produce negative output_tokens for parallel execution', async () => {
      // Critical bug scenario: parallel agents where second agent has LOWER input tokens
      const collectedUsage = [
        { input_tokens: 200, output_tokens: 100, model: 'gpt-4' },
        { input_tokens: 50, output_tokens: 30, model: 'gpt-4' },
      ];

      await client.recordCollectedUsage({
        collectedUsage,
        balance: { enabled: true },
        transactions: { enabled: true },
      });

      // output_tokens MUST be positive for proper token tracking
      expect(client.usage.output_tokens).toBeGreaterThan(0);
      // Correct value should be 100 + 30 = 130
    });

    it('should calculate correct total output for parallel agents', async () => {
      // Three parallel agents with independent contexts
      const collectedUsage = [
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4' },
        { input_tokens: 120, output_tokens: 60, model: 'gpt-4-turbo' },
        { input_tokens: 80, output_tokens: 40, model: 'claude-3' },
      ];

      await client.recordCollectedUsage({
        collectedUsage,
        balance: { enabled: true },
        transactions: { enabled: true },
      });

      expect(mockSpendTokens).toHaveBeenCalledTimes(3);
      // Total output should be 50 + 60 + 40 = 150
      expect(client.usage.output_tokens).toBe(150);
    });

    it('should handle worst-case parallel scenario without negative tokens', async () => {
      // Extreme case: first agent has very high input, subsequent have low
      const collectedUsage = [
        { input_tokens: 1000, output_tokens: 500, model: 'gpt-4' },
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4' },
        { input_tokens: 50, output_tokens: 25, model: 'gpt-4' },
      ];

      await client.recordCollectedUsage({
        collectedUsage,
        balance: { enabled: true },
        transactions: { enabled: true },
      });

      // Must be positive, should be 500 + 50 + 25 = 575
      expect(client.usage.output_tokens).toBeGreaterThan(0);
      expect(client.usage.output_tokens).toBe(575);
    });
  });

  describe('real-world scenarios', () => {
    it('should correctly sum output tokens for sequential tool calls with growing context', async () => {
      // Real production data: Claude Opus with multiple tool calls
      // Context grows as tool results are added, but output_tokens should only count model generations
      const collectedUsage = [
        {
          input_tokens: 31596,
          output_tokens: 151,
          total_tokens: 31747,
          input_token_details: { cache_read: 0, cache_creation: 0 },
          model: 'claude-opus-4-5-20251101',
        },
        {
          input_tokens: 35368,
          output_tokens: 150,
          total_tokens: 35518,
          input_token_details: { cache_read: 0, cache_creation: 0 },
          model: 'claude-opus-4-5-20251101',
        },
        {
          input_tokens: 58362,
          output_tokens: 295,
          total_tokens: 58657,
          input_token_details: { cache_read: 0, cache_creation: 0 },
          model: 'claude-opus-4-5-20251101',
        },
        {
          input_tokens: 112604,
          output_tokens: 193,
          total_tokens: 112797,
          input_token_details: { cache_read: 0, cache_creation: 0 },
          model: 'claude-opus-4-5-20251101',
        },
        {
          input_tokens: 257440,
          output_tokens: 2217,
          total_tokens: 259657,
          input_token_details: { cache_read: 0, cache_creation: 0 },
          model: 'claude-opus-4-5-20251101',
        },
      ];

      await client.recordCollectedUsage({
        collectedUsage,
        balance: { enabled: true },
        transactions: { enabled: true },
      });

      // input_tokens should be first entry's input (initial context)
      expect(client.usage.input_tokens).toBe(31596);

      // output_tokens should be sum of all model outputs: 151 + 150 + 295 + 193 + 2217 = 3006
      // NOT the inflated value from incremental calculation (338,559)
      expect(client.usage.output_tokens).toBe(3006);

      // Verify spendTokens was called for each entry with correct values
      expect(mockSpendTokens).toHaveBeenCalledTimes(5);
      expect(mockSpendTokens).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ model: 'claude-opus-4-5-20251101' }),
        { promptTokens: 31596, completionTokens: 151 },
      );
      expect(mockSpendTokens).toHaveBeenNthCalledWith(
        5,
        expect.objectContaining({ model: 'claude-opus-4-5-20251101' }),
        { promptTokens: 257440, completionTokens: 2217 },
      );
    });

    it('should handle single followup message correctly', async () => {
      // Real production data: followup to the above conversation
      const collectedUsage = [
        {
          input_tokens: 263406,
          output_tokens: 257,
          total_tokens: 263663,
          input_token_details: { cache_read: 0, cache_creation: 0 },
          model: 'claude-opus-4-5-20251101',
        },
      ];

      await client.recordCollectedUsage({
        collectedUsage,
        balance: { enabled: true },
        transactions: { enabled: true },
      });

      expect(client.usage.input_tokens).toBe(263406);
      expect(client.usage.output_tokens).toBe(257);

      expect(mockSpendTokens).toHaveBeenCalledTimes(1);
      expect(mockSpendTokens).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-opus-4-5-20251101' }),
        { promptTokens: 263406, completionTokens: 257 },
      );
    });

    it('should ensure output_tokens > 0 check passes for BaseClient.sendMessage', async () => {
      // This verifies the fix for the duplicate token spending bug
      // BaseClient.sendMessage checks: if (usage != null && Number(usage[this.outputTokensKey]) > 0)
      const collectedUsage = [
        {
          input_tokens: 31596,
          output_tokens: 151,
          model: 'claude-opus-4-5-20251101',
        },
        {
          input_tokens: 35368,
          output_tokens: 150,
          model: 'claude-opus-4-5-20251101',
        },
      ];

      await client.recordCollectedUsage({
        collectedUsage,
        balance: { enabled: true },
        transactions: { enabled: true },
      });

      const usage = client.getStreamUsage();

      // The check that was failing before the fix
      expect(usage).not.toBeNull();
      expect(Number(usage.output_tokens)).toBeGreaterThan(0);

      // Verify correct value
      expect(usage.output_tokens).toBe(301); // 151 + 150
    });

    it('should correctly handle cache tokens with multiple tool calls', async () => {
      // Real production data: Claude Opus with cache tokens (prompt caching)
      // First entry has cache_creation, subsequent entries have cache_read
      const collectedUsage = [
        {
          input_tokens: 788,
          output_tokens: 163,
          total_tokens: 951,
          input_token_details: { cache_read: 0, cache_creation: 30808 },
          model: 'claude-opus-4-5-20251101',
        },
        {
          input_tokens: 3802,
          output_tokens: 149,
          total_tokens: 3951,
          input_token_details: { cache_read: 30808, cache_creation: 768 },
          model: 'claude-opus-4-5-20251101',
        },
        {
          input_tokens: 26808,
          output_tokens: 225,
          total_tokens: 27033,
          input_token_details: { cache_read: 31576, cache_creation: 0 },
          model: 'claude-opus-4-5-20251101',
        },
        {
          input_tokens: 80912,
          output_tokens: 204,
          total_tokens: 81116,
          input_token_details: { cache_read: 31576, cache_creation: 0 },
          model: 'claude-opus-4-5-20251101',
        },
        {
          input_tokens: 136454,
          output_tokens: 206,
          total_tokens: 136660,
          input_token_details: { cache_read: 31576, cache_creation: 0 },
          model: 'claude-opus-4-5-20251101',
        },
        {
          input_tokens: 146316,
          output_tokens: 224,
          total_tokens: 146540,
          input_token_details: { cache_read: 31576, cache_creation: 0 },
          model: 'claude-opus-4-5-20251101',
        },
        {
          input_tokens: 150402,
          output_tokens: 1248,
          total_tokens: 151650,
          input_token_details: { cache_read: 31576, cache_creation: 0 },
          model: 'claude-opus-4-5-20251101',
        },
        {
          input_tokens: 156268,
          output_tokens: 139,
          total_tokens: 156407,
          input_token_details: { cache_read: 31576, cache_creation: 0 },
          model: 'claude-opus-4-5-20251101',
        },
        {
          input_tokens: 167126,
          output_tokens: 2961,
          total_tokens: 170087,
          input_token_details: { cache_read: 31576, cache_creation: 0 },
          model: 'claude-opus-4-5-20251101',
        },
      ];

      await client.recordCollectedUsage({
        collectedUsage,
        balance: { enabled: true },
        transactions: { enabled: true },
      });

      // input_tokens = first entry's input + cache_creation + cache_read
      // = 788 + 30808 + 0 = 31596
      expect(client.usage.input_tokens).toBe(31596);

      // output_tokens = sum of all output_tokens
      // = 163 + 149 + 225 + 204 + 206 + 224 + 1248 + 139 + 2961 = 5519
      expect(client.usage.output_tokens).toBe(5519);

      // First 2 entries have cache tokens, should use spendStructuredTokens
      // Remaining 7 entries have cache_read but no cache_creation, still structured
      expect(mockSpendStructuredTokens).toHaveBeenCalledTimes(9);
      expect(mockSpendTokens).toHaveBeenCalledTimes(0);

      // Verify first entry uses structured tokens with cache_creation
      expect(mockSpendStructuredTokens).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ model: 'claude-opus-4-5-20251101' }),
        {
          promptTokens: { input: 788, write: 30808, read: 0 },
          completionTokens: 163,
        },
      );

      // Verify second entry uses structured tokens with both cache_creation and cache_read
      expect(mockSpendStructuredTokens).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ model: 'claude-opus-4-5-20251101' }),
        {
          promptTokens: { input: 3802, write: 768, read: 30808 },
          completionTokens: 149,
        },
      );
    });
  });

  describe('cache token handling', () => {
    it('should handle OpenAI format cache tokens (input_token_details)', async () => {
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

      await client.recordCollectedUsage({
        collectedUsage,
        balance: { enabled: true },
        transactions: { enabled: true },
      });

      expect(mockSpendStructuredTokens).toHaveBeenCalledTimes(1);
      expect(mockSpendStructuredTokens).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-4' }),
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

    it('should handle Anthropic format cache tokens (cache_*_input_tokens)', async () => {
      const collectedUsage = [
        {
          input_tokens: 100,
          output_tokens: 50,
          model: 'claude-3',
          cache_creation_input_tokens: 25,
          cache_read_input_tokens: 15,
        },
      ];

      await client.recordCollectedUsage({
        collectedUsage,
        balance: { enabled: true },
        transactions: { enabled: true },
      });

      expect(mockSpendStructuredTokens).toHaveBeenCalledTimes(1);
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

    it('should use spendTokens for entries without cache tokens', async () => {
      const collectedUsage = [{ input_tokens: 100, output_tokens: 50, model: 'gpt-4' }];

      await client.recordCollectedUsage({
        collectedUsage,
        balance: { enabled: true },
        transactions: { enabled: true },
      });

      expect(mockSpendTokens).toHaveBeenCalledTimes(1);
      expect(mockSpendStructuredTokens).not.toHaveBeenCalled();
    });

    it('should handle mixed cache and non-cache entries', async () => {
      const collectedUsage = [
        { input_tokens: 100, output_tokens: 50, model: 'gpt-4' },
        {
          input_tokens: 150,
          output_tokens: 30,
          model: 'gpt-4',
          input_token_details: { cache_creation: 10, cache_read: 5 },
        },
        { input_tokens: 200, output_tokens: 20, model: 'gpt-4' },
      ];

      await client.recordCollectedUsage({
        collectedUsage,
        balance: { enabled: true },
        transactions: { enabled: true },
      });

      expect(mockSpendTokens).toHaveBeenCalledTimes(2);
      expect(mockSpendStructuredTokens).toHaveBeenCalledTimes(1);
    });

    it('should include cache tokens in total input calculation', async () => {
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

      await client.recordCollectedUsage({
        collectedUsage,
        balance: { enabled: true },
        transactions: { enabled: true },
      });

      // Total input should include cache tokens: 100 + 20 + 10 = 130
      expect(client.usage.input_tokens).toBe(130);
    });
  });

  describe('model fallback', () => {
    it('should use usage.model when available', async () => {
      const collectedUsage = [{ input_tokens: 100, output_tokens: 50, model: 'gpt-4-turbo' }];

      await client.recordCollectedUsage({
        model: 'fallback-model',
        collectedUsage,
        balance: { enabled: true },
        transactions: { enabled: true },
      });

      expect(mockSpendTokens).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-4-turbo' }),
        expect.any(Object),
      );
    });

    it('should fallback to param model when usage.model is missing', async () => {
      const collectedUsage = [{ input_tokens: 100, output_tokens: 50 }];

      await client.recordCollectedUsage({
        model: 'param-model',
        collectedUsage,
        balance: { enabled: true },
        transactions: { enabled: true },
      });

      expect(mockSpendTokens).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'param-model' }),
        expect.any(Object),
      );
    });

    it('should fallback to client.model when param model is missing', async () => {
      client.model = 'client-model';
      const collectedUsage = [{ input_tokens: 100, output_tokens: 50 }];

      await client.recordCollectedUsage({
        collectedUsage,
        balance: { enabled: true },
        transactions: { enabled: true },
      });

      expect(mockSpendTokens).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'client-model' }),
        expect.any(Object),
      );
    });

    it('should fallback to agent model_parameters.model as last resort', async () => {
      const collectedUsage = [{ input_tokens: 100, output_tokens: 50 }];

      await client.recordCollectedUsage({
        collectedUsage,
        balance: { enabled: true },
        transactions: { enabled: true },
      });

      expect(mockSpendTokens).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-4' }),
        expect.any(Object),
      );
    });
  });

  describe('getStreamUsage integration', () => {
    it('should return the usage object set by recordCollectedUsage', async () => {
      const collectedUsage = [{ input_tokens: 100, output_tokens: 50, model: 'gpt-4' }];

      await client.recordCollectedUsage({
        collectedUsage,
        balance: { enabled: true },
        transactions: { enabled: true },
      });

      const usage = client.getStreamUsage();
      expect(usage).toEqual({
        input_tokens: 100,
        output_tokens: 50,
      });
    });

    it('should return undefined before recordCollectedUsage is called', () => {
      const usage = client.getStreamUsage();
      expect(usage).toBeUndefined();
    });

    it('should have output_tokens > 0 for BaseClient.sendMessage check', async () => {
      // This test verifies the usage will pass the check in BaseClient.sendMessage:
      // if (usage != null && Number(usage[this.outputTokensKey]) > 0)
      const collectedUsage = [
        { input_tokens: 200, output_tokens: 100, model: 'gpt-4' },
        { input_tokens: 50, output_tokens: 30, model: 'gpt-4' },
      ];

      await client.recordCollectedUsage({
        collectedUsage,
        balance: { enabled: true },
        transactions: { enabled: true },
      });

      const usage = client.getStreamUsage();
      expect(usage).not.toBeNull();
      expect(Number(usage.output_tokens)).toBeGreaterThan(0);
    });
  });
});
