import type { ProviderFetch } from './providers/transport';
import type { Classifier } from './types';
import { createTypeSafeClassifier, PROVIDER_ID as TYPESAFE_ID } from './providers/typesafe';
import { createHttpClassifier, PROVIDER_ID as HTTP_ID } from './providers/http';

export interface ProviderSettings {
  baseURL?: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  apiKeyEnv?: string;
}

export interface ProviderBuildParams {
  settings: ProviderSettings;
  apiKey: string;
  fetch?: ProviderFetch;
}

export interface ProviderEntry {
  create(params: ProviderBuildParams): Classifier;
}

export const PROVIDERS: Record<string, ProviderEntry> = {
  [HTTP_ID]: {
    create: ({ settings, apiKey, fetch }) =>
      createHttpClassifier({
        apiKey,
        endpoint: settings.baseURL ?? '',
        model: settings.model,
        timeoutMs: settings.timeoutMs,
        maxRetries: settings.maxRetries,
        fetch,
      }),
  },
  [TYPESAFE_ID]: {
    create: ({ settings, apiKey, fetch }) =>
      createTypeSafeClassifier({
        apiKey,
        baseURL: settings.baseURL,
        model: settings.model,
        timeoutMs: settings.timeoutMs,
        maxRetries: settings.maxRetries,
        fetch,
      }),
  },
};

export const DEFAULT_API_KEY_ENV = 'CLASSIFIER_API_KEY';

export function getProvider(id: string | undefined): ProviderEntry | null {
  if (!id) {
    return null;
  }
  return PROVIDERS[id] ?? null;
}

export function providerNames(): string[] {
  return Object.keys(PROVIDERS);
}
