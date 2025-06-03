const { EModelEndpoint } = require('librechat-data-provider');
const { useAzurePlugins } = require('~/server/services/Config/EndpointService').config;
const {
  getOpenAIModels,
  getGoogleModels,
  getBedrockModels,
  getAnthropicModels,
} = require('~/server/services/ModelService');
const { logger } = require('~/config');

/**
 * Loads the default models for the application.
 * @async
 * @function
 * @param {Express.Request} req - The Express request object.
 */
async function loadDefaultModels(req) {
  try {
    const [
      openAI,
      anthropic,
      azureOpenAI,
      gptPlugins,
      assistants,
      azureAssistants,
      google,
      bedrock,
    ] = await Promise.all([
      getOpenAIModels({ user: req.user.id }).catch((error) => {
        logger.error('Error fetching OpenAI models:', error);
        return [];
      }),
      getAnthropicModels({ user: req.user.id }).catch((error) => {
        logger.error('Error fetching Anthropic models:', error);
        return [];
      }),
      getOpenAIModels({ user: req.user.id, azure: true }).catch((error) => {
        logger.error('Error fetching Azure OpenAI models:', error);
        return [];
      }),
      getOpenAIModels({ user: req.user.id, azure: useAzurePlugins, plugins: true }).catch(
        (error) => {
          logger.error('Error fetching Plugin models:', error);
          return [];
        },
      ),
      getOpenAIModels({ assistants: true }).catch((error) => {
        logger.error('Error fetching OpenAI Assistants API models:', error);
        return [];
      }),
      getOpenAIModels({ azureAssistants: true }).catch((error) => {
        logger.error('Error fetching Azure OpenAI Assistants API models:', error);
        return [];
      }),
      Promise.resolve(getGoogleModels()).catch((error) => {
        logger.error('Error getting Google models:', error);
        return [];
      }),
      Promise.resolve(getBedrockModels()).catch((error) => {
        logger.error('Error getting Bedrock models:', error);
        return [];
      }),
    ]);

    return {
      [EModelEndpoint.openAI]: openAI,
      [EModelEndpoint.agents]: openAI,
      [EModelEndpoint.google]: google,
      [EModelEndpoint.anthropic]: anthropic,
      [EModelEndpoint.gptPlugins]: gptPlugins,
      [EModelEndpoint.azureOpenAI]: azureOpenAI,
      [EModelEndpoint.assistants]: assistants,
      [EModelEndpoint.azureAssistants]: azureAssistants,
      [EModelEndpoint.bedrock]: bedrock,
    };
  } catch (error) {
    logger.error('Error fetching default models:', error);
    throw new Error(`Failed to load default models: ${error.message}`);
  }
}

module.exports = loadDefaultModels;
