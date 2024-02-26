const {
  EModelEndpoint,
  mapModelToAzureConfig,
  resolveHeaders,
} = require('librechat-data-provider');
const { getUserKey, checkUserKeyExpiry } = require('~/server/services/UserService');
const { getAzureCredentials } = require('~/utils');
const { isEnabled } = require('~/server/utils');
const { OpenAIClient } = require('~/app');

const initializeClient = async ({ req, res, endpointOption }) => {
  const {
    PROXY,
    OPENAI_API_KEY,
    AZURE_API_KEY,
    OPENAI_REVERSE_PROXY,
    AZURE_OPENAI_BASEURL,
    OPENAI_SUMMARIZE,
    DEBUG_OPENAI,
  } = process.env;
  const { key: expiresAt, endpoint, model: modelName } = req.body;
  const contextStrategy = isEnabled(OPENAI_SUMMARIZE) ? 'summarize' : null;

  const baseURLOptions = {
    [EModelEndpoint.openAI]: OPENAI_REVERSE_PROXY,
    [EModelEndpoint.azureOpenAI]: AZURE_OPENAI_BASEURL,
  };

  const reverseProxyUrl = baseURLOptions[endpoint] ?? null;

  const clientOptions = {
    debug: isEnabled(DEBUG_OPENAI),
    contextStrategy,
    reverseProxyUrl,
    proxy: PROXY ?? null,
    req,
    res,
    ...endpointOption,
  };

  const credentials = {
    [EModelEndpoint.openAI]: OPENAI_API_KEY,
    [EModelEndpoint.azureOpenAI]: AZURE_API_KEY,
  };

  const isUserProvided = credentials[endpoint] === 'user_provided';

  let userKey = null;
  if (expiresAt && isUserProvided) {
    checkUserKeyExpiry(
      expiresAt,
      'Your OpenAI API key has expired. Please provide your API key again.',
    );
    userKey = await getUserKey({ userId: req.user.id, name: endpoint });
  }

  let apiKey = isUserProvided ? userKey : credentials[endpoint];
  const isAzureOpenAI = endpoint === EModelEndpoint.azureOpenAI;
  /** @type {false | TAzureConfig} */
  const azureConfig = isAzureOpenAI && req.app.locals[EModelEndpoint.azureOpenAI];

  if (isAzureOpenAI && azureConfig) {
    const { modelGroupMap, groupMap } = azureConfig;
    const {
      azureOptions,
      baseURL,
      headers = {},
      serverless,
    } = mapModelToAzureConfig({
      modelName,
      modelGroupMap,
      groupMap,
    });

    clientOptions.reverseProxyUrl = baseURL ?? clientOptions.reverseProxyUrl;
    clientOptions.headers = resolveHeaders({ ...headers, ...(clientOptions.headers ?? {}) });

    clientOptions.titleConvo = azureConfig.titleConvo;
    clientOptions.titleModel = azureConfig.titleModel;
    clientOptions.titleMethod = azureConfig.titleMethod ?? 'completion';

    const groupName = modelGroupMap[modelName].group;
    clientOptions.addParams = azureConfig.groupMap[groupName].addParams;
    clientOptions.dropParams = azureConfig.groupMap[groupName].dropParams;
    clientOptions.forcePrompt = azureConfig.groupMap[groupName].forcePrompt;

    apiKey = azureOptions.azureOpenAIApiKey;
    clientOptions.azure = !serverless && azureOptions;
  } else if (isAzureOpenAI) {
    clientOptions.azure = isUserProvided ? JSON.parse(userKey) : getAzureCredentials();
    apiKey = clientOptions.azure.azureOpenAIApiKey;
  }

  if (!apiKey) {
    throw new Error(`${endpoint} API key not provided.`);
  }

  const client = new OpenAIClient(apiKey, clientOptions);
  return {
    client,
    openAIApiKey: apiKey,
  };
};

module.exports = initializeClient;
