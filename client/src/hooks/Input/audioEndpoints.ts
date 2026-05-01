import { STTProviders, TTSProviders } from 'librechat-data-provider';
import { STTEndpoints, TTSEndpoints } from '~/common';

const externalSTTEndpoints = new Set<string>([
  STTEndpoints.external,
  STTProviders.OPENAI,
  STTProviders.AZURE_OPENAI,
]);

const externalTTSEndpoints = new Set<string>([
  TTSEndpoints.external,
  TTSProviders.OPENAI,
  TTSProviders.AZURE_OPENAI,
  TTSProviders.ELEVENLABS,
  TTSProviders.LOCALAI,
]);

export const isExternalAvailable = (value: unknown) => value === true || value === 'true';

export const normalizeSTTEndpoint = (endpoint: string, externalAvailable: boolean) =>
  externalAvailable && externalSTTEndpoints.has(endpoint)
    ? STTEndpoints.external
    : STTEndpoints.browser;

export const normalizeTTSEndpoint = (endpoint: string, externalAvailable: boolean) =>
  externalAvailable && externalTTSEndpoints.has(endpoint)
    ? TTSEndpoints.external
    : TTSEndpoints.browser;
