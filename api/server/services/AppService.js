const { FileSources, EModelEndpoint, getConfigDefaults } = require('librechat-data-provider');
const { checkVariables, checkHealth, checkConfig, checkAzureVariables } = require('./start/checks');
const { azureAssistantsDefaults, assistantsConfigSetup } = require('./start/assistants');
const { initializeFirebase } = require('./Files/Firebase/initialize');
const loadCustomConfig = require('./Config/loadCustomConfig');
const handleRateLimits = require('./Config/handleRateLimits');
const { loadDefaultInterface } = require('./start/interface');
const { azureConfigSetup } = require('./start/azureOpenAI');
const { loadAndFormatTools } = require('./ToolService');
const { initializeRoles } = require('~/models/Role');
const paths = require('~/config/paths');

/**
 *
 * Loads custom config and initializes app-wide variables.
 * @function AppService
 * @param {Express.Application} app - The Express application object.
 */
const AppService = async (app) => {
  await initializeRoles();
  /** @type {TCustomConfig}*/
  const config = (await loadCustomConfig()) ?? {};
  const configDefaults = getConfigDefaults();

  const filteredTools = config.filteredTools;
  const includedTools = config.includedTools;
  const fileStrategy = config.fileStrategy ?? configDefaults.fileStrategy;
  const imageOutputType = config?.imageOutputType ?? configDefaults.imageOutputType;

  process.env.CDN_PROVIDER = fileStrategy;

  checkVariables();
  await checkHealth();

  if (fileStrategy === FileSources.firebase) {
    initializeFirebase();
  }

  /** @type {Record<string, FunctionTool} */
  const availableTools = loadAndFormatTools({
    directory: paths.structuredTools,
    adminFilter: filteredTools,
    adminIncluded: includedTools,
  });

  const socialLogins =
    config?.registration?.socialLogins ?? configDefaults?.registration?.socialLogins;
  const interfaceConfig = await loadDefaultInterface(config, configDefaults);

  const defaultLocals = {
    paths,
    fileStrategy,
    socialLogins,
    filteredTools,
    includedTools,
    availableTools,
    imageOutputType,
    interfaceConfig,
  };

  if (!Object.keys(config).length) {
    app.locals = defaultLocals;
    return;
  }

  checkConfig(config);
  handleRateLimits(config?.rateLimits);

  const endpointLocals = {};
  const endpoints = config?.endpoints;

  if (endpoints?.[EModelEndpoint.azureOpenAI]) {
    endpointLocals[EModelEndpoint.azureOpenAI] = azureConfigSetup(config);
    checkAzureVariables();
  }

  if (endpoints?.[EModelEndpoint.azureOpenAI]?.assistants) {
    endpointLocals[EModelEndpoint.azureAssistants] = azureAssistantsDefaults();
  }

  if (endpoints?.[EModelEndpoint.azureAssistants]) {
    endpointLocals[EModelEndpoint.azureAssistants] = assistantsConfigSetup(
      config,
      EModelEndpoint.azureAssistants,
      endpointLocals[EModelEndpoint.azureAssistants],
    );
  }

  if (endpoints?.[EModelEndpoint.assistants]) {
    endpointLocals[EModelEndpoint.assistants] = assistantsConfigSetup(
      config,
      EModelEndpoint.assistants,
      endpointLocals[EModelEndpoint.assistants],
    );
  }

  if (endpoints?.[EModelEndpoint.openAI]) {
    endpointLocals[EModelEndpoint.openAI] = endpoints[EModelEndpoint.openAI];
  }
  if (endpoints?.[EModelEndpoint.google]) {
    endpointLocals[EModelEndpoint.google] = endpoints[EModelEndpoint.google];
  }
  if (endpoints?.[EModelEndpoint.anthropic]) {
    endpointLocals[EModelEndpoint.anthropic] = endpoints[EModelEndpoint.anthropic];
  }
  if (endpoints?.[EModelEndpoint.gptPlugins]) {
    endpointLocals[EModelEndpoint.gptPlugins] = endpoints[EModelEndpoint.gptPlugins];
  }

  app.locals = {
    ...defaultLocals,
    modelSpecs: config.modelSpecs,
    fileConfig: config?.fileConfig,
    secureImageLinks: config?.secureImageLinks,
    ...endpointLocals,
  };
};

module.exports = AppService;
