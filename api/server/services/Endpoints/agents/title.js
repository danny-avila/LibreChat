const { isEnabled } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const getLogStores = require('~/cache/getLogStores');
const { saveConvo } = require('~/models');

/**
 * Add title to conversation in a way that avoids memory retention
 */
const addTitle = async (req, { text, response, client }) => {
  const { TITLE_CONVO = true } = process.env ?? {};

  logger.debug(`[api/server/services/Endpoints/agents/title.js #addTitle]  TITLE_CONVO: ${TITLE_CONVO}`);
  logger.debug(`[api/server/services/Endpoints/agents/title.js #addTitle]  client.options.titleConvo: ${client.options.titleConvo}`);


  if (!isEnabled(TITLE_CONVO)) {
    return;
  }

  if (client.options.titleConvo === false) {
    logger.debug(`[api/server/services/Endpoints/agents/title.js #addTitle]  client.options: ${client.options}`);
    return;
  }

  const titleCache = getLogStores(CacheKeys.GEN_TITLE);
  const key = `${req.user.id}-${response.conversationId}`;
  /** @type {NodeJS.Timeout} */
  let timeoutId;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Title generation timeout')), 45000);
    }).catch((error) => {
      logger.error('Title error:', error);
    });

    let titlePromise;
    let abortController = new AbortController();
    if (client && typeof client.titleConvo === 'function') {
      titlePromise = Promise.race([
        client
          .titleConvo({
            text,
            abortController,
          })
          .catch((error) => {
            logger.error('Client title error:', error);
          }),
        timeoutPromise,
      ]);
      logger.debug(`[${key}] Title generation started`);      
    } else {
      return;
    }

    const title = await titlePromise;
    if (!abortController.signal.aborted) {
      abortController.abort();
    }
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (!title) {
      logger.debug(`[${key}] No title generated for text ${text}`);
      return;
    }

    await titleCache.set(key, title, 120000);
    await saveConvo(
      req,
      {
        conversationId: response.conversationId,
        title,
      },
      { context: 'api/server/services/Endpoints/agents/title.js' },
    );
  } catch (error) {
    logger.error('Error generating title:', error);
  }
};

module.exports = addTitle;
