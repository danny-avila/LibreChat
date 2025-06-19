const {
  ErrorTypes,
  EModelEndpoint,
  resolveHeaders,
  mapModelToAzureConfig,
} = require('librechat-data-provider');
const {
  isEnabled,
  isUserProvided,
  getOpenAIConfig,
  getAzureCredentials,
  createHandleLLMNewToken,
} = require('@librechat/api');
const { getUserKeyValues, checkUserKeyExpiry } = require('~/server/services/UserService');
const OpenAIClient = require('~/app/clients/OpenAIClient');
const { Provider, ApiKey } = require('~/db/models'); // Import new models

const initializeClient = async ({
  req,
  res,
  endpointOption,
  optionsOnly,
  overrideEndpoint,
  overrideModel,
}) => {
  const {
    PROXY,
    // OPENAI_API_KEY, // Removed, will be fetched from DB or user input
    // AZURE_API_KEY, // Removed, will be fetched from DB or user input
    // OPENAI_REVERSE_PROXY, // Removed, will be fetched from DB or user input
    // AZURE_OPENAI_BASEURL, // Removed, will be fetched from DB or user input
    OPENAI_SUMMARIZE,
    DEBUG_OPENAI,
  } = process.env;
  const { key: expiresAt } = req.body;
  const modelName = overrideModel ?? req.body.model;
  const endpoint = overrideEndpoint ?? req.body.endpoint; // This is the initial requested endpoint, could be a provider name
  const contextStrategy = isEnabled(OPENAI_SUMMARIZE) ? 'summarize' : null;

  // Credentials and baseURLs will now be primarily fetched from the DB
  // Fallback to process.env for endpoints not managed as Providers (transitional)
  const credentials = {
    [EModelEndpoint.openAI]: process.env.OPENAI_API_KEY,
    [EModelEndpoint.azureOpenAI]: process.env.AZURE_API_KEY,
  };

  const baseURLOptions = {
    [EModelEndpoint.openAI]: process.env.OPENAI_REVERSE_PROXY,
    [EModelEndpoint.azureOpenAI]: process.env.AZURE_OPENAI_BASEURL,
  };

  let apiKey = '';
  let baseURL = '';
  let resolvedEndpoint = endpoint; // Will store the actual provider name if resolved from DB

  // Try to fetch provider details from the database based on the requested endpoint name
  const dbProvider = await Provider.findOne({ name: endpoint });

  if (dbProvider) {
    resolvedEndpoint = dbProvider.name; // Use the matched provider's name
    baseURL = dbProvider.baseURL || ''; // Use provider's baseURL
    const dbApiKey = await ApiKey.findOne({ providerId: dbProvider._id }); // Find an API key for this provider
    if (dbApiKey && dbApiKey.value) {
      apiKey = dbApiKey.value; // Use the API key from the database
    }
    // If dbProvider is found, we assume its config is authoritative for now.
    // User-specific keys for this provider could be added here if needed.
  }

  // Determine if user is expected to provide key/URL, only if not already found via Provider
  const userProvidesKey = !apiKey && isUserProvided(credentials[resolvedEndpoint] ?? credentials[endpoint]); // Check against resolved or original endpoint
  const userProvidesURL = !baseURL && isUserProvided(baseURLOptions[resolvedEndpoint] ?? baseURLOptions[endpoint]);

  let userValues = null;
  if (expiresAt && (userProvidesKey || userProvidesURL)) {
    checkUserKeyExpiry(expiresAt, resolvedEndpoint); // Use resolvedEndpoint for user key check
    userValues = await getUserKeyValues({ userId: req.user.id, name: resolvedEndpoint });
    if (userProvidesKey && userValues?.apiKey) {
      apiKey = userValues.apiKey;
    }
    if (userProvidesURL && userValues?.baseURL) {
      baseURL = userValues.baseURL;
    }
  }

  // Final fallback to .env credentials if no key/URL from DB or user-specific values
  if (!apiKey && (credentials[resolvedEndpoint] ?? credentials[endpoint])) {
    apiKey = credentials[resolvedEndpoint] ?? credentials[endpoint];
  }
  if (!baseURL && (baseURLOptions[resolvedEndpoint] ?? baseURLOptions[endpoint])) {
    baseURL = baseURLOptions[resolvedEndpoint] ?? baseURLOptions[endpoint];
  }

  let clientOptions = {
    contextStrategy,
    proxy: PROXY ?? null,
    debug: isEnabled(DEBUG_OPENAI),
    reverseProxyUrl: baseURL ? baseURL : null,
    ...endpointOption,
    // endpoint: resolvedEndpoint, // Pass the resolved provider name to client options if needed by client constructor
  };

  const isAzureOpenAI = resolvedEndpoint === EModelEndpoint.azureOpenAI || (dbProvider && dbProvider.name === EModelEndpoint.azureOpenAI);
  /** @type {false | TAzureConfig} */
  // Use EModelEndpoint.azureOpenAI for looking up Azure specific app.locals config
  const azureConfig = isAzureOpenAI && req.app.locals[EModelEndpoint.azureOpenAI];


  if (isAzureOpenAI && azureConfig) {
    const { modelGroupMap, groupMap } = azureConfig;
    const {
      azureOptions,
      baseURL: azureBaseURL, // Renamed to avoid conflict with outer baseURL
      headers = {},
      serverless,
    } = mapModelToAzureConfig({
      modelName,
      modelGroupMap,
      groupMap,
    });

    // Azure specific baseURL and apiKey can override the ones from Provider or .env
    clientOptions.reverseProxyUrl = azureBaseURL ?? clientOptions.reverseProxyUrl;
    clientOptions.headers = resolveHeaders({ ...headers, ...(clientOptions.headers ?? {}) });

    clientOptions.titleConvo = azureConfig.titleConvo;
    clientOptions.titleModel = azureConfig.titleModel;

    const azureRate = modelName.includes('gpt-4') ? 30 : 17;
    clientOptions.streamRate = azureConfig.streamRate ?? azureRate;

    clientOptions.titleMethod = azureConfig.titleMethod ?? 'completion';

    const groupName = modelGroupMap[modelName].group;
    clientOptions.addParams = azureConfig.groupMap[groupName].addParams;
    clientOptions.dropParams = azureConfig.groupMap[groupName].dropParams;
    clientOptions.forcePrompt = azureConfig.groupMap[groupName].forcePrompt;

    // apiKey for Azure is often part of azureOptions (e.g. subscription key)
    // This will override the apiKey if it was set by Provider DB or user key.
    if (azureOptions.azureOpenAIApiKey) {
      apiKey = azureOptions.azureOpenAIApiKey;
    }
    clientOptions.azure = !serverless && azureOptions;
    if (serverless === true) {
      clientOptions.defaultQuery = azureOptions.azureOpenAIApiVersion
        ? { 'api-version': azureOptions.azureOpenAIApiVersion }
        : undefined;
      // Ensure the final apiKey (potentially Azure specific) is used for headers
      clientOptions.headers['api-key'] = apiKey;
    }
  } else if (isAzureOpenAI) {
    // This block handles Azure if there's no azureConfig from req.app.locals
    // It implies configuration might be coming entirely from user-provided values or .env
    // The 'apiKey' and 'baseURL' (via clientOptions.reverseProxyUrl) should already be set
    // by the dynamic provider logic if an Azure provider was configured in the DB.
    // Or by user values / .env fallbacks.
    // We might need to ensure clientOptions.azure is set correctly.
    const currentAzureCreds = userProvidesKey && userValues?.apiKey ? JSON.parse(userValues.apiKey) : getAzureCredentials();
    clientOptions.azure = currentAzureCreds;
    if (currentAzureCreds.azureOpenAIApiKey) {
       apiKey = currentAzureCreds.azureOpenAIApiKey;
    }
  }

  /** @type {undefined | TBaseEndpoint} */
  // Use resolvedEndpoint for looking up general OpenAI configurations
  const generalOpenAIConfig = req.app.locals[resolvedEndpoint];

  if (!isAzureOpenAI && generalOpenAIConfig) {
    clientOptions.streamRate = generalOpenAIConfig.streamRate;
    clientOptions.titleModel = generalOpenAIConfig.titleModel;
  }

  /** @type {undefined | TBaseEndpoint} */
  const allConfig = req.app.locals.all;
  if (allConfig && !clientOptions.streamRate) { // Only apply if not already set by specific config
    clientOptions.streamRate = allConfig.streamRate;
  }

  // Check for API key after all resolution attempts (DB, User, .env, Azure specific)
  if (userProvidesKey && !apiKey && !dbProvider) { // If user was supposed to provide it, but it's missing and not from DB
    throw new Error(
      JSON.stringify({
        type: ErrorTypes.NO_USER_KEY,
        endpoint: resolvedEndpoint, // Use resolvedEndpoint in error
      }),
    );
  }

  if (!apiKey) {
    throw new Error(`${resolvedEndpoint} API Key not provided.`); // Use resolvedEndpoint
  }

  if (optionsOnly) {
    const modelOptions = endpointOption.model_parameters;
    modelOptions.model = modelName;
    clientOptions = Object.assign({ modelOptions }, clientOptions);
    clientOptions.modelOptions.user = req.user.id;
    const options = getOpenAIConfig(apiKey, clientOptions); // apiKey here is the final resolved key
    const streamRate = clientOptions.streamRate;
    if (!streamRate) {
      return options;
    }
    options.llmConfig.callbacks = [
      {
        handleLLMNewToken: createHandleLLMNewToken(streamRate),
      },
    ];
    return options;
  }

  const client = new OpenAIClient(apiKey, Object.assign({ req, res }, clientOptions)); // apiKey is final here
  return {
    client,
    openAIApiKey: apiKey, // Return the final, resolved API key
  };
};

module.exports = initializeClient;
