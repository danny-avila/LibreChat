const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const { startChatSearch } = require('@librechat/api');
const { setChatSearch, getChatSearch } = require('./candidates');

let stack = null;

/**
 * Installs chat search: schema, reader backend, projector.
 *
 * The thin half of the composition root — every decision and every ordering
 * constraint lives in `startChatSearch`, so both server entry points get an
 * identical stack from one call and neither is able to assemble a partial one.
 *
 * @returns {Promise<boolean>} whether a search backend is now serving.
 */
async function initializeChatSearch() {
  try {
    stack = await startChatSearch({ mongoose });
  } catch (error) {
    /** A misconfigured backend must not take the server down with it. */
    logger.error('[chatSearch] failed to initialize; search will be unavailable', error);
    stack = null;
  }

  setChatSearch(stack?.chatSearch ?? null);
  return stack?.chatSearch != null;
}

async function shutdownChatSearch() {
  const current = stack;
  stack = null;
  setChatSearch(null);
  await current?.stop();
}

/**
 * Whether the installed backend can answer a query right now.
 *
 * This is what `GET /api/search/enable` reports, so it has to describe the
 * backend the routes actually call rather than a store that may not be the one
 * serving.
 *
 * @returns {Promise<boolean>}
 */
async function isChatSearchReady() {
  const chatSearch = getChatSearch();
  if (!chatSearch) {
    return false;
  }
  try {
    return await chatSearch.isReady();
  } catch (error) {
    logger.error('[chatSearch] readiness probe failed', error);
    return false;
  }
}

module.exports = { initializeChatSearch, shutdownChatSearch, isChatSearchReady };
