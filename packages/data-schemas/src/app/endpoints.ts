import { EModelEndpoint } from 'librechat-data-provider';
import type { TCustomConfig, TAgentsEndpoint } from 'librechat-data-provider';
import type { AppConfig } from '~/types';
import { azureAssistantsDefaults, assistantsConfigSetup } from './assistants';
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

  if (endpoints?.[EModelEndpoint.azureOpenAI]?.assistants) {
    loadedEndpoints[EModelEndpoint.azureAssistants] = azureAssistantsDefaults();
  }

  if (endpoints?.[EModelEndpoint.azureAssistants]) {
    loadedEndpoints[EModelEndpoint.azureAssistants] = assistantsConfigSetup(
      config,
      EModelEndpoint.azureAssistants,
      loadedEndpoints[EModelEndpoint.azureAssistants],
    );
  }

  if (endpoints?.[EModelEndpoint.assistants]) {
    loadedEndpoints[EModelEndpoint.assistants] = assistantsConfigSetup(
      config,
      EModelEndpoint.assistants,
      loadedEndpoints[EModelEndpoint.assistants],
    );
  }

  loadedEndpoints[EModelEndpoint.agents] = agentsConfigSetup(config, agentsDefaults);

  const endpointKeys = [
    EModelEndpoint.openAI,
    EModelEndpoint.google,
    EModelEndpoint.custom,
    EModelEndpoint.bedrock,
    EModelEndpoint.anthropic,
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

  return loadedEndpoints;
};
