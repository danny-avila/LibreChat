const {
  isEnabled,
  loadMemoryConfig,
  agentsConfigSetup,
  loadWebSearchConfig,
} = require('@librechat/api');
const {
  FileSources,
  loadOCRConfig,
  EModelEndpoint,
  getConfigDefaults,
} = require('librechat-data-provider');
const {
  checkWebSearchConfig,
  checkAzureVariables,
  checkVariables,
  checkHealth,
  checkConfig,
} = require('./start/checks');
const { ensureDefaultCategories, seedDefaultRoles, initializeRoles } = require('~/models');
const { azureAssistantsDefaults, assistantsConfigSetup } = require('./start/assistants');
const { setCachedTools, setAppConfig, loadCustomConfig } = require('./Config');
const { initializeAzureBlobService } = require('./Files/Azure/initialize');
const { initializeFirebase } = require('./Files/Firebase/initialize');
const handleRateLimits = require('./Config/handleRateLimits');
const { loadDefaultInterface } = require('./start/interface');
const { loadTurnstileConfig } = require('./start/turnstile');
const { azureConfigSetup } = require('./start/azureOpenAI');
const { processModelSpecs } = require('./start/modelSpecs');
const { initializeS3 } = require('./Files/S3/initialize');
const { loadAndFormatTools } = require('./ToolService');
const paths = require('~/config/paths');

/**
 * Loads custom config and initializes app-wide variables.
 * @function AppService
 */
const AppService = async () => {
  await initializeRoles();
  await seedDefaultRoles();
  await ensureDefaultCategories();
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
    imageOutputType,
    fileStrategy,
  });

  await setCachedTools(availableTools, { isGlobal: true });

  // Store MCP config for later initialization
  const mcpConfig = config.mcpServers || null;

  const registration = config.registration ?? configDefaults.registration;
  const interfaceConfig = await loadDefaultInterface(config, configDefaults);
  const turnstileConfig = loadTurnstileConfig(config, configDefaults);

  const defaultConfig = {
    ocr,
    paths,
    config,
    memory,
    balance,
    mcpConfig,
    webSearch,
    fileStrategy,
    registration,
    filteredTools,
    includedTools,
    imageOutputType,
    interfaceConfig,
    turnstileConfig,
  };

  const agentsDefaults = agentsConfigSetup(config);

  if (!Object.keys(config).length) {
    const appConfig = {
      ...defaultConfig,
      [EModelEndpoint.agents]: agentsDefaults,
    };
    await setAppConfig(appConfig);
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

  endpointLocals[EModelEndpoint.agents] = agentsConfigSetup(config, agentsDefaults);

  const endpointKeys = [
    EModelEndpoint.openAI,
    EModelEndpoint.google,
    EModelEndpoint.bedrock,
    EModelEndpoint.anthropic,
    EModelEndpoint.gptPlugins,
  ];

  endpointKeys.forEach((key) => {
    if (endpoints?.[key]) {
      endpointLocals[key] = endpoints[key];
    }
  });

  if (endpoints?.all) {
    endpointLocals.all = endpoints.all;
  }

  const appConfig = {
    ...defaultConfig,
    fileConfig: config?.fileConfig,
    secureImageLinks: config?.secureImageLinks,
    modelSpecs: processModelSpecs(endpoints, config.modelSpecs, interfaceConfig),
    ...endpointLocals,
  };

  await setAppConfig(appConfig);
};

module.exports = AppService;
