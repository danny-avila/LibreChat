const { CacheKeys } = require('librechat-data-provider');
const getLogStores = require('~/cache/getLogStores');
const { isEnabled } = require('~/server/utils');
const { saveConvo } = require('~/models');
const initializeClient = require('./initializeClient');

const addTitle = async (req, { text, response, client }) => {
  console.log('Considering generating a title');
  const { TITLE_CONVO = 'true' } = process.env ?? {};
  if (!isEnabled(TITLE_CONVO)) {
    return;
  }

  if (client.options.titleConvo === false) {
    return;
  }

  // TODO: Generalize model name
  const { GOOGLE_TITLE_MODEL } = process.env ?? {};

  const titleEndpointOptions = {
    ...client.options,
    modelOptions: { ...client.options?.modelOptions, model: GOOGLE_TITLE_MODEL ?? 'gemini-pro' },
    attachments: undefined, // After a response, this is set to an empty array which results in an error during setOptions
  };

  const { client: titleClient } = await initializeClient({
    req,
    res: response,
    endpointOption: titleEndpointOptions,
  });

  const titleCache = getLogStores(CacheKeys.GEN_TITLE);
  const key = `${req.user.id}-${response.conversationId}`;

  const title = await titleClient.titleConvo({ text, responseText: response?.text });
  await titleCache.set(key, title, 120000);
  await saveConvo(req.user.id, {
    conversationId: response.conversationId,
    title,
  });
};

module.exports = addTitle;
