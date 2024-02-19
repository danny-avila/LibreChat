const {
  FileSources,
  EModelEndpoint,
  Constants,
  defaultSocialLogins,
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
  if (config?.endpoints?.[EModelEndpoint.assistants]) {
    const { disableBuilder, pollIntervalMs, timeoutMs, supportedIds, excludedIds } =
      config.endpoints[EModelEndpoint.assistants];

    if (supportedIds?.length && excludedIds?.length) {
      logger.warn(
        `Both \`supportedIds\` and \`excludedIds\` are defined for the ${EModelEndpoint.assistants} endpoint; \`excludedIds\` field will be ignored.`,
      );
    }

    /** @type {Partial<TAssistantEndpoint>} */
    endpointLocals[EModelEndpoint.assistants] = {
      disableBuilder,
      pollIntervalMs,
      timeoutMs,
      supportedIds,
      excludedIds,
    };
  }

  app.locals = {
    socialLogins,
    availableTools,
    fileStrategy,
    fileConfig: config?.fileConfig,
    paths,
    ...endpointLocals,
  };
};

module.exports = AppService;
