const OpenAI = require('openai');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { EModelEndpoint } = require('librechat-data-provider');
const {
  getUserKey,
  getUserKeyExpiry,
  checkUserKeyExpiry,
} = require('~/server/services/UserService');
const OpenAIClient = require('~/app/clients/OpenAIClient');
const { isUserProvided } = require('~/server/utils');

const initializeClient = async ({ req, res, endpointOption, initAppClient = false }) => {
  const { PROXY, OPENAI_ORGANIZATION, ASSISTANTS_API_KEY, ASSISTANTS_BASE_URL } = process.env;

  const userProvidesKey = isUserProvided(ASSISTANTS_API_KEY);
  const userProvidesURL = isUserProvided(ASSISTANTS_BASE_URL);

  let userValues = null;
  if (userProvidesKey || userProvidesURL) {
    const expiresAt = await getUserKeyExpiry({
      userId: req.user.id,
      name: EModelEndpoint.assistants,
    });
    checkUserKeyExpiry(
      expiresAt,
      'Your Assistants API key has expired. Please provide your API key again.',
    );
    userValues = await getUserKey({ userId: req.user.id, name: EModelEndpoint.assistants });
    try {
      userValues = JSON.parse(userValues);
    } catch (e) {
      throw new Error(
        'Invalid JSON provided for Assistants API user values. Please provide them again.',
      );
    }
  }

  let apiKey = userProvidesKey ? userValues.apiKey : ASSISTANTS_API_KEY;
  let baseURL = userProvidesURL ? userValues.baseURL : ASSISTANTS_BASE_URL;

  if (!apiKey) {
    throw new Error('Assistants API key not provided. Please provide it again.');
  }

  const opts = {};

  if (baseURL) {
    opts.baseURL = baseURL;
  }

  if (PROXY) {
    opts.httpAgent = new HttpsProxyAgent(PROXY);
  }

  if (OPENAI_ORGANIZATION) {
    opts.organization = OPENAI_ORGANIZATION;
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
