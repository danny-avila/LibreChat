const { CacheKeys } = require('librechat-data-provider');
const getLogStores = require('~/cache/getLogStores');
const { isEnabled } = require('~/server/utils');
const { saveConvo } = require('~/models');

const addTitle = async (req, { text, response, client }) => {
  const { TITLE_CONVO = true } = process.env ?? {};
  if (!isEnabled(TITLE_CONVO)) {
    return;
  }

  if (client.options.titleConvo === false) {
    return;
  }

  // If the request was aborted, don't generate the title.
  if (client.abortController.signal.aborted) {
    return;
  }

  const titleCache = getLogStores(CacheKeys.GEN_TITLE);
  const key = `${req.user.id}-${response.conversationId}`;
  const responseText =
    response?.content && Array.isArray(response?.content)
      ? response.content.reduce((acc, block) => {
        if (block?.type === 'text') {
          return acc + block.text;
        }
        return acc;
      }, '')
      : (response?.content ?? response?.text ?? '');

  const title = await client.titleConvo({
    text,
    responseText,
    conversationId: response.conversationId,
  });
  await titleCache.set(key, title, 120000);
  await saveConvo(
    req,
    {
      conversationId: response.conversationId,
      title,
    },
    { context: 'api/server/services/Endpoints/agents/title.js' },
  );
};

module.exports = addTitle;
