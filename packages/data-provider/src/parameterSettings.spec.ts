import type { SettingDefinition } from './generate';
import { applyModelAwareDefaults, paramSettings } from './parameterSettings';
import { EModelEndpoint } from './types';

const googleParams = paramSettings[EModelEndpoint.google] as SettingDefinition[];
const openAIParams = paramSettings[EModelEndpoint.openAI] as SettingDefinition[];
const maxOut = (params: SettingDefinition[]) => params.find((p) => p.key === 'maxOutputTokens');
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

  it('returns settings unchanged for non-Google endpoints', () => {
    const result = applyModelAwareDefaults(
      googleParams,
      EModelEndpoint.anthropic,
      'gemini-2.5-pro',
    );
    expect(result).toBe(googleParams);
  });

  it('returns settings unchanged when no model is provided', () => {
    expect(applyModelAwareDefaults(googleParams, EModelEndpoint.google, '')).toBe(googleParams);
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
      isAgent: true,
    });

    expect(getParam(result, 'reasoning_mode')).toBeDefined();
    expect(getParam(result, 'reasoning_context')).toBeDefined();
    expect(getParam(result, 'priorityProcessing')).toBeDefined();
    expect(getParam(result, 'promptCache')).toBeDefined();
    expect(getParam(result, 'reasoning_effort')?.options).toContain('max');
    expect(getParam(result, 'imageDetail')?.options).toContain('original');
  });

  it('hides Responses-only and agent-only controls when they are not applicable', () => {
    const result = applyModelAwareDefaults(openAIParams, EModelEndpoint.openAI, 'gpt-5.6', {
      provider: EModelEndpoint.openAI,
      useResponsesApi: false,
      isAgent: false,
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
  });

  it('does not advertise managed GPT-5.6 fields on compatible custom endpoints', () => {
    const result = applyModelAwareDefaults(openAIParams, EModelEndpoint.custom, 'gpt-5.6', {
      provider: 'compatible-proxy',
      useResponsesApi: true,
      isAgent: true,
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

  it('removes max effort from older OpenAI models', () => {
    const result = applyModelAwareDefaults(openAIParams, EModelEndpoint.openAI, 'gpt-5.4', {
      provider: EModelEndpoint.openAI,
      useResponsesApi: true,
    });
    expect(getParam(result, 'reasoning_effort')?.options).not.toContain('max');
  });
});
