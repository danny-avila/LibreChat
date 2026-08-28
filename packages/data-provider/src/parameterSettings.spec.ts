import type { SettingDefinition } from './generate';
import { applyModelAwareDefaults, paramSettings } from './parameterSettings';
import { EModelEndpoint } from './types';

const googleParams = paramSettings[EModelEndpoint.google] as SettingDefinition[];
const anthropicParams = paramSettings[EModelEndpoint.anthropic] as SettingDefinition[];
const maxOut = (params: SettingDefinition[]) => params.find((p) => p.key === 'maxOutputTokens');
const maxContext = (params: SettingDefinition[]) =>
  params.find((p) => p.key === 'maxContextTokens');
const thinkingBudget = (params: SettingDefinition[]) =>
  params.find((p) => p.key === 'thinkingBudget');
const hasSetting = (params: SettingDefinition[], key: string) =>
  params.some((param) => param.key === key);

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
    const result = applyModelAwareDefaults(googleParams, EModelEndpoint.openAI, 'gemini-2.5-pro');
    expect(result).toBe(googleParams);
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

  it('keeps thinkingBudget -1 as the range minimum and applies the Pro floor separately', () => {
    const result = applyModelAwareDefaults(googleParams, EModelEndpoint.google, 'gemini-2.5-pro');
    expect(thinkingBudget(result)?.range).toMatchObject({
      min: -1,
      max: 32768,
      positiveMin: 128,
    });
  });

  it('applies the Flash Lite thinking-budget floor without raising the sentinel minimum', () => {
    const result = applyModelAwareDefaults(
      googleParams,
      EModelEndpoint.google,
      'gemini-2.5-flash-lite',
    );
    expect(thinkingBudget(result)?.range).toMatchObject({
      min: -1,
      max: 24576,
      positiveMin: 512,
    });
  });

  it('applies the Flash thinking-budget ceiling and a zero positive floor', () => {
    const result = applyModelAwareDefaults(googleParams, EModelEndpoint.google, 'gemini-2.5-flash');
    expect(thinkingBudget(result)?.range).toMatchObject({
      min: -1,
      max: 24576,
      positiveMin: 0,
    });
  });
});

/**
 * The field is rendered by every endpoint, so bounds written for Gemini would
 * silently clamp a context window another provider accepts.
 */
describe('maxContextTokens bounds', () => {
  it('bounds the Google field to the documented context window', () => {
    expect(maxContext(googleParams)?.range).toEqual({ min: 10, max: 2000000, step: 1000 });
  });

  it('leaves every other endpoint unbounded', () => {
    const bounded = Object.entries(paramSettings)
      .filter(([endpoint]) => endpoint !== EModelEndpoint.google)
      .filter(([, params]) => maxContext(params as SettingDefinition[])?.range != null)
      .map(([endpoint]) => endpoint);

    expect(bounded).toEqual([]);
  });
});
