const { Providers } = require('@librechat/agents');
const { EModelEndpoint } = require('librechat-data-provider');
const initAnthropic = require('~/server/services/Endpoints/anthropic/initialize');
const getBedrockOptions = require('~/server/services/Endpoints/bedrock/options');
const initOpenAI = require('~/server/services/Endpoints/openAI/initialize');
const initCustom = require('~/server/services/Endpoints/custom/initialize');
const initGoogle = require('~/server/services/Endpoints/google/initialize');
const { getCustomEndpointConfig } = require('~/server/services/Config');

const providerConfigMap = {
  [Providers.XAI]: initCustom,
  [Providers.OLLAMA]: initCustom,
  [Providers.DEEPSEEK]: initCustom,
  [Providers.OPENROUTER]: initCustom,
  [EModelEndpoint.openAI]: initOpenAI,
  [EModelEndpoint.google]: initGoogle,
  [EModelEndpoint.azureOpenAI]: initOpenAI,
  [EModelEndpoint.anthropic]: initAnthropic,
  [EModelEndpoint.bedrock]: getBedrockOptions,
};

/**
 * Get the provider configuration and override endpoint based on the provider string
 * @param {string} provider - The provider string
 * @returns {Promise<{
 * getOptions: Function,
 * overrideProvider?: string,
 * customEndpointConfig?: TEndpoint
 * }>}
 */
async function getProviderConfig(provider) {
  let getOptions = providerConfigMap[provider];
  let overrideProvider;
  /** @type {TEndpoint | undefined} */
  let customEndpointConfig;

  if (!getOptions && providerConfigMap[provider.toLowerCase()] != null) {
    overrideProvider = provider.toLowerCase();
    getOptions = providerConfigMap[overrideProvider];
  } else if (!getOptions) {
    customEndpointConfig = await getCustomEndpointConfig(provider);
    if (!customEndpointConfig) {
      throw new Error(`Provider ${provider} not supported`);
    }
    getOptions = initCustom;
    overrideProvider = Providers.OPENAI;
  }

  return {
    getOptions,
    overrideProvider,
    customEndpointConfig,
  };
}

module.exports = {
  getProviderConfig,
};
