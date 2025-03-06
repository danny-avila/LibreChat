const { HttpsProxyAgent } = require('https-proxy-agent');
const {
  AuthType,
  Constants,
  EModelEndpoint,
  bedrockInputParser,
  bedrockOutputParser,
  removeNullishValues,
} = require('librechat-data-provider');
const { getLogStores } = require('~/cache');
const { getUserKey, checkUserKeyExpiry } = require('~/server/services/UserService');
const { sleep } = require('~/server/utils');
const { logger } = require('~/config');

const { CacheKeys } = require('librechat-data-provider');

const getOptions = async ({ req, overrideModel, endpointOption }) => {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const availableAgents = await cache.get(CacheKeys.MODELS_CONFIG);
  const currentAgentName = req?.user?.lastSelectedModel;
  const currentAgent = availableAgents.find((a) => a.agentName === currentAgentName);
  const currentAgentId = currentAgent?.agentId;
  const currentAliasId = currentAgent?.latestAliasId;
  console.log(`currentAgent: ${JSON.stringify(currentAgent)}`);

  const {
    BEDROCK_AWS_SECRET_ACCESS_KEY,
    BEDROCK_AWS_ACCESS_KEY_ID,
    BEDROCK_AWS_SESSION_TOKEN,
    BEDROCK_REVERSE_PROXY,
    BEDROCK_AWS_DEFAULT_REGION,
    PROXY,
  } = process.env;
  const expiresAt = req.body.key;
  const isUserProvided = BEDROCK_AWS_SECRET_ACCESS_KEY === AuthType.USER_PROVIDED;

  let credentials = isUserProvided
    ? await getUserKey({ userId: req.user.id, name: EModelEndpoint.bedrock })
    : {
        accessKeyId: BEDROCK_AWS_ACCESS_KEY_ID,
        secretAccessKey: BEDROCK_AWS_SECRET_ACCESS_KEY,
        ...(BEDROCK_AWS_SESSION_TOKEN && { sessionToken: BEDROCK_AWS_SESSION_TOKEN }),
      };

  if (!credentials) {
    throw new Error('Bedrock credentials not provided. Please provide them again.');
  }

  if (
    !isUserProvided &&
    (credentials.accessKeyId === undefined || credentials.accessKeyId === '') &&
    (credentials.secretAccessKey === undefined || credentials.secretAccessKey === '')
  ) {
    credentials = undefined;
  }

  if (expiresAt && isUserProvided) {
    checkUserKeyExpiry(expiresAt, EModelEndpoint.bedrock);
  }

  /** @type {number} */
  let streamRate = Constants.DEFAULT_STREAM_RATE;

  /** @type {undefined | TBaseEndpoint} */
  const bedrockConfig = req.app.locals[EModelEndpoint.bedrock];

  if (bedrockConfig && bedrockConfig.streamRate) {
    streamRate = bedrockConfig.streamRate;
  }

  /** @type {undefined | TBaseEndpoint} */
  const allConfig = req.app.locals.all;
  if (allConfig && allConfig.streamRate) {
    streamRate = allConfig.streamRate;
  }

  /** @type {BedrockClientOptions} */
  const requestOptions = {
    model: overrideModel ?? endpointOption.model,
    agentId: currentAgentId,
    agentAliasId: currentAliasId,
    region: BEDROCK_AWS_DEFAULT_REGION,
  };
  console.log(`requestOptions: ${JSON.stringify(requestOptions, null, 2)}`);

  const configOptions = {};
  if (PROXY) {
    /** NOTE: NOT SUPPORTED BY BEDROCK */
    configOptions.httpAgent = new HttpsProxyAgent(PROXY);
  }

  const llmConfig = bedrockOutputParser(
    bedrockInputParser.parse(
      removeNullishValues(Object.assign(requestOptions, endpointOption.model_parameters)),
    ),
  );

  if (credentials) {
    llmConfig.credentials = credentials;
  }

  if (BEDROCK_REVERSE_PROXY) {
    llmConfig.endpointHost = BEDROCK_REVERSE_PROXY;
  }
  Object.assign(llmConfig, requestOptions);

  llmConfig.callbacks = [
    {
      handleLLMNewToken: async () => {
        if (!streamRate) {
          return;
        }
        await sleep(streamRate);
      },
    },
  ];

  return {
    /** @type {BedrockClientOptions} */
    llmConfig,
    configOptions,
  };
};

module.exports = getOptions;
