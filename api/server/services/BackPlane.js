
const { logger } = require('~/config');

let Redis;
try {
  Redis = require('ioredis');
} catch {
  // If ioredis is not installed, we degrade gracefully.
  Redis = null;
}

const CHANNEL = process.env.REDIS_CHANNEL || 'ua:activity';
const REDIS_URL = process.env.REDIS_URL || null;

// Unique id to avoid echoing our own messages
const instanceId = `${process.pid}-${Math.random().toString(36).slice(2)}`;

let pub = null;
let sub = null;
let onActivity = null;

function initRedisIfNeeded() {
  if (!REDIS_URL || !Redis) return false;
  if (!pub) {
    pub = new Redis(REDIS_URL);
    pub.on('error', (e) => logger.error('[Backplane] Redis pub error:', e));
  }
  if (!sub) {
    sub = new Redis(REDIS_URL);
    sub.on('error', (e) => logger.error('[Backplane] Redis sub error:', e));
    sub.subscribe(CHANNEL, (err) => {
      if (err) logger.error('[Backplane] Failed to subscribe:', err);
      else logger.info(`[Backplane] Subscribed to ${CHANNEL}`);
    });
    sub.on('message', (_channel, message) => {
      try {
        const { sourceId, payload } = JSON.parse(message);
        if (sourceId === instanceId) return; // ignore echoes
        if (onActivity) onActivity(payload);
      } catch (e) {
        logger.error('[Backplane] Failed to parse message:', e);
      }
    });
  }
  return true;
}

function initSubscriber(cb) {
  onActivity = cb;
  const ok = initRedisIfNeeded();
  if (!ok) {
    logger.warn('[Backplane] Redis not configured (set REDIS_URL). Running without cross-instance streaming.');
  }
}

async function publishActivity(payload) {
  const ok = initRedisIfNeeded();
  if (!ok) return; // no-op if Redis not configured
  try {
    const msg = JSON.stringify({ sourceId: instanceId, payload });
    await pub.publish(CHANNEL, msg);
  } catch (e) {
    logger.error('[Backplane] Publish failed:', e);
  }
}

module.exports = {
  initSubscriber,
  publishActivity,
  instanceId,
};
