import { defaultEndpoints } from 'librechat-data-provider';
import type { EModelEndpoint, TEndpointsConfig } from 'librechat-data-provider';

const getEndpointsFilter = (endpointsConfig: TEndpointsConfig) => {
  const filter: Record<string, boolean> = {};
  for (const key of Object.keys(endpointsConfig)) {
    filter[key] = !!endpointsConfig[key];
  }
  return filter;
};

const getAvailableEndpoints = (
  filter: Record<string, boolean>,
  endpointsConfig: TEndpointsConfig,
) => {
  const defaultSet = new Set(defaultEndpoints);
  const availableEndpoints: EModelEndpoint[] = [];

  for (const endpoint in endpointsConfig) {
    // Check if endpoint is in the filter or its type is in defaultEndpoints
    if (
      filter[endpoint] ||
      (endpointsConfig[endpoint]?.type && defaultSet.has(endpointsConfig[endpoint].type))
    ) {
      availableEndpoints.push(endpoint as EModelEndpoint);
    }
  }

  return availableEndpoints;
};

export default function mapEndpoints(endpointsConfig: TEndpointsConfig) {
  const filter = getEndpointsFilter(endpointsConfig);
  return getAvailableEndpoints(filter, endpointsConfig).sort(
    (a, b) => (endpointsConfig[a]?.order ?? 0) - (endpointsConfig[b]?.order ?? 0),
  );
}
