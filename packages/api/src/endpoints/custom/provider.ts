import { Providers, isBamlEndpoint } from 'librechat-data-provider';
import type { TEndpoint } from 'librechat-data-provider';

/**
 * The provider-aware half of custom-endpoint discovery, shared by endpoint
 * discovery (`custom/config.ts`) and model discovery (`config/models.ts`).
 *
 * Both used to apply the same inlined filter, and both assumed every custom
 * endpoint has a `baseURL` and an `apiKey`. A BAML endpoint has neither by
 * design — its transport and credentials belong to the compiled client — so
 * without a shared predicate the two call sites would drift, and a BAML endpoint
 * would be silently dropped from one surface but not the other.
 *
 * Pure: no credential resolution, no URL validation, no user-secret lookup, no
 * model fetch, no cache access.
 */

export { isBamlEndpoint };

/**
 * Is this entry complete enough to publish?
 *
 * An OpenAI-compatible endpoint needs somewhere to send requests and something
 * to authenticate with. A BAML endpoint needs neither, and instead needs the
 * explicit list of compiled clients it exposes.
 */
export const isPublishableCustomEndpoint = (endpoint: Partial<TEndpoint>): boolean => {
  if (endpoint?.name == null || endpoint.name === '') {
    return false;
  }
  if (isBamlEndpoint(endpoint)) {
    return (endpoint.models?.default?.length ?? 0) > 0;
  }
  return Boolean(
    endpoint.baseURL &&
      endpoint.apiKey &&
      endpoint.models &&
      (endpoint.models.fetch || endpoint.models.default),
  );
};

/**
 * The exact logical client names an endpoint exposes, case preserved.
 *
 * Each is a case-sensitive foreign key into the compiled-client registry. A name
 * may be allow-listed here and absent from the registry: discovery still
 * publishes it, and the mismatch becomes a sanitized turn-level `model_error`
 * rather than a startup failure, so one uncompiled entry cannot take the
 * endpoint down.
 */
export const bamlClientNames = (endpoint: Partial<TEndpoint>): string[] => {
  const defaults = endpoint.models?.default ?? [];
  const names: string[] = [];
  for (const entry of defaults) {
    const name = typeof entry === 'string' ? entry : entry?.name;
    if (typeof name === 'string' && name !== '') {
      names.push(name);
    }
  }
  return names;
};

/**
 * A native `provider` implies its parameter set. Surfacing it as
 * `defaultParamsEndpoint` is what makes the client render the right controls —
 * Anthropic's `maxOutputTokens`/`thinking` rather than OpenAI's `max_tokens`,
 * and for BAML no generation controls at all.
 *
 * An admin's explicit non-default choice still wins, except for BAML, where the
 * only accepted values normalize to the provider anyway.
 */
export const resolveDefaultParams = (
  endpoint: Partial<TEndpoint>,
): TEndpoint['customParams'] | undefined => {
  const { customParams, provider } = endpoint;
  if (provider == null) {
    return customParams;
  }
  if (provider === Providers.BAML) {
    return { ...customParams, defaultParamsEndpoint: Providers.BAML };
  }
  const chosen = customParams?.defaultParamsEndpoint;
  return chosen == null || chosen === 'custom'
    ? { ...customParams, defaultParamsEndpoint: provider }
    : customParams;
};
