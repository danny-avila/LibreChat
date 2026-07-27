import { EModelEndpoint } from 'librechat-data-provider';
import type { EndpointTokenConfig } from '~/types';
import { getModelMaxTokens, getModelMaxOutputTokens, processLiteLLMModelData } from './tokens';

describe('getModelMaxTokens partial-override fallback', () => {
  const partialOverride: EndpointTokenConfig = {
    'custom-model': { prompt: 1, completion: 2, context: 32000, output: 4096 },
  };

  it('uses the override for a listed model', () => {
    expect(getModelMaxTokens('custom-model', EModelEndpoint.openAI, partialOverride)).toBe(32000);
  });

  it('falls back to the built-in map for a model absent from a partial override', () => {
    const fallback = getModelMaxTokens('gpt-4o', EModelEndpoint.openAI, partialOverride);
    const builtin = getModelMaxTokens('gpt-4o', EModelEndpoint.openAI);
    expect(fallback).toBe(builtin);
    expect(fallback).toBeGreaterThan(100000);
  });
});

describe('getModelMaxOutputTokens partial-override fallback', () => {
  const partialOverride: EndpointTokenConfig = {
    'custom-model': { prompt: 1, completion: 2, context: 32000, output: 4096 },
  };

  it('falls back to the built-in map for a model absent from a partial override', () => {
    const fallback = getModelMaxOutputTokens('gpt-4o', EModelEndpoint.openAI, partialOverride);
    const builtin = getModelMaxOutputTokens('gpt-4o', EModelEndpoint.openAI);
    expect(fallback).toBe(builtin);
    expect(fallback).toBeGreaterThan(0);
  });
});

describe('processLiteLLMModelData', () => {
  it('converts per-token USD costs to the internal per-1M-token convention, including cache rates', () => {
    const config = processLiteLLMModelData({
      data: [
        {
          model_name: 'gpt-4o-mini',
          model_info: {
            input_cost_per_token: 0.00000015,
            output_cost_per_token: 0.0000006,
            cache_read_input_token_cost: 0.000000075,
            cache_creation_input_token_cost: 0.0000001875,
            max_input_tokens: 128000,
          },
        },
      ],
    });

    expect(config['gpt-4o-mini']).toEqual({
      prompt: 0.15,
      completion: 0.6,
      context: 128000,
      read: 0.075,
      write: 0.1875,
    });
  });

  it('omits cache rates when the proxy does not report them', () => {
    const config = processLiteLLMModelData({
      data: [
        {
          model_name: 'plain-model',
          model_info: {
            input_cost_per_token: 0.000001,
            output_cost_per_token: 0.000002,
            max_input_tokens: 32000,
          },
        },
      ],
    });

    expect(config['plain-model']).toEqual({ prompt: 1, completion: 2, context: 32000 });
    expect(config['plain-model']).not.toHaveProperty('read');
    expect(config['plain-model']).not.toHaveProperty('write');
  });

  it('skips models with no input_cost_per_token instead of pricing them at 0', () => {
    const config = processLiteLLMModelData({
      data: [
        { model_name: 'unpriced-model', model_info: { max_input_tokens: 8000 } },
        { model_name: 'no-model-info' },
      ],
    });

    expect(config).toEqual({});
  });

  it('defaults completion to 0 when only input cost is reported', () => {
    const config = processLiteLLMModelData({
      data: [
        {
          model_name: 'input-only-model',
          model_info: { input_cost_per_token: 0.000001 },
        },
      ],
    });

    expect(config['input-only-model']).toEqual({ prompt: 1, completion: 0, context: 0 });
  });

  it('throws on a malformed payload', () => {
    expect(() =>
      // @ts-expect-error: intentionally malformed input to test validation
      processLiteLLMModelData({ data: [{ model_name: 123 }] }),
    ).toThrow('Invalid input data');
  });
});

describe('gpt-5.6 tiers', () => {
  it('resolves 1.05M context and 128K output for every tier and the sol alias', () => {
    for (const model of ['gpt-5.6', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']) {
      expect(getModelMaxTokens(model, EModelEndpoint.openAI)).toBe(1050000);
      expect(getModelMaxOutputTokens(model, EModelEndpoint.openAI)).toBe(128000);
    }
  });

  it('matches the longest tier key over the shorter gpt-5 pattern', () => {
    expect(getModelMaxTokens('openai/gpt-5.6-terra-2026-07-09', EModelEndpoint.openAI)).toBe(
      1050000,
    );
    expect(getModelMaxTokens('gpt-5', EModelEndpoint.openAI)).toBe(400000);
  });
});
