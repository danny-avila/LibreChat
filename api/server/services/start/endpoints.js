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

  if (endpoints?.all) {
    loadedEndpoints.all = endpoints.all;
  }

  return loadedEndpoints;
};

module.exports = {
  loadEndpoints,
};
