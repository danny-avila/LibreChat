const { logger } = require('@librechat/data-schemas');
const mongoose = require('mongoose');
const { deleteConvos } = require('~/models/Conversation');

/**
 * BKL retention purge (항목 11): soft-delete 된 채팅이 보존기간
 * (`BKL_CHAT_RETENTION_DAYS`, 기본 60일, 0 = 비활성)을 넘기면 하루 한 번
 * hard delete 한다. 통계는 append-only `bkl_query_logs` 기반이라 영향 없음.
 */

const DAY_MS = 24 * 3600 * 1000;

async function purgeExpiredSoftDeletes() {
  const retentionDays = parseInt(process.env.BKL_CHAT_RETENTION_DAYS ?? '60', 10);
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    return;
  }
  const conn = mongoose.connection;
  if (!conn || conn.readyState !== 1) {
    return;
  }
  const threshold = new Date(Date.now() - retentionDays * DAY_MS);
  try {
    const expired = await conn.db
      .collection('conversations')
      .find(
        { bklDeletedAt: { $lte: threshold } },
        { projection: { conversationId: 1, user: 1 } },
      )
      .limit(500)
      .toArray();

    if (!expired.length) {
      return;
    }

    let purged = 0;
    for (const convo of expired) {
      try {
        await deleteConvos(convo.user, { conversationId: convo.conversationId });
        purged += 1;
      } catch (err) {
        logger.warn(
          `[bklRetention] failed to purge conversation ${convo.conversationId}`,
          err,
        );
      }
    }
    logger.info(`[bklRetention] purged ${purged} soft-deleted conversations (> ${retentionDays}d)`);
  } catch (err) {
    logger.error('[bklRetention] purge run failed', err);
  }
}

let timer = null;

function startRetentionPurge() {
  if (timer) {
    return;
  }
  /* 시작 5분 후 1회, 이후 24시간마다 */
  setTimeout(() => {
    purgeExpiredSoftDeletes();
    timer = setInterval(purgeExpiredSoftDeletes, DAY_MS);
    timer.unref?.();
  }, 5 * 60 * 1000).unref?.();
}

module.exports = { startRetentionPurge, purgeExpiredSoftDeletes };
