const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const { startChatSearch } = require('@librechat/api');

let stack = null;

/**
 * Installs chat search: schema, then projector.
 *
 * The thin half of the composition root — every decision and every ordering
 * constraint lives in `startChatSearch`, so both server entry points get an
 * identical stack from one call and neither is able to assemble a partial one.
 *
 * @returns {Promise<boolean>} whether this process won the projector lease.
 */
async function initializeChatSearch() {
  try {
    stack = await startChatSearch({ mongoose });
  } catch (error) {
    /** A misconfigured projection must not take the server down with it. */
    logger.error('[chatSearch] failed to initialize; projection will not run', error);
    stack = null;
  }

  return stack?.isProjecting() ?? false;
}

async function shutdownChatSearch() {
  const current = stack;
  stack = null;
  await current?.stop();
}

module.exports = { initializeChatSearch, shutdownChatSearch };
