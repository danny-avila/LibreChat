const { HttpsProxyAgent } = require('https-proxy-agent');
const {
  EModelEndpoint,
  Constants,
  AuthType,
  removeNullishValues,
} = require('librechat-data-provider');
const { getUserKey, checkUserKeyExpiry } = require('~/server/services/UserService');
const { sleep } = require('~/server/utils');

const getOptions = async ({ req, endpointOption }) => {
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

  /** @type {import('@librechat/agents').BedrockConverseClientOptions} */
  const requestOptions = Object.assign(
    {
      model: endpointOption.model,
      region: BEDROCK_AWS_DEFAULT_REGION,
      streaming: true,
      streamUsage: true,
      callbacks: [
        {
          handleLLMNewToken: async () => {
            if (!streamRate) {
              return;
            }
            await sleep(streamRate);
          },
        },
      ],
    },
    endpointOption.model_parameters,
  );

  if (credentials) {
    requestOptions.credentials = credentials;
  }

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
