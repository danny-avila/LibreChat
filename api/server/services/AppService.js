const {
  FileSources,
  loadOCRConfig,
  EModelEndpoint,
  loadMemoryConfig,
  getConfigDefaults,
  loadWebSearchConfig,
} = require('librechat-data-provider');
const { agentsConfigSetup } = require('@librechat/api');
const {
  checkHealth,
  checkConfig,
  checkVariables,
  checkAzureVariables,
  checkWebSearchConfig,
} = require('./start/checks');
const { azureAssistantsDefaults, assistantsConfigSetup } = require('./start/assistants');
const { initializeAzureBlobService } = require('./Files/Azure/initialize');
const { initializeFirebase } = require('./Files/Firebase/initialize');
const loadCustomConfig = require('./Config/loadCustomConfig');
const handleRateLimits = require('./Config/handleRateLimits');
const { loadDefaultInterface } = require('./start/interface');
const { loadTurnstileConfig } = require('./start/turnstile');
const { azureConfigSetup } = require('./start/azureOpenAI');
const { processModelSpecs } = require('./start/modelSpecs');
const { initializeS3 } = require('./Files/S3/initialize');
const { loadAndFormatTools } = require('./ToolService');
const { isEnabled } = require('~/server/utils');
const { initializeRoles } = require('~/models');
const { setCachedTools } = require('./Config');
const { logger } = require('~/config');
const cleanupScheduler = require('./CleanupSchedulerService');
const indexManagementService = require('./Files/IndexManagementService');
const configValidationService = require('./Files/ConfigValidationService');
const paths = require('~/config/paths');

/**
 * Loads custom config and initializes app-wide variables.
 * @function AppService
 * @param {Express.Application} app - The Express application object.
 */
const AppService = async (app) => {
  await initializeRoles();
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
  });

  await setCachedTools(availableTools, { isGlobal: true });

  // Store MCP config for later initialization
  const mcpConfig = config.mcpServers || null;

  const socialLogins =
    config?.registration?.socialLogins ?? configDefaults?.registration?.socialLogins;
  const interfaceConfig = await loadDefaultInterface(config, configDefaults);
  const turnstileConfig = loadTurnstileConfig(config, configDefaults);

  const defaultLocals = {
    ocr,
    paths,
    memory,
    webSearch,
    fileStrategy,
    socialLogins,
    filteredTools,
    includedTools,
    imageOutputType,
    interfaceConfig,
    turnstileConfig,
    balance,
    mcpConfig,
  };

  const agentsDefaults = agentsConfigSetup(config);

  if (!Object.keys(config).length) {
    app.locals = {
      ...defaultLocals,
      [EModelEndpoint.agents]: agentsDefaults,
    };
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

  app.locals = {
    ...defaultLocals,
    fileConfig: config?.fileConfig,
    secureImageLinks: config?.secureImageLinks,
    modelSpecs: processModelSpecs(endpoints, config.modelSpecs, interfaceConfig),
    ...endpointLocals,
  };

  // Initialize audit service to ensure models are created
  try {
    const auditService = require('./Files/AuditService');
    // This will initialize the audit collection and models
    logger.debug('[AppService] Audit service initialized');
  } catch (error) {
    logger.error('[AppService] Failed to initialize audit service:', error);
  }

  // Ensure MongoDB indexes for temporary downloads
  try {
    await indexManagementService.ensureAllIndexes();
    logger.info('[AppService] MongoDB indexes ensured successfully');
  } catch (error) {
    logger.error('[AppService] Failed to ensure MongoDB indexes:', error);
    // Don't fail startup for index errors, but log them
  }

  // Validate temporary download configuration (after other services are initialized)
  try {
    const configValidation = configValidationService.validateConfiguration();
    if (!configValidation.valid) {
      logger.warn('[AppService] Temporary download configuration has issues - some features may not work correctly');
    }
  } catch (error) {
    logger.error('[AppService] Failed to validate temporary download configuration:', error);
  }

  // Start cleanup scheduler service
  if (process.env.TEMP_DOWNLOAD_AUTO_CLEANUP !== 'false') {
    try {
      cleanupScheduler.start();
      logger.info('[AppService] Cleanup scheduler started successfully');
    } catch (error) {
      logger.error('[AppService] Failed to start cleanup scheduler:', error);
    }
  } else {
    logger.info('[AppService] Cleanup scheduler disabled by configuration');
  }
};

module.exports = AppService;
