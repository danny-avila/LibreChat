const {
  EModelEndpoint,
  mapModelToAzureConfig,
  resolveHeaders,
} = require('librechat-data-provider');
const { getUserKey, checkUserKeyExpiry } = require('~/server/services/UserService');
const { getAzureCredentials } = require('~/utils');
const { isEnabled } = require('~/server/utils');
const { PluginsClient } = require('~/app');

const initializeClient = async ({ req, res, endpointOption }) => {
  const {
    PROXY,
    OPENAI_API_KEY,
    AZURE_API_KEY,
    PLUGINS_USE_AZURE,
    OPENAI_REVERSE_PROXY,
    AZURE_OPENAI_BASEURL,
    OPENAI_SUMMARIZE,
    DEBUG_PLUGINS,
  } = process.env;

  const { key: expiresAt, model: modelName } = req.body;
  const contextStrategy = isEnabled(OPENAI_SUMMARIZE) ? 'summarize' : null;

  let useAzure = isEnabled(PLUGINS_USE_AZURE);
  let endpoint = useAzure ? EModelEndpoint.azureOpenAI : EModelEndpoint.openAI;

  /** @type {false | TAzureConfig} */
  const azureConfig = req.app.locals[EModelEndpoint.azureOpenAI];
  useAzure = useAzure || azureConfig?.plugins;

  if (useAzure && endpoint !== EModelEndpoint.azureOpenAI) {
    endpoint = EModelEndpoint.azureOpenAI;
  }

  const baseURLOptions = {
    [EModelEndpoint.openAI]: OPENAI_REVERSE_PROXY,
    [EModelEndpoint.azureOpenAI]: AZURE_OPENAI_BASEURL,
  };

  const reverseProxyUrl = baseURLOptions[endpoint] ?? null;

  const clientOptions = {
    contextStrategy,
    debug: isEnabled(DEBUG_PLUGINS),
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
    userKey = await getUserKey({
      userId: req.user.id,
      name: endpoint,
    });
  }

  let apiKey = isUserProvided ? userKey : credentials[endpoint];
  if (useAzure && azureConfig) {
    const { modelGroupMap, groupMap } = azureConfig;
    const {
      azureOptions,
      baseURL,
      headers = {},
    } = mapModelToAzureConfig({
      modelName,
      modelGroupMap,
      groupMap,
    });
    clientOptions.azure = azureOptions;
    clientOptions.titleConvo = azureConfig.titleConvo;
    clientOptions.titleModel = azureConfig.titleModel;
    clientOptions.titleMethod = azureConfig.titleMethod ?? 'completion';
    clientOptions.reverseProxyUrl = baseURL ?? clientOptions.reverseProxyUrl;
    clientOptions.headers = resolveHeaders({ ...headers, ...(clientOptions.headers ?? {}) });

    apiKey = clientOptions.azure.azureOpenAIApiKey;
  } else if (useAzure || (apiKey && apiKey.includes('{"azure') && !clientOptions.azure)) {
    clientOptions.azure = isUserProvided ? JSON.parse(userKey) : getAzureCredentials();
    apiKey = clientOptions.azure.azureOpenAIApiKey;
  }

  if (!apiKey) {
    throw new Error(`${endpoint} API key not provided.`);
  }

  const client = new PluginsClient(apiKey, clientOptions);
  return {
    client,
    azure: clientOptions.azure,
    openAIApiKey: apiKey,
  };
};

module.exports = initializeClient;
