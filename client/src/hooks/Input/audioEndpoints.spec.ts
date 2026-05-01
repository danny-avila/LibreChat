import { STTProviders, TTSProviders } from 'librechat-data-provider';
import { STTEndpoints, TTSEndpoints } from '~/common';
import { isExternalAvailable, normalizeSTTEndpoint, normalizeTTSEndpoint } from './audioEndpoints';

describe('audio endpoint normalization', () => {
  it('detects external availability from config values', () => {
    expect(isExternalAvailable(true)).toBe(true);
    expect(isExternalAvailable('true')).toBe(true);
    expect(isExternalAvailable(false)).toBe(false);
    expect(isExternalAvailable('false')).toBe(false);
    expect(isExternalAvailable(undefined)).toBe(false);
  });

  it('routes configured STT providers through the external recorder', () => {
    expect(normalizeSTTEndpoint(STTProviders.OPENAI, true)).toBe(STTEndpoints.external);
    expect(normalizeSTTEndpoint(STTProviders.AZURE_OPENAI, true)).toBe(STTEndpoints.external);
    expect(normalizeSTTEndpoint(STTEndpoints.external, true)).toBe(STTEndpoints.external);
    expect(normalizeSTTEndpoint(STTEndpoints.browser, true)).toBe(STTEndpoints.browser);
  });

  it('falls back to browser STT when external STT is unavailable', () => {
    expect(normalizeSTTEndpoint(STTProviders.OPENAI, false)).toBe(STTEndpoints.browser);
    expect(normalizeSTTEndpoint(STTEndpoints.external, false)).toBe(STTEndpoints.browser);
  });

  it('routes configured TTS providers through the external player', () => {
    expect(normalizeTTSEndpoint(TTSProviders.OPENAI, true)).toBe(TTSEndpoints.external);
    expect(normalizeTTSEndpoint(TTSProviders.AZURE_OPENAI, true)).toBe(TTSEndpoints.external);
    expect(normalizeTTSEndpoint(TTSProviders.ELEVENLABS, true)).toBe(TTSEndpoints.external);
    expect(normalizeTTSEndpoint(TTSProviders.LOCALAI, true)).toBe(TTSEndpoints.external);
    expect(normalizeTTSEndpoint(TTSEndpoints.external, true)).toBe(TTSEndpoints.external);
    expect(normalizeTTSEndpoint(TTSEndpoints.browser, true)).toBe(TTSEndpoints.browser);
  });

  it('falls back to browser TTS when external TTS is unavailable', () => {
    expect(normalizeTTSEndpoint(TTSProviders.OPENAI, false)).toBe(TTSEndpoints.browser);
    expect(normalizeTTSEndpoint(TTSEndpoints.external, false)).toBe(TTSEndpoints.browser);
  });
});
