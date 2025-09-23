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
    // For agents, return config that will be used by ChatOpenRouter
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

    // Return the configuration that will be used as llmConfig in agent.js
    // ChatOpenRouter extends ChatOpenAI which expects:
    // - apiKey at root level
    // - configuration object with baseURL and defaultHeaders
    return {
      llmConfig: {
        apiKey: openRouterApiKey,
        configuration: {
          baseURL,
          defaultHeaders: {
            'HTTP-Referer':
              process.env.OPENROUTER_SITE_URL ||
              process.env.DOMAIN_CLIENT ||
              'http://localhost:3080',
            'X-Title': process.env.OPENROUTER_SITE_NAME || 'LibreChat',
          },
        },
        ...clientOptions.modelOptions,
        model: effectiveModel, // Use the transformed model
        autoRouter: autoRouterFlag, // Pass the flag for reference
      },
      ...clientOptions,
      modelOptions: {
        ...clientOptions.modelOptions,
        model: effectiveModel,
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

  logger.info('[OpenRouter Initialize] Creating client with autoRouter:', autoRouterFlag);

  const openRouterClient = new OpenRouterClient(openRouterApiKey, {
    ...clientOptions,
    autoRouter: autoRouterFlag,
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
