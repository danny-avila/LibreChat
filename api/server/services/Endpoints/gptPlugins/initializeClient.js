const {
  EModelEndpoint,
  mapModelToAzureConfig,
  resolveHeaders,
} = require('librechat-data-provider');
const { getUserKey, checkUserKeyExpiry } = require('~/server/services/UserService');
const { isEnabled, isUserProvided } = require('~/server/utils');
const { getAzureCredentials } = require('~/utils');
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

  const credentials = {
    [EModelEndpoint.openAI]: OPENAI_API_KEY,
    [EModelEndpoint.azureOpenAI]: AZURE_API_KEY,
  };

  const baseURLOptions = {
    [EModelEndpoint.openAI]: OPENAI_REVERSE_PROXY,
    [EModelEndpoint.azureOpenAI]: AZURE_OPENAI_BASEURL,
  };

  const userProvidesKey = isUserProvided(credentials[endpoint]);
  const userProvidesURL = isUserProvided(baseURLOptions[endpoint]);

  let userValues = null;
  if (expiresAt && (userProvidesKey || userProvidesURL)) {
    checkUserKeyExpiry(
      expiresAt,
      'Your OpenAI API values have expired. Please provide them again.',
    );
    userValues = await getUserKey({ userId: req.user.id, name: endpoint });
    try {
      userValues = JSON.parse(userValues);
    } catch (e) {
      throw new Error(
        `Invalid JSON provided for ${endpoint} user values. Please provide them again.`,
      );
    }
  }

  let apiKey = userProvidesKey ? userValues?.apiKey : credentials[endpoint];
  let baseURL = userProvidesURL ? userValues?.baseURL : baseURLOptions[endpoint];

  const clientOptions = {
    contextStrategy,
    debug: isEnabled(DEBUG_PLUGINS),
    reverseProxyUrl: baseURL ? baseURL : null,
    proxy: PROXY ?? null,
    req,
    res,
    ...endpointOption,
  };

  if (useAzure && azureConfig) {
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
  } else if (useAzure || (apiKey && apiKey.includes('{"azure') && !clientOptions.azure)) {
    clientOptions.azure = userProvidesKey ? JSON.parse(userValues.apiKey) : getAzureCredentials();
    apiKey = clientOptions.azure.azureOpenAIApiKey;
  }

  if (!apiKey) {
    throw new Error(`${endpoint} API key not provided. Please provide it again.`);
  }

  const client = new PluginsClient(apiKey, clientOptions);
  return {
    client,
    azure: clientOptions.azure,
    openAIApiKey: apiKey,
  };
};

module.exports = initializeClient;
