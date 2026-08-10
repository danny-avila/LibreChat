import { EModelEndpoint, Providers } from './types';
import {
  paramSettings,
  presetSettings,
  agentParamSettings,
  applyModelAwareDefaults,
} from './parameterSettings';
import type { SettingDefinition } from './generate';

const googleParams = paramSettings[EModelEndpoint.google] as SettingDefinition[];
const maxOut = (params: SettingDefinition[]) => params.find((p) => p.key === 'maxOutputTokens');

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
});

/**
 * Behavior 3.1 — every BAML settings shape is empty and typed.
 *
 * BAML owns generation parameters inside its compiled clients, so the host must
 * offer no controls at all. The shapes stay real `SettingsConfiguration` values;
 * an empty list is the contract, not a cast to something the renderer tolerates.
 */
describe('BAML parameter settings', () => {
  it('registers an empty parameter definition list', () => {
    expect(paramSettings[Providers.BAML]).toEqual([]);
  });

  it('registers both preset columns as empty', () => {
    expect(presetSettings[Providers.BAML]).toEqual({ col1: [], col2: [] });
  });

  it('derives an empty agent parameter list rather than an absent one', () => {
    expect(agentParamSettings[Providers.BAML]).toEqual([]);
  });

  it('leaves the OpenAI-shaped providers it sits beside untouched', () => {
    expect(paramSettings[EModelEndpoint.openAI]?.length).toBeGreaterThan(0);
    expect(paramSettings[Providers.OPENROUTER]?.length).toBeGreaterThan(0);
    expect(presetSettings[EModelEndpoint.anthropic]?.col2.length).toBeGreaterThan(0);
  });
});
