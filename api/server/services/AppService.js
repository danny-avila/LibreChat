const {
  isEnabled,
  loadMemoryConfig,
  agentsConfigSetup,
  loadWebSearchConfig,
  loadDefaultInterface,
} = require('@librechat/api');
const {
  FileSources,
  loadOCRConfig,
  EModelEndpoint,
  getConfigDefaults,
} = require('librechat-data-provider');
const {
  checkWebSearchConfig,
  checkVariables,
  checkHealth,
  checkConfig,
} = require('./start/checks');
const { initializeAzureBlobService } = require('./Files/Azure/initialize');
const { initializeFirebase } = require('./Files/Firebase/initialize');
const handleRateLimits = require('./Config/handleRateLimits');
const loadCustomConfig = require('./Config/loadCustomConfig');
const { loadTurnstileConfig } = require('./start/turnstile');
const { processModelSpecs } = require('./start/modelSpecs');
const { initializeS3 } = require('./Files/S3/initialize');
const { loadAndFormatTools } = require('./start/tools');
const { loadEndpoints } = require('./start/endpoints');
const paths = require('~/config/paths');

/**
 * Loads custom config and initializes app-wide variables.
 * @function AppService
 */
const AppService = async () => {
  /** @type {TCustomConfig} */
  const config = (await loadCustomConfig()) ?? {};
  const configDefaults = getConfigDefaults();

  const ocr = loadOCRConfig(config.ocr);
  const webSearch = loadWebSearchConfig(config.webSearch);
  checkWebSearchConfig(webSearch);
  const memory = loadMemoryConfig(config.memory);
  const filteredTools = config.filteredTools;
  const includedTools = config.includedTools;
  const fileStrategy = config.fileStrategy ?? configDefaults.fileStrategy;
  const startBalance = process.env.START_BALANCE;
  const balance = config.balance ?? {
    enabled: isEnabled(process.env.CHECK_BALANCE),
    startBalance: startBalance ? parseInt(startBalance, 10) : undefined,
  };
  const transactions = config.transactions ?? configDefaults.transactions;
  const imageOutputType = config?.imageOutputType ?? configDefaults.imageOutputType;

  process.env.CDN_PROVIDER = fileStrategy;

  checkVariables();
  await checkHealth();

  if (fileStrategy === FileSources.firebase) {
    initializeFirebase();
  } else if (fileStrategy === FileSources.azure_blob) {
    initializeAzureBlobService();
  } else if (fileStrategy === FileSources.s3) {
    initializeS3();
  }

  /** @type {Record<string, FunctionTool>} */
  const availableTools = loadAndFormatTools({
    adminFilter: filteredTools,
    adminIncluded: includedTools,
    directory: paths.structuredTools,
  });

  const mcpConfig = config.mcpServers || null;
  const registration = config.registration ?? configDefaults.registration;
  const interfaceConfig = await loadDefaultInterface({ config, configDefaults });
  const turnstileConfig = loadTurnstileConfig(config, configDefaults);
  const speech = config.speech;

  const defaultConfig = {
    ocr,
    paths,
    config,
    memory,
    speech,
    balance,
    transactions,
    mcpConfig,
    webSearch,
    fileStrategy,
    registration,
    filteredTools,
    includedTools,
    availableTools,
    imageOutputType,
    interfaceConfig,
    turnstileConfig,
    fileStrategies: config.fileStrategies,
  };

  const agentsDefaults = agentsConfigSetup(config);

  if (!Object.keys(config).length) {
    const appConfig = {
      ...defaultConfig,
      endpoints: {
        [EModelEndpoint.agents]: agentsDefaults,
      },
    };
    return appConfig;
  }

  checkConfig(config);
  handleRateLimits(config?.rateLimits);
  const loadedEndpoints = loadEndpoints(config, agentsDefaults);

  const appConfig = {
    ...defaultConfig,
    fileConfig: config?.fileConfig,
    secureImageLinks: config?.secureImageLinks,
    modelSpecs: processModelSpecs(config?.endpoints, config.modelSpecs, interfaceConfig),
    endpoints: loadedEndpoints,
  };

  return appConfig;
};

module.exports = AppService;
