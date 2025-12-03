/**
 * Bedrock endpoint options configuration
 *
 * This module handles configuration for AWS Bedrock endpoints, including support for
 * HTTP/HTTPS proxies and reverse proxies.
 *
 * Proxy Support:
 * - When the PROXY environment variable is set, creates a custom BedrockRuntimeClient
 *   with an HttpsProxyAgent to route all Bedrock API calls through the specified proxy
 * - The custom client is fully configured with credentials, region, and endpoint,
 *   and is passed directly to ChatBedrockConverse via the 'client' parameter
 *
 * Reverse Proxy Support:
 * - When BEDROCK_REVERSE_PROXY is set, routes Bedrock API calls through a custom endpoint
 * - Works with or without the PROXY setting
 *
 * Without Proxy:
 * - Credentials and endpoint configuration are passed separately to ChatBedrockConverse,
 *   which creates its own BedrockRuntimeClient internally
 *
 * Environment Variables:
 * - PROXY: HTTP/HTTPS proxy URL (e.g., http://proxy.example.com:8080)
 * - BEDROCK_REVERSE_PROXY: Custom Bedrock API endpoint host
 * - BEDROCK_AWS_DEFAULT_REGION: AWS region for Bedrock service
 * - BEDROCK_AWS_ACCESS_KEY_ID: AWS access key (or set to 'user_provided')
 * - BEDROCK_AWS_SECRET_ACCESS_KEY: AWS secret key (or set to 'user_provided')
 * - BEDROCK_AWS_SESSION_TOKEN: Optional AWS session token
 */

const { HttpsProxyAgent } = require('https-proxy-agent');
const { NodeHttpHandler } = require('@smithy/node-http-handler');
const { BedrockRuntimeClient } = require('@aws-sdk/client-bedrock-runtime');
const {
  AuthType,
  EModelEndpoint,
  bedrockInputParser,
  bedrockOutputParser,
  removeNullishValues,
} = require('librechat-data-provider');
const { getUserKey } = require('~/server/services/UserService');
const { checkUserKeyExpiry } = require('@librechat/api');

const getOptions = async ({ req, overrideModel, endpointOption }) => {
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

  const llmConfig = bedrockOutputParser(
    bedrockInputParser.parse(
      removeNullishValues(Object.assign(requestOptions, endpointOption?.model_parameters ?? {})),
    ),
  );

  if (PROXY) {
    const proxyAgent = new HttpsProxyAgent(PROXY);

    // Create a custom BedrockRuntimeClient with proxy-enabled request handler.
    // ChatBedrockConverse will use this pre-configured client directly instead of
    // creating its own. Credentials are only set if explicitly provided; otherwise
    // the AWS SDK's default credential provider chain is used (instance profiles,
    // AWS profiles, environment variables, etc.)
    const customClient = new BedrockRuntimeClient({
      region: llmConfig.region ?? BEDROCK_AWS_DEFAULT_REGION,
      ...(credentials && { credentials }),
      requestHandler: new NodeHttpHandler({
        httpAgent: proxyAgent,
        httpsAgent: proxyAgent,
      }),
      ...(BEDROCK_REVERSE_PROXY && {
        endpoint: `https://${BEDROCK_REVERSE_PROXY}`,
      }),
    });

    llmConfig.client = customClient;
  } else {
    // When not using a proxy, let ChatBedrockConverse create its own client
    // by providing credentials and endpoint separately
    if (credentials) {
      llmConfig.credentials = credentials;
    }

    if (BEDROCK_REVERSE_PROXY) {
      llmConfig.endpointHost = BEDROCK_REVERSE_PROXY;
    }
  }

  return {
    /** @type {BedrockClientOptions} */
    llmConfig,
    configOptions,
  };
};

module.exports = getOptions;
