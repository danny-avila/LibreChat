const { ChatOpenAI } = require('langchain/chat_models/openai');
const { sanitizeModelName, constructAzureURL } = require('~/utils');
const { isEnabled } = require('~/server/utils');

/**
 * Creates a new instance of a language model (LLM) for chat interactions.
 *
 * @param {Object} options - The options for creating the LLM.
 * @param {ModelOptions} options.modelOptions - The options specific to the model, including modelName, temperature, presence_penalty, frequency_penalty, and other model-related settings.
 * @param {ConfigOptions} options.configOptions - Configuration options for the API requests, including proxy settings and custom headers.
 * @param {Callbacks} [options.callbacks] - Callback functions for managing the lifecycle of the LLM, including token buffers, context, and initial message count.
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

  /**  @type {AzureOptions} */
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

  if (azure && configOptions.basePath) {
    const azureURL = constructAzureURL({
      baseURL: configOptions.basePath,
      azureOptions,
    });
    azureOptions.azureOpenAIBasePath = azureURL.split(
      `/${azureOptions.azureOpenAIApiDeploymentName}`,
    )[0];
  }

  return new ChatOpenAI(
    {
      streaming,
      credentials,
      configuration,
      ...azureOptions,
      ...modelOptions,
      ...credentials,
      callbacks,
    },
    configOptions,
  );
}

module.exports = createLLM;
