const { CacheKeys } = require('librechat-data-provider');
const { saveConvo } = require('~/models/Conversation');
const getLogStores = require('~/cache/getLogStores');
const { isEnabled } = require('~/server/utils');

const addTitle = async (req, { text, responseText, conversationId, client }) => {
  const { TITLE_CONVO = 'true' } = process.env ?? {};
  if (!isEnabled(TITLE_CONVO)) {
    return;
  }

  if (client.options.titleConvo === false) {
    return;
  }

  const titleCache = getLogStores(CacheKeys.GEN_TITLE);
  const key = `${req.user.id}-${conversationId}`;

  const title = await client.titleConvo({ text, conversationId, responseText });
  await titleCache.set(key, title, 120000);

  await saveConvo(req.user.id, {
    conversationId,
    title,
  });
};

module.exports = addTitle;
