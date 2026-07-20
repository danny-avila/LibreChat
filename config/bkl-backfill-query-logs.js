/**
 * BKL: one-time backfill of `bkl_query_logs` from existing user messages.
 *
 * - Every `isCreatedByUser: true` message becomes one log entry (idempotent
 *   upsert by messageId — safe to re-run).
 * - Heuristics applied during backfill:
 *   - `[BKL_QUERY_ENHANCE:on]` prefix          → kind: 'query_enhance'
 *   - `bkl_cloned: true` (marked going forward) → skipped
 *   - duplicate (user, conversationId≠, text, createdAt) clone pairs cannot be
 *     reliably detected retroactively, so historical clones created before the
 *     `bkl_cloned` marker existed are included as-is (documented tolerance).
 *
 * Usage: npm run b:bkl-backfill-query-logs  (or `node config/bkl-backfill-query-logs.js`)
 */
const path = require('path');
const mongoose = require('mongoose');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { silentExit } = require('./helpers');
const connect = require('./connect');
const {
  classifyKind,
  buildPreview,
  COLLECTION,
} = require('~/server/services/bklQueryLog');

const BATCH = 1000;

(async () => {
  await connect();
  const db = mongoose.connection.db;
  const logs = db.collection(COLLECTION);

  await logs.createIndex({ messageId: 1 }, { unique: true });
  await logs.createIndex({ createdAt: 1 });
  await logs.createIndex({ user: 1, createdAt: 1 });

  const filter = {
    isCreatedByUser: true,
    bkl_cloned: { $ne: true },
  };
  const total = await db.collection('messages').countDocuments(filter);
  console.log(`Backfilling ${total} user messages into ${COLLECTION}...`);

  const cursor = db
    .collection('messages')
    .find(filter, {
      projection: {
        messageId: 1,
        user: 1,
        conversationId: 1,
        endpoint: 1,
        model: 1,
        text: 1,
        createdAt: 1,
      },
    })
    .sort({ createdAt: 1 });

  let ops = [];
  let processed = 0;
  for await (const msg of cursor) {
    if (!msg.messageId) {
      continue;
    }
    const text = msg.text || '';
    ops.push({
      updateOne: {
        filter: { messageId: msg.messageId },
        update: {
          $setOnInsert: {
            messageId: msg.messageId,
            user: msg.user != null ? String(msg.user) : null,
            conversationId: msg.conversationId ?? null,
            endpoint: msg.endpoint ?? null,
            model: msg.model ?? null,
            kind: classifyKind(text),
            textPreview: buildPreview(text),
            createdAt: msg.createdAt ?? new Date(),
            backfilled: true,
          },
        },
        upsert: true,
      },
    });
    if (ops.length >= BATCH) {
      await logs.bulkWrite(ops, { ordered: false });
      processed += ops.length;
      ops = [];
      console.log(`  ${processed}/${total}`);
    }
  }
  if (ops.length) {
    await logs.bulkWrite(ops, { ordered: false });
    processed += ops.length;
  }

  const logTotal = await logs.countDocuments({});
  console.log(`Done. processed=${processed}, ${COLLECTION} total=${logTotal}`);
  silentExit(0);
})();

process.on('uncaughtException', (err) => {
  console.error('There was an uncaught error:', err);
  process.exit(1);
});
