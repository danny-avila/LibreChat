const { EModelEndpoint } = require('librechat-data-provider');
const { getUserKey, checkUserKeyExpiry } = require('~/server/services/UserService');
const OpenRouterClient = require('~/app/clients/OpenRouterClient');

const initializeClient = async ({ req, res, endpointOption, overrideModel, optionsOnly }) => {
  const { logger } = require('~/config');

  logger.info('[OpenRouter Initialize] Called with:', {
    endpointOption,
    overrideModel,
    optionsOnly,
    bodyModel: req?.body?.model,
    modelFromParams: endpointOption?.model_parameters?.model,
    fallbackModels: endpointOption?.model_parameters?.models,
    modelFromOption: endpointOption?.model,
    modelOptionsModel: endpointOption?.modelOptions?.model,
    autoRouterRoot: endpointOption?.autoRouter,
    autoRouterModelOptions: endpointOption?.modelOptions?.autoRouter,
    fullModelOptions: endpointOption?.modelOptions,
  });

  const { OPENROUTER_API_KEY, PROXY } = process.env;
  const expiresAt = req.body.key;
  const isUserProvided = OPENROUTER_API_KEY === 'user_provided';

  // Get API key from user or environment
  const openRouterApiKey = isUserProvided
    ? await getUserKey({ userId: req.user.id, name: EModelEndpoint.openrouter })
    : OPENROUTER_API_KEY;

  if (!openRouterApiKey) {
    throw new Error('OpenRouter API key not provided. Please provide it again.');
  }

  if (expiresAt && isUserProvided) {
    checkUserKeyExpiry(expiresAt, EModelEndpoint.openrouter);
  }

  // Get the model from the correct location - check modelOptions too
  const selectedModel =
    endpointOption?.modelOptions?.model ||
    endpointOption?.model_parameters?.model ||
    endpointOption?.model ||
    overrideModel ||
    req?.body?.model;

  logger.info('[OpenRouter Initialize] Selected model:', selectedModel);

  // Extract autoRouter flag early
  const autoRouterFlag =
    endpointOption?.autoRouter ||
    endpointOption?.modelOptions?.autoRouter ||
    endpointOption?.model_parameters?.autoRouter ||
    false;

  // Extract ZDR (Zero Data Retention) flag
  const zdrFlag =
    endpointOption?.zdr ||
    endpointOption?.modelOptions?.zdr ||
    endpointOption?.model_parameters?.zdr ||
    false;

  let clientOptions = {
    // CRITICAL: Include endpoint metadata for message identification
    endpoint: endpointOption?.endpoint ?? EModelEndpoint.openrouter,
    endpointType: endpointOption?.endpointType ?? EModelEndpoint.openrouter,
    // Site attribution for better rate limits
    siteUrl:
      process.env.OPENROUTER_SITE_URL || process.env.DOMAIN_CLIENT || 'http://localhost:3080',
    siteName: process.env.OPENROUTER_SITE_NAME || 'LibreChat',
    // Model configuration
    modelOptions: {
      model: selectedModel,
      models: endpointOption?.model_parameters?.models ?? endpointOption?.models,
      route: endpointOption?.model_parameters?.route,
      autoRouter: autoRouterFlag,
      ...endpointOption?.model_parameters,
    },
  };

  if (PROXY) {
    clientOptions.proxy = PROXY;
  }

  // Handle agent mode
  if (endpointOption?.agent) {
    clientOptions.agent = endpointOption.agent;
  }

  if (optionsOnly) {
    // For agents, return config that will be used by the agent system
    // IMPORTANT: The @librechat/agents package will create the LLM instance
    // To ensure our custom ChatOpenRouter is used, we rely on createLLM.js
    // which detects OpenRouter by baseURL and uses our ChatOpenRouter
    const baseURL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

    // Use the already extracted autoRouter flag
    logger.info('[OpenRouter Initialize] autoRouter detection:', {
      fromRoot: endpointOption?.autoRouter,
      fromModelOptions: endpointOption?.modelOptions?.autoRouter,
      fromModelParams: endpointOption?.model_parameters?.autoRouter,
      final: autoRouterFlag,
    });

    // If auto-router is enabled, transform the model to 'openrouter/auto'
    const effectiveModel = autoRouterFlag ? 'openrouter/auto' : selectedModel;

    logger.info(
      `[OpenRouter Initialize] Returning agent config with baseURL: ${baseURL}, autoRouter: ${autoRouterFlag}, model: ${effectiveModel}`,
    );

    // Return configuration for agent system
    // The key is to ensure the baseURL triggers our ChatOpenRouter in createLLM
    return {
      llmConfig: {
        apiKey: openRouterApiKey,
        configuration: {
          baseURL, // This will trigger our ChatOpenRouter in createLLM.js
          defaultHeaders: {
            'HTTP-Referer':
              process.env.OPENROUTER_SITE_URL ||
              process.env.DOMAIN_CLIENT ||
              'http://localhost:3080',
            'X-Title': process.env.OPENROUTER_SITE_NAME || 'LibreChat',
            // Add ZDR header directly here for agents (since they use external ChatOpenRouter)
            ...(zdrFlag && { 'X-OpenRouter-ZDR': 'true' }),
          },
        },
        // Pass these flags so ChatOpenRouter can use them
        autoRouter: autoRouterFlag,
        zdr: zdrFlag,
        ...clientOptions.modelOptions,
        model: effectiveModel,
      },
      ...clientOptions,
      modelOptions: {
        ...clientOptions.modelOptions,
        model: effectiveModel,
        autoRouter: autoRouterFlag,
        zdr: zdrFlag,
      },
    };
  }

  // Ensure endpointOption has the model in modelOptions
  if (endpointOption && selectedModel) {
    if (!endpointOption.modelOptions) {
      endpointOption.modelOptions = {};
    }
    endpointOption.modelOptions.model = selectedModel;
  }

  logger.info('[OpenRouter Initialize] Creating client with autoRouter:', autoRouterFlag, 'ZDR:', zdrFlag);

  const openRouterClient = new OpenRouterClient(openRouterApiKey, {
    ...clientOptions,
    autoRouter: autoRouterFlag,
    zdr: zdrFlag,
    req,
    res,
    endpointOption,
  });

  return {
    client: openRouterClient,
    openRouterApiKey,
  };
};

module.exports = initializeClient;
