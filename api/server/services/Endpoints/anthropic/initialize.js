const { getLLMConfig } = require('@librechat/api');
const { EModelEndpoint } = require('librechat-data-provider');
const { getUserKey, checkUserKeyExpiry } = require('~/server/services/UserService');
const AnthropicClient = require('~/app/clients/AnthropicClient');

const initializeClient = async ({ req, res, endpointOption, overrideModel, optionsOnly }) => {
  const appConfig = req.config;
  const { ANTHROPIC_API_KEY, ANTHROPIC_REVERSE_PROXY, PROXY } = process.env;
  const expiresAt = req.body.key;
  const isUserProvided = ANTHROPIC_API_KEY === 'user_provided';

  const anthropicApiKey = isUserProvided
    ? await getUserKey({ userId: req.user.id, name: EModelEndpoint.anthropic })
    : ANTHROPIC_API_KEY;

  if (!anthropicApiKey) {
    throw new Error('Anthropic API key not provided. Please provide it again.');
  }

  if (expiresAt && isUserProvided) {
    checkUserKeyExpiry(expiresAt, EModelEndpoint.anthropic);
  }

  let clientOptions = {};

  /** @type {undefined | TBaseEndpoint} */
  const anthropicConfig = appConfig.endpoints?.[EModelEndpoint.anthropic];

  if (anthropicConfig) {
    clientOptions._lc_stream_delay = anthropicConfig.streamRate;
    clientOptions.titleModel = anthropicConfig.titleModel;
  }

  const allConfig = appConfig.endpoints?.all;
  if (allConfig) {
    clientOptions._lc_stream_delay = allConfig.streamRate;
  }

  if (optionsOnly) {
    clientOptions = Object.assign(
      {
        proxy: PROXY ?? null,
        reverseProxyUrl: ANTHROPIC_REVERSE_PROXY ?? null,
        modelOptions: endpointOption?.model_parameters ?? {},
      },
      clientOptions,
    );
    if (overrideModel) {
      clientOptions.modelOptions.model = overrideModel;
    }
    clientOptions.modelOptions.user = req.user.id;
    return getLLMConfig(anthropicApiKey, clientOptions);
  }

  const client = new AnthropicClient(anthropicApiKey, {
    req,
    res,
    reverseProxyUrl: ANTHROPIC_REVERSE_PROXY ?? null,
    proxy: PROXY ?? null,
    ...clientOptions,
    ...endpointOption,
  });

  return {
    client,
    anthropicApiKey,
  };
};

module.exports = initializeClient;
