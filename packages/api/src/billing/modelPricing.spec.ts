import { logger } from '@librechat/data-schemas';
import { MODEL_PRICING, estimateCost } from './modelPricing';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

describe('MODEL_PRICING', () => {
  it('has entries for all graupel.yaml models', () => {
    const required = [
      'gpt-5',
      'gpt-5-mini',
      'claude-opus-4-7',
      'claude-haiku-4-5',
      'gemini-2.5-flash',
      'grok-4',
      'grok-3-mini',
      'deepseek-chat',
      'deepseek-reasoner',
    ];
    for (const id of required) {
      expect(MODEL_PRICING[id]).toBeDefined();
    }
  });
});

describe('estimateCost', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns correct cents for a known model (gpt-5)', () => {
    // prompt_per_1k=0.5, completion_per_1k=1.5
    // 2000 prompt → 2*0.5=1.0; 1000 completion → 1*1.5=1.5 → total=2.5 → round=3
    const result = estimateCost('gpt-5', { promptTokens: 2000, completionTokens: 1000 });
    expect(result).toBe(3);
  });

  it('returns correct cents for claude-opus-4-7', () => {
    // prompt_per_1k=1.5, completion_per_1k=7.5
    // 1000 prompt → 1.5; 1000 completion → 7.5 → total=9.0 → round=9
    const result = estimateCost('claude-opus-4-7', { promptTokens: 1000, completionTokens: 1000 });
    expect(result).toBe(9);
  });

  it('returns 0 and calls logger.warn for unknown model', () => {
    const result = estimateCost('no-such-model-xyz', { promptTokens: 500, completionTokens: 500 });
    expect(result).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith(
      '[modelPricing] no pricing for model',
      'no-such-model-xyz',
    );
  });

  it('returns 0 for zero tokens without warning', () => {
    const result = estimateCost('gpt-5', { promptTokens: 0, completionTokens: 0 });
    expect(result).toBe(0);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('rounds fractional cents', () => {
    // gpt-5-mini: prompt_per_1k=0.02, completion_per_1k=0.08
    // 100 prompt → 0.002; 100 completion → 0.008 → total=0.01 → round=0
    const result = estimateCost('gpt-5-mini', { promptTokens: 100, completionTokens: 100 });
    expect(result).toBe(0);

    // 10000 prompt → 0.2; 10000 completion → 0.8 → total=1.0 → round=1
    const result2 = estimateCost('gpt-5-mini', { promptTokens: 10000, completionTokens: 10000 });
    expect(result2).toBe(1);
  });
});
