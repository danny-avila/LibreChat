const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');

/**
 * BKL append-only query log (`bkl_query_logs`).
 *
 * Every *new* user message that flows through the normal ask path is upserted
 * here (idempotent by messageId). Clones/forks/imports go through
 * `bulkSaveMessages` and therefore never reach this hook, and deleting a
 * conversation does not touch the log — making it the stable source of truth
 * for usage statistics.
 */

const COLLECTION = 'bkl_query_logs';

/** Leading BKL control tags that may prefix the raw user text. */
const BKL_TAG_RE =
  /^(?:\s*(?:\[BKL_FILTER:\{.*?\}\]|\[BKL_REFERENCE:\{.*?\}\]|\[BKL_REFERENCE:[^\]]*\]|\[BKL_GUIDED_RETRY:[A-Za-z0-9_-]+\]|\[BKL_QUERY_ENHANCE:on\]|\[BKL_QUERY_CHOICES:[A-Za-z0-9+/=]+\]))+\s*/;

const ENHANCE_RE = /\[BKL_QUERY_ENHANCE:on\]/;

let indexesEnsured = false;

function getCollection() {
  const conn = mongoose.connection;
  if (!conn || conn.readyState !== 1) {
    return null;
  }
  return conn.db.collection(COLLECTION);
}

async function ensureIndexes(collection) {
  if (indexesEnsured) {
    return;
  }
  indexesEnsured = true;
  try {
    await collection.createIndex({ messageId: 1 }, { unique: true });
    await collection.createIndex({ createdAt: 1 });
    await collection.createIndex({ user: 1, createdAt: 1 });
  } catch (err) {
    logger.warn('[bklQueryLog] failed to ensure indexes', err);
  }
}

function classifyKind(text) {
  return ENHANCE_RE.test(text || '') ? 'query_enhance' : 'query';
}

function buildPreview(text) {
  return String(text || '')
    .replace(BKL_TAG_RE, '')
    .slice(0, 120);
}

/**
 * Idempotently records a user query. Never throws; failures are logged only,
 * so message saving is never blocked by logging.
 *
 * @param {object} params
 * @param {TMessage} params.message - saved user message (isCreatedByUser=true)
 * @param {string} params.user - user id
 * @param {string} [params.endpoint]
 * @param {string} [params.model]
 */
async function logUserQuery({ message, user, endpoint, model }) {
  try {
    if (!message?.messageId || message.isCreatedByUser !== true) {
      return;
    }
    const collection = getCollection();
    if (!collection) {
      return;
    }
    await ensureIndexes(collection);
    const text = message.text || '';
    await collection.updateOne(
      { messageId: message.messageId },
      {
        $setOnInsert: {
          messageId: message.messageId,
          user: user != null ? String(user) : null,
          conversationId: message.conversationId ?? null,
          endpoint: endpoint ?? null,
          model: model ?? message.model ?? null,
          kind: classifyKind(text),
          textPreview: buildPreview(text),
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );
  } catch (err) {
    logger.warn('[bklQueryLog] failed to log user query', err);
  }
}

module.exports = { logUserQuery, classifyKind, buildPreview, COLLECTION };
