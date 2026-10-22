import { mergeConfigOverrides } from '@librechat/data-schemas';
import type { AppConfig, ConfigOverrideLayer } from '@librechat/data-schemas';
import type { EnvReferencePolicy } from './allowlist';
import type { SecretRebinding } from './rebinding';
import { resolveRuntimeConfigSecrets } from '~/admin/secrets';
import { createSecretRebindingGuard } from './rebinding';
import { neutralizeEnvReferences } from './allowlist';

export interface OverrideMergeOptions {
  /** Which `${NAME}` references values from override layers may resolve. */
  envPolicy: EnvReferencePolicy;
  /** Told about each inherited secret a layer drops for sending it somewhere new. */
  onRebinding?: (rebinding: SecretRebinding) => void;
}

/**
 * Merges database override layers into the base config under the policies that apply to
 * admin-written values: each layer's disallowed `${NAME}` references resolve to nothing before it
 * merges, and a secret sent anywhere but the destination it was entered for is dropped
 * (`createSecretRebindingGuard`; web search keys by the merge's own rule, whose drops are
 * reported the same way). Secrets stay as stored, so the result may be cached as is.
 */
export function mergeOverrideLayers(
  baseConfig: AppConfig,
  layers: readonly ConfigOverrideLayer[],
  options: OverrideMergeOptions,
): AppConfig {
  const neutralized = layers.map((layer) => {
    const overrides = neutralizeEnvReferences(layer.overrides, options.envPolicy);
    return overrides === layer.overrides ? layer : { ...layer, overrides };
  });
  const { onRebinding } = options;
  return mergeConfigOverrides(baseConfig, neutralized, {
    afterLayer: createSecretRebindingGuard(onRebinding),
    onWebSearchKeyUnbound: ({ layer, apiKey }) =>
      onRebinding?.({
        layer,
        kind: 'secret',
        segments: ['webSearch', apiKey],
        path: `webSearch.${apiKey}`,
      }),
  });
}

/**
 * {@link mergeOverrideLayers}, then the stored credentials runtime readers need in plaintext
 * decrypted once (`resolveRuntimeConfigSecrets`).
 */
export function resolveConfigOverrides(
  baseConfig: AppConfig,
  layers: readonly ConfigOverrideLayer[],
  options: OverrideMergeOptions,
): AppConfig {
  return resolveRuntimeConfigSecrets(mergeOverrideLayers(baseConfig, layers, options));
}
