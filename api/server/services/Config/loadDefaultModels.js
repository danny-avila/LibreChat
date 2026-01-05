const { logger } = require('@librechat/data-schemas');
const { EModelEndpoint } = require('librechat-data-provider');
const {
  getAnthropicModels,
  getBedrockModels,
  getOpenAIModels,
  getGoogleModels,
} = require('@librechat/api');
const { getEndpointsConfig } = require('./getEndpointsConfig');

/**
 * Loads the default models for the application.
 * @async
 * @function
 * @param {ServerRequest} req - The Express request object.
 */
async function loadDefaultModels(req) {
  try {
    const endpointsConfig = await getEndpointsConfig(req);
    const hasEndpoint = (endpoint) => Boolean(endpointsConfig?.[endpoint]);
    const userId = req.user?.id;

    const [openAI, anthropic, azureOpenAI, assistants, azureAssistants, google, bedrock] =
      await Promise.all([
        hasEndpoint(EModelEndpoint.openAI)
          ? getOpenAIModels({ user: userId }).catch((error) => {
              logger.error('Error fetching OpenAI models:', error);
              return [];
            })
          : Promise.resolve([]),
        hasEndpoint(EModelEndpoint.anthropic)
          ? getAnthropicModels({ user: userId }).catch((error) => {
              logger.error('Error fetching Anthropic models:', error);
              return [];
            })
          : Promise.resolve([]),
        hasEndpoint(EModelEndpoint.azureOpenAI)
          ? getOpenAIModels({ user: userId, azure: true }).catch((error) => {
              logger.error('Error fetching Azure OpenAI models:', error);
              return [];
            })
          : Promise.resolve([]),
        hasEndpoint(EModelEndpoint.assistants)
          ? getOpenAIModels({ assistants: true }).catch((error) => {
              logger.error('Error fetching OpenAI Assistants API models:', error);
              return [];
            })
          : Promise.resolve([]),
        hasEndpoint(EModelEndpoint.azureAssistants)
          ? getOpenAIModels({ azureAssistants: true }).catch((error) => {
              logger.error('Error fetching Azure OpenAI Assistants API models:', error);
              return [];
            })
          : Promise.resolve([]),
        hasEndpoint(EModelEndpoint.google)
          ? Promise.resolve(getGoogleModels()).catch((error) => {
              logger.error('Error getting Google models:', error);
              return [];
            })
          : Promise.resolve([]),
        hasEndpoint(EModelEndpoint.bedrock)
          ? Promise.resolve(getBedrockModels()).catch((error) => {
              logger.error('Error getting Bedrock models:', error);
              return [];
            })
          : Promise.resolve([]),
      ]);

    return {
      [EModelEndpoint.openAI]: openAI,
      [EModelEndpoint.google]: google,
      [EModelEndpoint.anthropic]: anthropic,
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
