import { logger } from '@librechat/data-schemas';
import type { TClassificationConfig } from 'librechat-data-provider';
import type { ProviderFetch } from './providers/transport';
import type { Classifier } from './types';
import { getProvider, providerNames, DEFAULT_API_KEY_ENV } from './registry';
import { ClassificationError } from './types';

interface CacheEntry {
  apiKey: string;
  provider: string;
  classifier: Classifier;
}

const cache = new WeakMap<TClassificationConfig, CacheEntry>();
const warned = new Set<string>();

export interface ResolveClassifierParams {
  config?: TClassificationConfig | null;
  apiKey?: string;
  fetch?: ProviderFetch;
}

export function resolveClassifier(params: ResolveClassifierParams): Classifier | null {
  const config = params.config;
  if (config == null || config.enabled !== true) {
    return null;
  }

  const providerId = config.provider;
  const entry = getProvider(providerId);
  if (entry == null) {
    if (!warned.has(`unknown:${providerId}`)) {
      warned.add(`unknown:${providerId}`);
      logger.warn(
        `[classification] unknown provider "${providerId}"; this build supports: ` +
          `${providerNames().join(', ')}. Classification stays off.`,
      );
    }
    return null;
  }

  const settings = config.providers?.[providerId] ?? {};
  const apiKeyEnv = settings.apiKeyEnv ?? DEFAULT_API_KEY_ENV;
  const apiKey = (params.apiKey ?? process.env[apiKeyEnv] ?? '').trim();
  if (!apiKey) {
    if (!warned.has(`key:${providerId}`)) {
      warned.add(`key:${providerId}`);
      logger.warn(
        `[classification] provider "${providerId}" is configured but ${apiKeyEnv} is not set; ` +
          'every classification capability stays off.',
      );
    }
    return null;
  }

  const cached = cache.get(config);
  if (cached != null && cached.apiKey === apiKey && cached.provider === providerId) {
    return cached.classifier;
  }

  try {
    const classifier = entry.create({ settings, apiKey, fetch: params.fetch });
    cache.set(config, { apiKey, provider: providerId, classifier });
    return classifier;
  } catch (error) {
    logger.error(
      `[classification] could not build provider "${providerId}"; capabilities stay off`,
      error instanceof ClassificationError ? { failure: error.failure } : error,
    );
    return null;
  }
}

export type ClassificationCapabilityName = 'toolSelection' | 'memoryGate';

export function classificationCapability<K extends ClassificationCapabilityName>(
  config: TClassificationConfig | null | undefined,
  capability: K,
  options?: { apiKey?: string; fetch?: ProviderFetch },
): { classifier: Classifier; settings: NonNullable<TClassificationConfig>[K] } | null {
  if (config == null || config.enabled !== true) {
    return null;
  }
  const settings = config[capability];
  if (settings == null || settings.enabled !== true) {
    return null;
  }
  const classifier = resolveClassifier({ config, apiKey: options?.apiKey, fetch: options?.fetch });
  if (classifier == null) {
    return null;
  }
  return { classifier, settings };
}
