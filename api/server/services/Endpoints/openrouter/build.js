const { removeNullishValues } = require('librechat-data-provider');
const { logger } = require('~/config');

/**
 * Build options for OpenRouter endpoint
 * @param {string} endpoint - The endpoint name
 * @param {Object} parsedBody - The parsed request body
 * @returns {Object} The built endpoint options
 */
const buildOptions = (endpoint, parsedBody) => {
  // CRITICAL DEBUG: Log the entire parsedBody to see what's coming from frontend
  logger.info('[OpenRouter buildOptions] FULL parsedBody:', JSON.stringify(parsedBody, null, 2));

  const {
    modelLabel,
    promptPrefix,
    maxContextTokens,
    fileTokenLimit,
    resendFiles = true,
    iconURL,
    greeting,
    spec,
    // OpenRouter specific options
    models, // Fallback chain
    route,
    providerPreferences,
    maxCreditsPerRequest,
    includeReasoning,
    autoRouterEnabled,
    ...modelOptions
  } = parsedBody;

  // Log the incoming model selection for debugging
  logger.info('[OpenRouter buildOptions] Extracted values:', {
    endpoint,
    directModel: parsedBody.model,
    modelFromOptions: modelOptions?.model,
    modelFromParams: parsedBody.model_parameters?.model,
    models,
    autoRouterEnabled,
  });

  const endpointOption = removeNullishValues({
    endpoint,
    modelLabel,
    promptPrefix,
    resendFiles,
    iconURL,
    greeting,
    spec,
    maxContextTokens,
    fileTokenLimit,
    modelOptions: {
      ...modelOptions,
      // Ensure the model is set in modelOptions
      model: modelOptions.model || parsedBody.model,
      // OpenRouter specific: include fallback models if provided
      models,
      route,
      providerPreferences,
      maxCreditsPerRequest,
      includeReasoning,
    },
  });

  // Ensure model_parameters has the model field for compatibility
  if (!endpointOption.model_parameters) {
    endpointOption.model_parameters = {};
  }

  // Set the model in model_parameters if not already present
  if (!endpointOption.model_parameters.model) {
    const selectedModel = parsedBody.model || modelOptions?.model;
    if (selectedModel) {
      endpointOption.model_parameters.model = selectedModel;
      logger.info('[OpenRouter buildOptions] Model set in model_parameters:', selectedModel);
    } else {
      logger.warn('[OpenRouter buildOptions] No model specified in request');
    }
  }

  // Handle OpenRouter-specific fallback models
  if (models && Array.isArray(models) && models.length > 0) {
    endpointOption.model_parameters.models = models;
    logger.info('[OpenRouter buildOptions] Fallback models configured:', models);
  }

  // Do NOT default to auto-router - require explicit model selection
  if (!endpointOption.model_parameters.model && !endpointOption.modelOptions?.model) {
    logger.error('[OpenRouter buildOptions] No model specified - will require user selection');
  }

  logger.info('[OpenRouter buildOptions] Final options:', {
    model: endpointOption.model_parameters?.model,
    modelFromOptions: endpointOption.modelOptions?.model,
    fallbackModels: endpointOption.model_parameters?.models,
    endpoint: endpointOption.endpoint,
  });

  return endpointOption;
};

module.exports = { buildOptions };
