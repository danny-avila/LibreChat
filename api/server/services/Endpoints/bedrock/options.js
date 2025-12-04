const { HttpsProxyAgent } = require('https-proxy-agent');
const {
  AuthType,
  EModelEndpoint,
  bedrockInputParser,
  bedrockOutputParser,
  removeNullishValues,
} = require('librechat-data-provider');
const { getUserKey, checkUserKeyExpiry } = require('~/server/services/UserService');
const { logger } = require('@librechat/data-schemas');

const getOptions = async ({ req, overrideModel, endpointOption }) => {
  const {
    BEDROCK_AWS_SECRET_ACCESS_KEY,
    BEDROCK_AWS_ACCESS_KEY_ID,
    BEDROCK_AWS_SESSION_TOKEN,
    BEDROCK_AWS_PROFILE,
    BEDROCK_REVERSE_PROXY,
    BEDROCK_AWS_DEFAULT_REGION,
    PROXY,
  } = process.env;
  const expiresAt = req.body.key;
  const isUserProvided = BEDROCK_AWS_SECRET_ACCESS_KEY === AuthType.USER_PROVIDED;

  let credentials;

  if (isUserProvided) {
    // User-provided credentials from database
    credentials = await getUserKey({ userId: req.user.id, name: EModelEndpoint.bedrock });

    if (!credentials) {
      throw new Error('Bedrock credentials not provided. Please provide them again.');
    }

    if (expiresAt) {
      checkUserKeyExpiry(expiresAt, EModelEndpoint.bedrock);
    }
  } else if (BEDROCK_AWS_ACCESS_KEY_ID && BEDROCK_AWS_SECRET_ACCESS_KEY) {
    // Explicit credentials from environment variables
    credentials = {
      accessKeyId: BEDROCK_AWS_ACCESS_KEY_ID,
      secretAccessKey: BEDROCK_AWS_SECRET_ACCESS_KEY,
      ...(BEDROCK_AWS_SESSION_TOKEN && { sessionToken: BEDROCK_AWS_SESSION_TOKEN }),
    };
    logger.info('[Bedrock] Using explicit credentials from environment variables');
  } else {
    // Use AWS SDK default credential provider chain
    // This supports: AWS profiles, IAM roles, EC2/ECS metadata, SSO, etc.
    credentials = undefined;
    if (BEDROCK_AWS_PROFILE) {
      logger.info(
        `[Bedrock] Using AWS credential provider chain with profile: ${BEDROCK_AWS_PROFILE}`,
      );
    } else {
      logger.info('[Bedrock] Using AWS credential provider chain with default profile');
    }
  }

  /*
  Callback for stream rate no longer awaits and may end the stream prematurely
  /** @type {number}
  let streamRate = Constants.DEFAULT_STREAM_RATE;

  /** @type {undefined | TBaseEndpoint}
  const bedrockConfig = appConfig.endpoints?.[EModelEndpoint.bedrock];

  if (bedrockConfig && bedrockConfig.streamRate) {
    streamRate = bedrockConfig.streamRate;
  }

  const allConfig = appConfig.endpoints?.all;
  if (allConfig && allConfig.streamRate) {
    streamRate = allConfig.streamRate;
  }
  */

  /** @type {BedrockClientOptions} */
  const requestOptions = {
    model: overrideModel ?? endpointOption?.model,
    region: BEDROCK_AWS_DEFAULT_REGION,
  };

  const configOptions = {};
  if (PROXY) {
    /** NOTE: NOT SUPPORTED BY BEDROCK */
    configOptions.httpAgent = new HttpsProxyAgent(PROXY);
  }

  const llmConfig = bedrockOutputParser(
    bedrockInputParser.parse(
      removeNullishValues(Object.assign(requestOptions, endpointOption?.model_parameters ?? {})),
    ),
  );

  if (credentials) {
    llmConfig.credentials = credentials;
  }

  // Pass AWS profile to the SDK if specified and no explicit credentials
  if (!credentials && BEDROCK_AWS_PROFILE) {
    llmConfig.profile = BEDROCK_AWS_PROFILE;
  }

  if (BEDROCK_REVERSE_PROXY) {
    llmConfig.endpointHost = BEDROCK_REVERSE_PROXY;
  }

  return {
    /** @type {BedrockClientOptions} */
    llmConfig,
    configOptions,
  };
};

module.exports = getOptions;
