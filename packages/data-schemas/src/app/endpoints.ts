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

  // Auto-add Ollama endpoint if not configured explicitly
  // Enables model auto-discovery after pulling models in a local/docker setup
  if (endpoints?.[EModelEndpoint.custom]) {
    const custom = Array.isArray(loadedEndpoints[EModelEndpoint.custom])
      ? loadedEndpoints[EModelEndpoint.custom]
      : endpoints[EModelEndpoint.custom];
    const hasOllama = Array.isArray(custom)
      ? custom.some((e) => typeof e?.name === 'string' && e.name.toLowerCase().startsWith('ollama'))
      : false;
    if (!hasOllama) {
      const baseURL = process.env.OLLAMA_BASE_URL || 'http://ollama:11434';
      const ollamaEndpoint = {
        name: 'ollama',
        baseURL,
        models: { default: [], fetch: true },
        modelDisplayLabel: 'Ollama',
      };
      loadedEndpoints[EModelEndpoint.custom] = Array.isArray(custom)
        ? [...custom, ollamaEndpoint]
        : [ollamaEndpoint];
    }
  } else {
    const baseURL = process.env.OLLAMA_BASE_URL || 'http://ollama:11434';
    loadedEndpoints[EModelEndpoint.custom] = [
      {
        name: 'ollama',
        baseURL,
        models: { default: [], fetch: true },
        modelDisplayLabel: 'Ollama',
      },
    ];
  }

  if (endpoints?.all) {
    loadedEndpoints.all = endpoints.all;
  }

  return loadedEndpoints;
};
