const { agentsConfigSetup } = require('@librechat/api');
const { EModelEndpoint } = require('librechat-data-provider');
const { azureAssistantsDefaults, assistantsConfigSetup } = require('./assistants');
const { azureConfigSetup } = require('./azureOpenAI');
const { checkAzureVariables } = require('./checks');

/**
 * Loads custom config endpoints
 * @param {TCustomConfig} [config]
 * @param {TCustomConfig['endpoints']['agents']} [agentsDefaults]
 */
const loadEndpoints = (config, agentsDefaults) => {
  /** @type {AppConfig['endpoints']} */
  const loadedEndpoints = {};
  const endpoints = config?.endpoints;

  if (endpoints?.[EModelEndpoint.azureOpenAI]) {
    loadedEndpoints[EModelEndpoint.azureOpenAI] = azureConfigSetup(config);
    checkAzureVariables();
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
    if (endpoints?.[key]) {
      loadedEndpoints[key] = endpoints[key];
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

module.exports = {
  loadEndpoints,
};
