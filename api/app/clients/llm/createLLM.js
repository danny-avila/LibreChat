const { ChatOpenAI } = require('langchain/chat_models/openai');
const { sanitizeModelName } = require('../../../utils');
const { isEnabled } = require('../../../server/utils');

/**
 * @typedef {Object} ModelOptions
 * @property {string} modelName - The name of the model.
 * @property {number} [temperature] - The temperature setting for the model.
 * @property {number} [presence_penalty] - The presence penalty setting.
 * @property {number} [frequency_penalty] - The frequency penalty setting.
 * @property {number} [max_tokens] - The maximum number of tokens to generate.
 */

/**
 * @typedef {Object} ConfigOptions
 * @property {string} [basePath] - The base path for the API requests.
 * @property {Object} [baseOptions] - Base options for the API requests, including headers.
 * @property {Object} [httpAgent] - The HTTP agent for the request.
 * @property {Object} [httpsAgent] - The HTTPS agent for the request.
 */

/**
 * @typedef {Object} Callbacks
 * @property {Function} [handleChatModelStart] - A callback function for handleChatModelStart
 * @property {Function} [handleLLMEnd] - A callback function for handleLLMEnd
 * @property {Function} [handleLLMError] - A callback function for handleLLMError
 */

/**
 * @typedef {Object} AzureOptions
 * @property {string} [azureOpenAIApiKey] - The Azure OpenAI API key.
 * @property {string} [azureOpenAIApiInstanceName] - The Azure OpenAI API instance name.
 * @property {string} [azureOpenAIApiDeploymentName] - The Azure OpenAI API deployment name.
 * @property {string} [azureOpenAIApiVersion] - The Azure OpenAI API version.
 */

/**
 * Creates a new instance of a language model (LLM) for chat interactions.
 *
 * @param {Object} options - The options for creating the LLM.
 * @param {ModelOptions} options.modelOptions - The options specific to the model, including modelName, temperature, presence_penalty, frequency_penalty, and other model-related settings.
 * @param {ConfigOptions} options.configOptions - Configuration options for the API requests, including proxy settings and custom headers.
 * @param {Callbacks} options.callbacks - Callback functions for managing the lifecycle of the LLM, including token buffers, context, and initial message count.
 * @param {boolean} [options.streaming=false] - Determines if the LLM should operate in streaming mode.
 * @param {string} options.openAIApiKey - The API key for OpenAI, used for authentication.
 * @param {AzureOptions} [options.azure={}] - Optional Azure-specific configurations. If provided, Azure configurations take precedence over OpenAI configurations.
 *
 * @returns {ChatOpenAI} An instance of the ChatOpenAI class, configured with the provided options.
 *
 * @example
 * const llm = createLLM({
 *   modelOptions: { modelName: 'gpt-3.5-turbo', temperature: 0.2 },
 *   configOptions: { basePath: 'https://example.api/path' },
 *   callbacks: { onMessage: handleMessage },
 *   openAIApiKey: 'your-api-key'
 * });
 */
function createLLM({
  modelOptions,
  configOptions,
  callbacks,
  streaming = false,
  openAIApiKey,
  azure = {},
}) {
  let credentials = { openAIApiKey };
  let configuration = {
    apiKey: openAIApiKey,
  };

  let azureOptions = {};
  if (azure) {
    const useModelName = isEnabled(process.env.AZURE_USE_MODEL_AS_DEPLOYMENT_NAME);

    credentials = {};
    configuration = {};
    azureOptions = azure;

    azureOptions.azureOpenAIApiDeploymentName = useModelName
      ? sanitizeModelName(modelOptions.modelName)
      : azureOptions.azureOpenAIApiDeploymentName;
  }

  if (azure && process.env.AZURE_OPENAI_DEFAULT_MODEL) {
    modelOptions.modelName = process.env.AZURE_OPENAI_DEFAULT_MODEL;
  }

  // console.debug('createLLM: configOptions');
  // console.debug(configOptions);

  return new ChatOpenAI(
    {
      streaming,
      verbose: true,
      credentials,
      configuration,
      ...azureOptions,
      ...modelOptions,
      callbacks,
    },
    configOptions,
  );
}

module.exports = createLLM;
