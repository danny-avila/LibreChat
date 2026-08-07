const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const { createChatSearch } = require('@librechat/api');
const { setChatSearch, getChatSearch } = require('./candidates');

let runtime = null;

/**
 * Installs the search backend the routes resolve candidates through.
 *
 * Called once at boot. Returns whether a backend was installed: a deployment
 * that has configured neither PostgreSQL chat search nor Meilisearch simply has
 * no search, which the capability probe then reports so the client hides the UI
 * rather than offering a box that always comes back empty.
 *
 * @returns {boolean} whether a search backend is now serving.
 */
function initializeChatSearch() {
  try {
    runtime = createChatSearch({ mongoose });
  } catch (error) {
    /** A misconfigured backend must not take the server down with it. */
    logger.error('[chatSearch] failed to initialize; search will be unavailable', error);
    runtime = null;
  }

  setChatSearch(runtime?.chatSearch ?? null);
  if (!runtime) {
    logger.info('[chatSearch] no search backend is configured');
  }
  return runtime != null;
}

async function shutdownChatSearch() {
  const current = runtime;
  runtime = null;
  setChatSearch(null);
  await current?.close();
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
