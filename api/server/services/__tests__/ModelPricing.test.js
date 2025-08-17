const {
  getModelPricing,
  calculateTokenCost,
  getSupportedModels,
  getModelProvider,
} = require('../ModelPricing');

describe('ModelPricing Service', () => {
  describe('getModelPricing', () => {
    it('should return pricing for known models', () => {
      const pricing = getModelPricing('gpt-4o');
      expect(pricing).toBeDefined();
      expect(pricing.prompt).toBe(5.0);
      expect(pricing.completion).toBe(15.0);
    });

    it('should return null for unknown models', () => {
      const pricing = getModelPricing('unknown-model');
      expect(pricing).toBeNull();
    });

    it('should return historical pricing for older dates', () => {
      const oldDate = new Date('2023-11-10');
      const pricing = getModelPricing('gpt-3.5-turbo', oldDate);
      expect(pricing).toBeDefined();
      expect(pricing.prompt).toBe(1.0); // Historical price
      expect(pricing.completion).toBe(2.0);
    });

    it('should return current pricing for recent dates', () => {
      const recentDate = new Date('2024-06-01');
      const pricing = getModelPricing('gpt-3.5-turbo', recentDate);
      expect(pricing).toBeDefined();
      expect(pricing.prompt).toBe(0.5); // Current price
      expect(pricing.completion).toBe(1.5);
    });

    it('should handle Claude models with cache pricing', () => {
      const pricing = getModelPricing('claude-3-5-sonnet');
      expect(pricing).toBeDefined();
      expect(pricing.cacheWrite).toBe(3.75);
      expect(pricing.cacheRead).toBe(0.3);
    });

    it('should handle o1 models with reasoning pricing', () => {
      const pricing = getModelPricing('o1');
      expect(pricing).toBeDefined();
      expect(pricing.reasoning).toBe(15.0);
    });

    it('should handle all newly added models', () => {
      const newModels = [
        'gpt-4-0314',
        'gpt-4-32k-0314',
        'gpt-3.5-turbo-0613',
        'gpt-3.5-turbo-16k-0613',
        'o1-preview-2024-09-12',
        'o1-mini-2024-09-12',
        'o3-mini',
        'gpt-4o-mini-2024-07-18',
        'gpt-4-turbo-2024-04-09',
        'gpt-4-0125',
        'gpt-4-1106',
        'claude-3-5-haiku-20241022',
        'claude-3-5-sonnet-latest',
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307',
        'claude-1.2',
        'claude-1',
        'claude-1-100k',
        'claude-instant-1-100k',
        'anthropic.claude-v2',
        'anthropic.claude-v2:1',
        'anthropic.claude-instant-v1',
        'gemini-pro',
        'gemini-pro-vision',
        'mistral.mistral-small-2402-v1:0',
      ];

      newModels.forEach((model) => {
        const pricing = getModelPricing(model);
        expect(pricing).toBeDefined();
        expect(pricing.prompt).toBeGreaterThan(0);
        expect(pricing.completion).toBeGreaterThan(0);
      });
    });
  });

  describe('calculateTokenCost', () => {
    it('should calculate basic prompt and completion costs', () => {
      const usage = {
        promptTokens: 1000,
        completionTokens: 500,
      };
      const cost = calculateTokenCost('gpt-4o', usage);

      expect(cost.prompt).toBeCloseTo(0.005); // 1000/1M * 5.0
      expect(cost.completion).toBeCloseTo(0.0075); // 500/1M * 15.0
      expect(cost.total).toBeCloseTo(0.0125);
    });

    it('should handle zero token counts', () => {
      const usage = {
        promptTokens: 0,
        completionTokens: 0,
      };
      const cost = calculateTokenCost('gpt-4', usage);

      expect(cost.prompt).toBe(0);
      expect(cost.completion).toBe(0);
      expect(cost.total).toBe(0);
    });

    it('should handle large token counts', () => {
      const usage = {
        promptTokens: 100000,
        completionTokens: 50000,
      };
      const cost = calculateTokenCost('gpt-4', usage);

      expect(cost.prompt).toBeCloseTo(3.0); // 100k/1M * 30.0
      expect(cost.completion).toBeCloseTo(3.0); // 50k/1M * 60.0
      expect(cost.total).toBeCloseTo(6.0);
    });

    it('should calculate cache token costs for Claude models', () => {
      const usage = {
        promptTokens: 1000,
        completionTokens: 500,
        cacheWriteTokens: 2000,
        cacheReadTokens: 3000,
      };
      const cost = calculateTokenCost('claude-3-5-sonnet', usage);

      expect(cost.prompt).toBeCloseTo(0.003); // 1000/1M * 3.0
      expect(cost.completion).toBeCloseTo(0.0075); // 500/1M * 15.0
      expect(cost.cacheWrite).toBeCloseTo(0.0075); // 2000/1M * 3.75
      expect(cost.cacheRead).toBeCloseTo(0.0009); // 3000/1M * 0.3
      expect(cost.total).toBeCloseTo(0.0189);
    });

    it('should calculate reasoning token costs for o1 models', () => {
      const usage = {
        promptTokens: 1000,
        completionTokens: 500,
        reasoningTokens: 2000,
      };
      const cost = calculateTokenCost('o1', usage);

      expect(cost.prompt).toBeCloseTo(0.015); // 1000/1M * 15.0
      expect(cost.completion).toBeCloseTo(0.03); // 500/1M * 60.0
      expect(cost.reasoning).toBeCloseTo(0.03); // 2000/1M * 15.0
      expect(cost.total).toBeCloseTo(0.075);
    });

    it('should handle invalid model gracefully', () => {
      const usage = {
        promptTokens: 1000,
        completionTokens: 500,
      };
      const cost = calculateTokenCost('invalid-model', usage);

      expect(cost.total).toBe(0);
      expect(cost.error).toBe('No pricing data available');
    });

    it('should handle invalid usage object', () => {
      const cost = calculateTokenCost('gpt-4', null);

      expect(cost.total).toBe(0);
      expect(cost.error).toBe('Invalid usage object');
    });

    it('should handle missing model parameter', () => {
      const usage = {
        promptTokens: 1000,
        completionTokens: 500,
      };
      const cost = calculateTokenCost(null, usage);

      expect(cost.total).toBe(0);
      expect(cost.error).toBe('Invalid model specified');
    });

    it('should use historical pricing for past dates', () => {
      const usage = {
        promptTokens: 1000,
        completionTokens: 500,
      };
      const oldDate = new Date('2023-11-10');
      const cost = calculateTokenCost('gpt-3.5-turbo', usage, oldDate);

      expect(cost.prompt).toBeCloseTo(0.001); // 1000/1M * 1.0 (historical)
      expect(cost.completion).toBeCloseTo(0.001); // 500/1M * 2.0 (historical)
      expect(cost.total).toBeCloseTo(0.002);
    });
  });

  describe('getSupportedModels', () => {
    it('should return array of supported model names', () => {
      const models = getSupportedModels();

      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(80); // We have 100+ models now
      expect(models).toContain('gpt-4');
      expect(models).toContain('claude-3-opus');
      expect(models).toContain('gemini-1.5-pro');
    });

    it('should include all newly added models', () => {
      const models = getSupportedModels();

      expect(models).toContain('gpt-4-0314');
      expect(models).toContain('o3-mini');
      expect(models).toContain('claude-1-100k');
      expect(models).toContain('gemini-pro');
      expect(models).toContain('anthropic.claude-v2');
    });
  });

  describe('getModelProvider', () => {
    it('should identify OpenAI models', () => {
      expect(getModelProvider('gpt-4')).toBe('OpenAI');
      expect(getModelProvider('gpt-3.5-turbo')).toBe('OpenAI');
      expect(getModelProvider('o1-preview')).toBe('OpenAI');
      expect(getModelProvider('chatgpt-4o-latest')).toBe('OpenAI');
    });

    it('should identify Anthropic models', () => {
      expect(getModelProvider('claude-3-opus')).toBe('Anthropic');
      expect(getModelProvider('claude-2.1')).toBe('Anthropic');
      expect(getModelProvider('anthropic.claude-v2')).toBe('Anthropic');
    });

    it('should identify Google models', () => {
      expect(getModelProvider('gemini-1.5-pro')).toBe('Google');
      expect(getModelProvider('gemini-pro')).toBe('Google');
    });

    it('should identify Mistral models', () => {
      expect(getModelProvider('mistral.mistral-7b-instruct-v0:2')).toBe('Mistral');
    });

    it('should identify Cohere models', () => {
      expect(getModelProvider('cohere.command-r-v1:0')).toBe('Cohere');
    });

    it('should identify Meta models', () => {
      expect(getModelProvider('meta.llama3-70b-instruct-v1:0')).toBe('Meta');
    });

    it('should identify Amazon models', () => {
      expect(getModelProvider('amazon.titan-text-express-v1')).toBe('Amazon');
    });

    it('should identify xAI models', () => {
      expect(getModelProvider('grok-2')).toBe('xAI');
    });

    it('should identify DeepSeek models', () => {
      expect(getModelProvider('deepseek-chat')).toBe('DeepSeek');
    });

    it('should return Unknown for unrecognized models', () => {
      expect(getModelProvider('unknown-model')).toBe('Unknown');
    });
  });

  describe('Edge Cases', () => {
    it('should handle extremely small token costs', () => {
      const usage = {
        promptTokens: 1,
        completionTokens: 1,
      };
      const cost = calculateTokenCost('gpt-4o-mini', usage);

      expect(cost.prompt).toBeCloseTo(0.00000015);
      expect(cost.completion).toBeCloseTo(0.0000006);
      expect(cost.total).toBeCloseTo(0.00000075);
    });

    it('should handle models with zero-cost experimental pricing', () => {
      const usage = {
        promptTokens: 10000,
        completionTokens: 5000,
      };
      const cost = calculateTokenCost('gemini-2.0-flash-exp', usage);

      expect(cost.prompt).toBe(0);
      expect(cost.completion).toBe(0);
      expect(cost.total).toBe(0);
    });

    it('should handle mixed token types in single request', () => {
      const usage = {
        promptTokens: 1000,
        completionTokens: 500,
        cacheWriteTokens: 200,
        cacheReadTokens: 300,
        reasoningTokens: 0, // Not all models have reasoning
      };
      const cost = calculateTokenCost('claude-3-5-sonnet', usage);

      expect(cost.prompt).toBeCloseTo(0.003);
      expect(cost.completion).toBeCloseTo(0.0075);
      expect(cost.cacheWrite).toBeCloseTo(0.00075);
      expect(cost.cacheRead).toBeCloseTo(0.00009);
      expect(cost.reasoning).toBe(0);
    });

    it('should handle date boundaries correctly', () => {
      // Test exact date match
      const exactDate = new Date('2024-01-25');
      const pricing = getModelPricing('gpt-3.5-turbo', exactDate);
      expect(pricing.prompt).toBe(0.5);

      // Test one day before change
      const dayBefore = new Date('2024-01-24');
      const pricingBefore = getModelPricing('gpt-3.5-turbo', dayBefore);
      expect(pricingBefore.prompt).toBe(1.0);

      // Test one day after change
      const dayAfter = new Date('2024-01-26');
      const pricingAfter = getModelPricing('gpt-3.5-turbo', dayAfter);
      expect(pricingAfter.prompt).toBe(0.5);
    });
  });
});
