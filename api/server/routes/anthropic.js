const express = require('express');
const { EModelEndpoint } = require('librechat-data-provider');
const { requireJwtAuth } = require('~/server/middleware');
const { getUserKey, checkUserKeyExpiry } = require('~/server/services/UserService');
const { getOrCreateWarmContainer } = require('~/server/services/Anthropic/containerCache');
const { logger } = require('~/config');

const router = express.Router();

router.use(requireJwtAuth);

/**
 * Pre-provision an Anthropic Skills container for the calling user so the
 * first real Skills-enabled request doesn't pay the full cold-start. Fired
 * fire-and-forget by the Help Others entry points (button + sidebar load).
 *
 * Idempotent: if the user already has a fresh cached container, this is a
 * no-op and returns immediately. Concurrent calls dedupe to one provision.
 */
router.post('/warmup', async (req, res) => {
  logger.info(`[WARMUP] /warmup hit by user ${req.user?.id ?? '<no user>'}`);
  try {
    const { ANTHROPIC_API_KEY } = process.env;
    const isUserProvided = ANTHROPIC_API_KEY === 'user_provided';
    const expiresAt = req.body?.key;

    const apiKey = isUserProvided
      ? await getUserKey({ userId: req.user.id, name: EModelEndpoint.anthropic })
      : ANTHROPIC_API_KEY;

    if (!apiKey) {
      return res.status(200).json({ ok: false, reason: 'no_api_key' });
    }

    if (expiresAt && isUserProvided) {
      try {
        checkUserKeyExpiry(expiresAt, EModelEndpoint.anthropic);
      } catch (_e) {
        return res.status(200).json({ ok: false, reason: 'key_expired' });
      }
    }

    /* Don't await — return immediately so the frontend isn't blocked. The
     * provisioning runs in background; subsequent send-message requests will
     * see the cached id when it lands. */
    getOrCreateWarmContainer({ userId: req.user.id, apiKey }).catch((error) => {
      logger.warn('[anthropic.warmup] background provision failed', error?.message ?? error);
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    logger.warn('[anthropic.warmup] handler error', error?.message ?? error);
    return res.status(200).json({ ok: false, reason: 'handler_error' });
  }
});

module.exports = router;
