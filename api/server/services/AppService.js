const {
  Constants,
  FileSources,
  Capabilities,
  EModelEndpoint,
  defaultSocialLogins,
  validateAzureGroups,
  mapModelToAzureConfig,
  assistantEndpointSchema,
  deprecatedAzureVariables,
  conflictingAzureVariables,
} = require('librechat-data-provider');
const { initializeFirebase } = require('./Files/Firebase/initialize');
const loadCustomConfig = require('./Config/loadCustomConfig');
const handleRateLimits = require('./Config/handleRateLimits');
const { loadAndFormatTools } = require('./ToolService');
const paths = require('~/config/paths');
const { logger } = require('~/config');

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
  process.env.CDN_PROVIDER = fileStrategy;

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
      availableTools,
      fileStrategy,
      socialLogins,
      paths,
    };

    return;
  }

  if (config.version !== Constants.CONFIG_VERSION) {
    logger.info(
      `\nOutdated Config version: ${config.version}. Current version: ${Constants.CONFIG_VERSION}\n\nCheck out the latest config file guide for new options and features.\nhttps://docs.librechat.ai/install/configuration/custom_config.html\n\n`,
    );
  }

  handleRateLimits(config?.rateLimits);

  const endpointLocals = {};

  if (config?.endpoints?.[EModelEndpoint.azureOpenAI]) {
    const { groups, ...azureConfiguration } = config.endpoints[EModelEndpoint.azureOpenAI];
    const { isValid, modelNames, modelGroupMap, groupMap, errors } = validateAzureGroups(groups);

    if (!isValid) {
      const errorString = errors.join('\n');
      const errorMessage = 'Invalid Azure OpenAI configuration:\n' + errorString;
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }

    const assistantModels = [];
    const assistantGroups = new Set();
    for (const modelName of modelNames) {
      mapModelToAzureConfig({ modelName, modelGroupMap, groupMap });
      const groupName = modelGroupMap?.[modelName]?.group;
      const modelGroup = groupMap?.[groupName];
      let supportsAssistants = modelGroup?.assistants || modelGroup?.[modelName]?.assistants;
      if (supportsAssistants) {
        assistantModels.push(modelName);
        !assistantGroups.has(groupName) && assistantGroups.add(groupName);
      }
    }

    if (azureConfiguration.assistants && assistantModels.length === 0) {
      throw new Error(
        'No Azure models are configured to support assistants. Please remove the `assistants` field or configure at least one model to support assistants.',
      );
    }

    endpointLocals[EModelEndpoint.azureOpenAI] = {
      modelNames,
      modelGroupMap,
      groupMap,
      assistantModels,
      assistantGroups: Array.from(assistantGroups),
      ...azureConfiguration,
    };

    deprecatedAzureVariables.forEach(({ key, description }) => {
      if (process.env[key]) {
        logger.warn(
          `The \`${key}\` environment variable (related to ${description}) should not be used in combination with the \`azureOpenAI\` endpoint configuration, as you will experience conflicts and errors.`,
        );
      }
    });

    conflictingAzureVariables.forEach(({ key }) => {
      if (process.env[key]) {
        logger.warn(
          `The \`${key}\` environment variable should not be used in combination with the \`azureOpenAI\` endpoint configuration, as you may experience with the defined placeholders for mapping to the current model grouping using the same name.`,
        );
      }
    });

    if (azureConfiguration.assistants) {
      endpointLocals[EModelEndpoint.assistants] = {
        // Note: may need to add retrieval models here in the future
        capabilities: [Capabilities.tools, Capabilities.actions, Capabilities.code_interpreter],
      };
    }
  }

  if (config?.endpoints?.[EModelEndpoint.assistants]) {
    const assistantsConfig = config.endpoints[EModelEndpoint.assistants];
    const parsedConfig = assistantEndpointSchema.parse(assistantsConfig);
    if (assistantsConfig.supportedIds?.length && assistantsConfig.excludedIds?.length) {
      logger.warn(
        `Both \`supportedIds\` and \`excludedIds\` are defined for the ${EModelEndpoint.assistants} endpoint; \`excludedIds\` field will be ignored.`,
      );
    }

    const prevConfig = endpointLocals[EModelEndpoint.assistants] ?? {};

    /** @type {Partial<TAssistantEndpoint>} */
    endpointLocals[EModelEndpoint.assistants] = {
      ...prevConfig,
      retrievalModels: parsedConfig.retrievalModels,
      disableBuilder: parsedConfig.disableBuilder,
      pollIntervalMs: parsedConfig.pollIntervalMs,
      supportedIds: parsedConfig.supportedIds,
      capabilities: parsedConfig.capabilities,
      excludedIds: parsedConfig.excludedIds,
      timeoutMs: parsedConfig.timeoutMs,
    };
  }

  app.locals = {
    socialLogins,
    availableTools,
    fileStrategy,
    fileConfig: config?.fileConfig,
    interface: config?.interface,
    paths,
    ...endpointLocals,
  };
};

module.exports = AppService;
