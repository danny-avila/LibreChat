const {
  FileSources,
  EModelEndpoint,
  EImageOutputType,
  defaultSocialLogins,
} = require('librechat-data-provider');
const { checkVariables, checkHealth, checkConfig, checkAzureVariables } = require('./start/checks');
const { azureAssistantsDefaults, assistantsConfigSetup } = require('./start/assistants');
const { initializeFirebase } = require('./Files/Firebase/initialize');
const loadCustomConfig = require('./Config/loadCustomConfig');
const handleRateLimits = require('./Config/handleRateLimits');
const { azureConfigSetup } = require('./start/azureOpenAI');
const { loadAndFormatTools } = require('./ToolService');
const paths = require('~/config/paths');

/**
 *
 * Loads custom config and initializes app-wide variables.
 * @function AppService
 * @param {Express.Application} app - The Express application object.
 */
const AppService = async (app) => {
  /** @type {TCustomConfig}*/
  const config = (await loadCustomConfig()) ?? {};

  const fileStrategy = config.fileStrategy ?? FileSources.local;
  const imageOutputType = config?.imageOutputType ?? EImageOutputType.PNG;
  process.env.CDN_PROVIDER = fileStrategy;

  checkVariables();
  await checkHealth();

  if (fileStrategy === FileSources.firebase) {
    initializeFirebase();
  }

  /** @type {Record<string, FunctionTool} */
  const availableTools = loadAndFormatTools({
    directory: paths.structuredTools,
    filter: new Set([
      'ChatTool.js',
      'CodeSherpa.js',
      'CodeSherpaTools.js',
      'E2BTools.js',
      'extractionChain.js',
    ]),
  });

  const socialLogins = config?.registration?.socialLogins ?? defaultSocialLogins;

  if (!Object.keys(config).length) {
    app.locals = {
      paths,
      fileStrategy,
      socialLogins,
      availableTools,
      imageOutputType,
    };

    return;
  }

  checkConfig(config);
  handleRateLimits(config?.rateLimits);

  const endpointLocals = {};

  if (config?.endpoints?.[EModelEndpoint.azureOpenAI]) {
    endpointLocals[EModelEndpoint.azureOpenAI] = azureConfigSetup(config);
    checkAzureVariables();
  }

  if (config?.endpoints?.[EModelEndpoint.azureOpenAI]?.assistants) {
    endpointLocals[EModelEndpoint.assistants] = azureAssistantsDefaults();
  }

  if (config?.endpoints?.[EModelEndpoint.assistants]) {
    endpointLocals[EModelEndpoint.assistants] = assistantsConfigSetup(
      config,
      endpointLocals[EModelEndpoint.assistants],
    );
  }

  app.locals = {
    paths,
    socialLogins,
    fileStrategy,
    availableTools,
    imageOutputType,
    interface: config?.interface,
    fileConfig: config?.fileConfig,
    secureImageLinks: config?.secureImageLinks,
    ...endpointLocals,
  };
};

module.exports = AppService;
