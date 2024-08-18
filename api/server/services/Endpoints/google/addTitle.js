const { CacheKeys, Constants } = require('librechat-data-provider');
const getLogStores = require('~/cache/getLogStores');
const { isEnabled } = require('~/server/utils');
const { saveConvo } = require('~/models');
const { logger } = require('~/config');
const initializeClient = require('./initializeClient');

const addTitle = async (req, { text, response, client }) => {
  const { TITLE_CONVO = 'true' } = process.env ?? {};
  if (!isEnabled(TITLE_CONVO)) {
    return;
  }

  if (client.options.titleConvo === false) {
    return;
  }

  const DEFAULT_TITLE_MODEL = 'gemini-pro';
  const { GOOGLE_TITLE_MODEL } = process.env ?? {};

  let model = GOOGLE_TITLE_MODEL ?? DEFAULT_TITLE_MODEL;

  if (GOOGLE_TITLE_MODEL === Constants.CURRENT_MODEL) {
    model = client.options?.modelOptions.model;

    if (client.isVisionModel) {
      logger.warn(
        `current_model was specified for Google title request, but the model ${model} cannot process a text-only conversation. Falling back to ${DEFAULT_TITLE_MODEL}`,
      );

      model = DEFAULT_TITLE_MODEL;
    }
  }

  const titleEndpointOptions = {
    ...client.options,
    modelOptions: { ...client.options?.modelOptions, model: model },
    attachments: undefined, // After a response, this is set to an empty array which results in an error during setOptions
  };

  const { client: titleClient } = await initializeClient({
    req,
    res: response,
    endpointOption: titleEndpointOptions,
  });

  const titleCache = getLogStores(CacheKeys.GEN_TITLE);
  const key = `${req.user.id}-${response.conversationId}`;

  const title = await titleClient.titleConvo({
    text,
    responseText: response?.text,
    conversationId: response.conversationId,
  });
  await titleCache.set(key, title, 120000);
  await saveConvo(
    req,
    {
      conversationId: response.conversationId,
      title,
    },
    { context: 'api/server/services/Endpoints/google/addTitle.js' },
  );
};

module.exports = addTitle;
