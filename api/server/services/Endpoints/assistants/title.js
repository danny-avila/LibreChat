const { isEnabled } = require('@librechat/api');
const { CacheKeys } = require('librechat-data-provider');
const { saveConvo } = require('~/models/Conversation');
const getLogStores = require('~/cache/getLogStores');
const { logger } = require('@librechat/data-schemas');

const addTitle = async (req, { text, responseText, conversationId, client }) => {
  const { TITLE_CONVO = 'true' } = process.env ?? {};

logger.debug(`[api/server/services/Endpoints/assistants/title.js #addTitle] ${TITLE_CONVO}`);

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

  await saveConvo(
    req,
    {
      conversationId,
      title,
    },
    { context: 'api/server/services/Endpoints/assistants/addTitle.js' },
  );
};

module.exports = addTitle;
