import { defaultEndpoints } from 'librechat-data-provider';
import type { TEndpointsConfig } from 'librechat-data-provider';

const getEndpointsFilter = (config: TEndpointsConfig) => {
  const filter: Record<string, boolean> = {};
  for (const key of Object.keys(config)) {
    filter[key] = !!config[key];
  }
  return filter;
};

const getAvailableEndpoints = (filter: Record<string, boolean>) => {
  const endpoints = defaultEndpoints;
  return endpoints.filter((endpoint) => filter[endpoint]);
};

export default function mapEndpoints(config: TEndpointsConfig) {
  const filter = getEndpointsFilter(config);
  return getAvailableEndpoints(filter).sort((a, b) => config[a].order - config[b].order);
}
