const { HttpsProxyAgent } = require('https-proxy-agent');
const { EModelEndpoint, AuthType, removeNullishValues } = require('librechat-data-provider');
const { getUserKey, checkUserKeyExpiry } = require('~/server/services/UserService');

const getOptions = async ({ req, endpointOption }) => {
  const {
    BEDROCK_AWS_SECRET_ACCESS_KEY,
    BEDROCK_AWS_ACCESS_KEY_ID,
    BEDROCK_REVERSE_PROXY,
    BEDROCK_AWS_DEFAULT_REGION,
    PROXY,
  } = process.env;
  const expiresAt = req.body.key;
  const isUserProvided = BEDROCK_AWS_SECRET_ACCESS_KEY === AuthType.USER_PROVIDED;

  const credentials = isUserProvided
    ? await getUserKey({ userId: req.user.id, name: EModelEndpoint.bedrock })
    : {
      accessKeyId: BEDROCK_AWS_ACCESS_KEY_ID,
      secretAccessKey: BEDROCK_AWS_SECRET_ACCESS_KEY,
    };

  if (!credentials) {
    throw new Error('Bedrock credentials not provided. Please provide them again.');
  }

  if (expiresAt && isUserProvided) {
    checkUserKeyExpiry(expiresAt, EModelEndpoint.bedrock);
  }

  const clientOptions = {};

  /** @type {undefined | TBaseEndpoint} */
  const bedrockConfig = req.app.locals[EModelEndpoint.bedrock];

  if (bedrockConfig) {
    clientOptions.streamRate = bedrockConfig.streamRate;
  }

  /** @type {undefined | TBaseEndpoint} */
  const allConfig = req.app.locals.all;
  if (allConfig) {
    clientOptions.streamRate = allConfig.streamRate;
  }

  const requestOptions = Object.assign(
    {
      credentials,
      model: endpointOption.model,
      region: BEDROCK_AWS_DEFAULT_REGION,
      streaming: true,
      streamUsage: true,
    },
    endpointOption.model_parameters,
  );

  const configOptions = {};
  if (PROXY) {
    configOptions.httpAgent = new HttpsProxyAgent(PROXY);
  }

  if (BEDROCK_REVERSE_PROXY) {
    configOptions.endpointHost = BEDROCK_REVERSE_PROXY;
  }

  return {
    llmConfig: removeNullishValues(requestOptions),
    configOptions,
  };
};

module.exports = getOptions;
