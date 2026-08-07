const mongoose = require('mongoose');
const {
  logger,
  dedupeSearchEvents,
  deleteSearchEvents,
  readSearchEvents,
  searchSyncEnabled,
} = require('@librechat/data-schemas');
const { createMongoSourceReader, createSearchPool, Projector } = require('@librechat/api');

let projector = null;

/**
 * Starts the chat-search projector at boot, alongside the existing index sync.
 *
 * Leadership is settled by a PostgreSQL lease rather than by this call, so every
 * pod may invoke it: exactly one becomes the projector and the rest return
 * without projecting. Serving is unaffected either way — with
 * `CHAT_SEARCH_SYNC=false` the stack keeps answering queries and only the
 * projection freezes, which is the intended pause switch.
 *
 * @returns {Promise<boolean>} whether this process became the projector.
 */
async function startSearchSync() {
  if (!searchSyncEnabled()) {
    return false;
  }

  const connectionString = process.env.CHAT_SEARCH_WRITER_URL;
  if (!connectionString) {
    logger.warn(
      '[searchSync] CHAT_SEARCH_SYNC is on but CHAT_SEARCH_WRITER_URL is unset; not projecting',
    );
    return false;
  }

  const pool = createSearchPool({
    connectionString,
    applicationName: 'librechat-chat-search-projector',
    /** The reconciliation sweep runs far longer than a request ever should. */
    statementTimeoutMillis: 0,
  });

  projector = new Projector(
    { pool, mongoose, source: createMongoSourceReader(mongoose) },
    {
      readSearchEvents: (limit) => readSearchEvents(mongoose, limit),
      deleteSearchEvents: (ids) => deleteSearchEvents(mongoose, ids),
      dedupeSearchEvents,
    },
  );

  const leading = await projector.start();
  if (!leading) {
    await pool.end().catch(() => undefined);
    projector = null;
  }
  return leading;
}

async function stopSearchSync() {
  if (!projector) {
    return;
  }
  await projector.stop();
  projector = null;
}

module.exports = { startSearchSync, stopSearchSync };
