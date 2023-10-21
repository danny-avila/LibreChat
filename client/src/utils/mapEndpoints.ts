import type { TEndpointsConfig } from 'librechat-data-provider';

const getEndpointsFilter = (config: TEndpointsConfig) => {
  const filter: Record<string, boolean> = {};
  for (const key of Object.keys(config)) {
    filter[key] = !!config[key];
  }
  return filter;
};

const getAvailableEndpoints = (filter: Record<string, boolean>) => {
  const endpoints = [
    'azureOpenAI',
    'openAI',
    'chatGPTBrowser',
    'gptPlugins',
    'bingAI',
    'google',
    'anthropic',
  ];
  return endpoints.filter((endpoint) => filter[endpoint]);
};

export default function mapEndpoints(config: TEndpointsConfig) {
  const filter = getEndpointsFilter(config);
  return getAvailableEndpoints(filter);
}
