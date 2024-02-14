const OpenAI = require('openai');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { EModelEndpoint } = require('librechat-data-provider');
const {
  getUserKey,
  getUserKeyExpiry,
  checkUserKeyExpiry,
} = require('~/server/services/UserService');
const OpenAIClient = require('~/app/clients/OpenAIClient');

const initializeClient = async ({ req, res, endpointOption, initAppClient = false }) => {
  const { PROXY, OPENAI_ORGANIZATION, ASSISTANTS_API_KEY, ASSISTANTS_BASE_URL } = process.env;

  const opts = {};
  const baseURL = ASSISTANTS_BASE_URL ?? null;

  if (baseURL) {
    opts.baseURL = baseURL;
  }

  if (PROXY) {
    opts.httpAgent = new HttpsProxyAgent(PROXY);
  }

  if (OPENAI_ORGANIZATION) {
    opts.organization = OPENAI_ORGANIZATION;
  }

  const credentials = ASSISTANTS_API_KEY;

  const isUserProvided = credentials === 'user_provided';

  let userKey = null;
  if (isUserProvided) {
    const expiresAt = getUserKeyExpiry({ userId: req.user.id, name: EModelEndpoint.assistants });
    checkUserKeyExpiry(
      expiresAt,
      'Your Assistants API key has expired. Please provide your API key again.',
    );
    userKey = await getUserKey({ userId: req.user.id, name: EModelEndpoint.assistants });
  }

  let apiKey = isUserProvided ? userKey : credentials;

  if (!apiKey) {
    throw new Error('API key not provided.');
  }

  /** @type {OpenAIClient} */
  const openai = new OpenAI({
    apiKey,
    ...opts,
  });
  openai.req = req;
  openai.res = res;

  if (endpointOption && initAppClient) {
    const clientOptions = {
      reverseProxyUrl: baseURL,
      proxy: PROXY ?? null,
      req,
      res,
      ...endpointOption,
    };

    const client = new OpenAIClient(apiKey, clientOptions);
    return {
      client,
      openai,
      openAIApiKey: apiKey,
    };
  }

  return {
    openai,
    openAIApiKey: apiKey,
  };
};

module.exports = initializeClient;
