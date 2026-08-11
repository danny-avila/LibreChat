import { EModelEndpoint, extractEnvVariable, normalizeEndpointName } from 'librechat-data-provider';
import type { TCustomEndpoints, TEndpoint } from 'librechat-data-provider';
import type { TCustomEndpointsConfig } from '~/types/endpoints';
import {
  isBamlEndpoint,
  isPublishableCustomEndpoint,
  resolveDefaultParams,
} from '~/endpoints/custom/provider';
import { isUserProvided } from '~/utils';

/**
 * Load config endpoints from the cached configuration object
 * @param customEndpointsConfig - The configuration object
 */
export function loadCustomEndpointsConfig(
  customEndpoints?: TCustomEndpoints,
): TCustomEndpointsConfig | undefined {
  if (!customEndpoints) {
    return;
  }

  const customEndpointsConfig: TCustomEndpointsConfig = {};

  if (Array.isArray(customEndpoints)) {
    const filteredEndpoints = customEndpoints.filter(isPublishableCustomEndpoint);

    for (let i = 0; i < filteredEndpoints.length; i++) {
      const endpoint = filteredEndpoints[i] as TEndpoint;
      const { baseURL, apiKey, name: configName, iconURL, modelDisplayLabel } = endpoint;
      const name = normalizeEndpointName(configName);
      const customParams = resolveDefaultParams(endpoint);

      /**
       * A BAML endpoint has no credentials to resolve and no URL to hand out, so
       * discovery does neither. Publishing it as an ordinary named custom
       * endpoint is deliberate: the client never learns it is BAML-backed beyond
       * `defaultParamsEndpoint`, and the persisted identity stays the name.
       */
      if (isBamlEndpoint(endpoint)) {
        customEndpointsConfig[name] = {
          type: EModelEndpoint.custom,
          userProvide: false,
          userProvideURL: false,
          customParams,
          modelDisplayLabel,
          iconURL,
        };
        continue;
      }

      const resolvedApiKey = extractEnvVariable(apiKey ?? '');
      const resolvedBaseURL = extractEnvVariable(baseURL ?? '');
      const userProvideURL = isUserProvided(resolvedBaseURL);

      customEndpointsConfig[name] = {
        type: EModelEndpoint.custom,
        userProvide: isUserProvided(resolvedApiKey) || userProvideURL,
        userProvideURL,
        customParams,
        modelDisplayLabel,
        iconURL,
      };
    }
  }

  return customEndpointsConfig;
}
