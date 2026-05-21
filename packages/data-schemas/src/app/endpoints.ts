import { EModelEndpoint } from 'librechat-data-provider';
import type { TCustomConfig, TAgentsEndpoint, TAnthropicEndpoint } from 'librechat-data-provider';
import type { AppConfig } from '~/types';
import { agentsConfigSetup } from './agents';
import { azureConfigSetup } from './azure';

/**
 * Loads custom config endpoints
 * @param [config]
 * @param [agentsDefaults]
 */
export const loadEndpoints = (
  config: Partial<TCustomConfig>,
  agentsDefaults?: Partial<TAgentsEndpoint>,
) => {
  const loadedEndpoints: AppConfig['endpoints'] = {};
  const endpoints = config?.endpoints;

  if (endpoints?.[EModelEndpoint.azureOpenAI]) {
    loadedEndpoints[EModelEndpoint.azureOpenAI] = azureConfigSetup(config);
  }

  loadedEndpoints[EModelEndpoint.agents] = agentsConfigSetup(config, agentsDefaults);

  if (endpoints?.[EModelEndpoint.anthropic]) {
    loadedEndpoints[EModelEndpoint.anthropic] = endpoints[EModelEndpoint.anthropic] as Partial<TAnthropicEndpoint>;
  }

  const endpointKeys = [
    EModelEndpoint.openAI,
    EModelEndpoint.google,
    EModelEndpoint.custom,
  ];

  endpointKeys.forEach((key) => {
    const currentKey = key as keyof typeof endpoints;
    if (endpoints?.[currentKey]) {
      loadedEndpoints[currentKey] = endpoints[currentKey];
    }
  });

  if (endpoints?.all) {
    loadedEndpoints.all = endpoints.all;
  }

  if (endpoints?.allowedAddresses) {
    loadedEndpoints.allowedAddresses = endpoints.allowedAddresses;
  }

  return loadedEndpoints;
};
