import type { SettingDefinition } from './generate';
import { applyModelAwareDefaults, paramSettings } from './parameterSettings';
import { EModelEndpoint } from './types';

const googleParams = paramSettings[EModelEndpoint.google] as SettingDefinition[];
const maxOut = (params: SettingDefinition[]) => params.find((p) => p.key === 'maxOutputTokens');
const thinkingBudget = (params: SettingDefinition[]) =>
  params.find((p) => p.key === 'thinkingBudget');

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
