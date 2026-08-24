import type { SettingDefinition } from './generate';
import {
  getInvalidModelAwareKeys,
  applyModelAwareDefaults,
  paramSettings,
  presetSettings,
} from './parameterSettings';
import { EModelEndpoint } from './types';
import { Providers } from './schemas';

const googleParams = paramSettings[EModelEndpoint.google] as SettingDefinition[];
const anthropicParams = paramSettings[EModelEndpoint.anthropic] as SettingDefinition[];
const openAIParams = paramSettings[EModelEndpoint.openAI] as SettingDefinition[];
const maxOut = (params: SettingDefinition[]) => params.find((p) => p.key === 'maxOutputTokens');
const hasSetting = (params: SettingDefinition[], key: string) =>
  params.some((param) => param.key === key);
const getParam = (params: SettingDefinition[], key: string) => params.find((p) => p.key === key);

describe('applyModelAwareDefaults', () => {
  it('resolves the Google maxOutputTokens default for current Gemini models', () => {
    const result = applyModelAwareDefaults(googleParams, EModelEndpoint.google, 'gemini-2.5-pro');
    expect(maxOut(result)?.default).toBe(65535);
  });

  it('resolves the legacy default for older Gemini models', () => {
    const result = applyModelAwareDefaults(googleParams, EModelEndpoint.google, 'gemini-1.5-flash');
    expect(maxOut(result)?.default).toBe(8192);
  });

  it('resolves the image default for Gemini image models', () => {
    const result = applyModelAwareDefaults(
      googleParams,
      EModelEndpoint.google,
      'gemini-2.5-flash-image',
    );
    expect(maxOut(result)?.default).toBe(32768);
  });

  it('returns settings unchanged for unrelated endpoints', () => {
    const result = applyModelAwareDefaults(googleParams, EModelEndpoint.bedrock, 'gemini-2.5-pro');
    expect(result).toBe(googleParams);
  });

  it('keeps OpenRouter caching without exposing managed OpenAI controls', () => {
    const params = paramSettings[Providers.OPENROUTER] as SettingDefinition[];
    const preset = presetSettings[Providers.OPENROUTER];
    const applied = applyModelAwareDefaults(params, EModelEndpoint.custom, 'openai/gpt-5.6', {
      provider: Providers.OPENROUTER,
    });

    expect(params.filter((param) => param.key === 'promptCache')).toHaveLength(1);
    expect(hasSetting(params, 'priorityProcessing')).toBe(false);
    expect(preset?.col2.filter((param) => param.key === 'promptCache')).toHaveLength(1);
    expect(preset?.col2.some((param) => param.key === 'priorityProcessing')).toBe(false);
    expect(applied.filter((param) => param.key === 'promptCache')).toHaveLength(1);
    expect(hasSetting(applied, 'promptCacheTtl')).toBe(true);
  });

  it('keeps prompt-cache controls for future Claude models that support caching', () => {
    const result = applyModelAwareDefaults(
      anthropicParams,
      EModelEndpoint.anthropic,
      'claude-sonnet-6',
    );

    expect(hasSetting(result, 'promptCache')).toBe(true);
    expect(hasSetting(result, 'promptCacheTtl')).toBe(true);
  });

  it('hides prompt-cache controls for Anthropic models that do not support caching', () => {
    const result = applyModelAwareDefaults(
      anthropicParams,
      EModelEndpoint.anthropic,
      'claude-3-5-sonnet-latest',
    );

    expect(hasSetting(result, 'promptCache')).toBe(false);
    expect(hasSetting(result, 'promptCacheTtl')).toBe(false);
    expect(hasSetting(result, 'temperature')).toBe(true);
  });

  it('returns settings unchanged when no model is provided', () => {
    expect(applyModelAwareDefaults(googleParams, EModelEndpoint.google, '')).toBe(googleParams);
  });

  it('hides GPT-5.6-only controls when no OpenAI model is selected', () => {
    const result = applyModelAwareDefaults(openAIParams, EModelEndpoint.openAI, '', {
      provider: EModelEndpoint.openAI,
      useResponsesApi: true,
    });

    for (const key of [
      'reasoning_mode',
      'reasoning_context',
      'priorityProcessing',
      'promptCache',
    ]) {
      expect(getParam(result, key)).toBeUndefined();
    }
    expect(getParam(result, 'reasoning_effort')?.options).not.toContain('max');
    expect(getParam(result, 'imageDetail')?.options).not.toContain('original');
  });

  it('does not mutate the original settings', () => {
    const before = maxOut(googleParams)?.default;
    applyModelAwareDefaults(googleParams, EModelEndpoint.google, 'gemini-2.5-pro');
    expect(maxOut(googleParams)?.default).toBe(before);
  });

  it('lets a configured override applied afterward take precedence', () => {
    const modelAware = applyModelAwareDefaults(
      googleParams,
      EModelEndpoint.google,
      'gemini-2.5-pro',
    );
    const override = { ...maxOut(modelAware), default: 2048 } as SettingDefinition;
    const final = modelAware.map((p) => (p.key === 'maxOutputTokens' ? override : p));
    expect(maxOut(final)?.default).toBe(2048);
  });

  it('shows GPT-5.6 Responses controls for first-party OpenAI agents', () => {
    const result = applyModelAwareDefaults(openAIParams, EModelEndpoint.openAI, 'gpt-5.6-sol', {
      provider: EModelEndpoint.openAI,
      useResponsesApi: true,
    });

    expect(getParam(result, 'reasoning_mode')).toBeDefined();
    expect(getParam(result, 'reasoning_context')).toBeDefined();
    expect(getParam(result, 'priorityProcessing')).toBeDefined();
    expect(getParam(result, 'priorityProcessing')?.label).toBe('com_endpoint_fast_mode');
    expect(getParam(result, 'promptCache')).toBeDefined();
    expect(getParam(result, 'reasoning_effort')?.options).toContain('max');
    expect(getParam(result, 'imageDetail')?.options).toContain('original');
  });

  it('hides Responses-only controls when Responses is disabled', () => {
    const result = applyModelAwareDefaults(openAIParams, EModelEndpoint.openAI, 'gpt-5.6', {
      provider: EModelEndpoint.openAI,
      useResponsesApi: false,
    });

    expect(getParam(result, 'reasoning_mode')).toBeUndefined();
    expect(getParam(result, 'reasoning_context')).toBeUndefined();
    expect(getParam(result, 'priorityProcessing')).toBeDefined();
    expect(getParam(result, 'promptCache')).toBeDefined();
  });

  it('only shows Azure priority for configured logical models', () => {
    const hidden = applyModelAwareDefaults(openAIParams, EModelEndpoint.azureOpenAI, 'gpt-5.6', {
      provider: EModelEndpoint.azureOpenAI,
      priorityModels: [],
    });
    const visible = applyModelAwareDefaults(openAIParams, EModelEndpoint.azureOpenAI, 'gpt-5.6', {
      provider: EModelEndpoint.azureOpenAI,
      priorityModels: ['gpt-5.6'],
    });

    expect(getParam(hidden, 'priorityProcessing')).toBeUndefined();
    expect(getParam(visible, 'priorityProcessing')).toBeDefined();
    expect(getParam(visible, 'priorityProcessing')?.label).toBe('com_endpoint_priority_processing');
  });

  it('preserves Responses reasoning while hiding managed fields on compatible endpoints', () => {
    const result = applyModelAwareDefaults(openAIParams, EModelEndpoint.custom, 'gpt-5.6', {
      provider: 'compatible-proxy',
      useResponsesApi: true,
    });

    expect(getParam(result, 'reasoning_mode')).toBeDefined();
    expect(getParam(result, 'reasoning_context')).toBeDefined();
    for (const key of ['priorityProcessing', 'promptCache']) {
      expect(getParam(result, key)).toBeUndefined();
    }
    expect(getParam(result, 'reasoning_effort')?.options).toContain('max');
    expect(getParam(result, 'imageDetail')?.options).not.toContain('original');
  });

  it('removes max effort from older OpenAI models', () => {
    const result = applyModelAwareDefaults(openAIParams, EModelEndpoint.openAI, 'gpt-5.4', {
      provider: EModelEndpoint.openAI,
      useResponsesApi: true,
    });
    expect(getParam(result, 'reasoning_effort')?.options).not.toContain('max');
  });

  it('identifies model-aware values that are no longer supported', () => {
    const result = applyModelAwareDefaults(openAIParams, EModelEndpoint.openAI, 'gpt-5.4', {
      provider: EModelEndpoint.openAI,
      useResponsesApi: true,
    });

    expect(
      getInvalidModelAwareKeys(result, {
        imageDetail: 'original',
        reasoning_effort: 'max',
      }),
    ).toEqual(['imageDetail', 'reasoning_effort']);
  });

  it('keeps supported GPT-5.6 model-aware values', () => {
    const result = applyModelAwareDefaults(openAIParams, EModelEndpoint.openAI, 'gpt-5.6', {
      provider: EModelEndpoint.openAI,
      useResponsesApi: true,
    });

    expect(
      getInvalidModelAwareKeys(result, {
        imageDetail: 'original',
        reasoning_effort: 'max',
      }),
    ).toEqual([]);
  });
});
