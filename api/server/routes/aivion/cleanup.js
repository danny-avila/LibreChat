/**
 * POST /internal/cleanup
 *
 * Bearer-authenticated endpoint called by aivion-sso's webhook fanout on every
 * Clerk event. We only act on `user.deleted`; everything else is silently
 * acknowledged so SSO doesn't treat us as a failing subscriber.
 *
 * On user.deleted we find the LibreChat user by openidId (= Clerk sub stored by
 * the OIDC strategy) and run a cascade delete so the MongoDB record doesn't
 * block the user from logging in again if their Clerk account is re-created.
 */
const express = require('express');
const { logger } = require('@librechat/data-schemas');
const db = require('~/models');

const router = express.Router();

const TOKEN = process.env.INTERNAL_SERVICE_TOKEN || 'dev-internal-token-rotate-me';

router.post('/', express.json(), async (req, res) => {
  const auth = req.headers['authorization'] ?? '';
  if (auth !== `Bearer ${TOKEN}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { type, data } = req.body ?? {};
  if (type !== 'user.deleted') {
    return res.status(200).json({ ok: true, status: 'ignored', type });
  }

  const clerkUserId = data?.id;
  if (!clerkUserId) {
    logger.warn('[internal/cleanup] user.deleted missing data.id');
    return res.status(200).json({ ok: true, status: 'no_id' });
  }

  let user;
  try {
    user = await db.findUser({ openidId: clerkUserId }, '_id');
  } catch (err) {
    logger.error('[internal/cleanup] findUser failed', { clerkUserId, err });
    return res.status(500).json({ error: 'db_lookup_failed' });
  }

  if (!user) {
    logger.info('[internal/cleanup] user not found, nothing to delete', { clerkUserId });
    return res.status(200).json({ ok: true, status: 'not_found' });
  }

  const userId = user._id.toString();
  logger.info('[internal/cleanup] deleting user', { clerkUserId, userId });

  // Each step is best-effort — a partial failure is logged but does not block
  // subsequent steps. deleteUserById is the critical one (unblocks OIDC re-login).
  await runBestEffort('deleteUserKey', () => db.deleteUserKey({ userId, all: true }));
  await runBestEffort('deleteUserById', () => db.deleteUserById(userId));
  await runBestEffort('deleteUserAgents', () => db.deleteUserAgents(userId));
  await runBestEffort('deleteUserSkills', () => db.deleteUserSkills(userId));
  await runBestEffort('deleteUserPrompts', () => db.deleteUserPrompts?.(userId));

  logger.info('[internal/cleanup] user deleted', { clerkUserId, userId });
  return res.status(200).json({ ok: true, status: 'deleted' });
});

async function runBestEffort(label, fn) {
  try {
    await fn();
  } catch (err) {
    logger.error(`[internal/cleanup] ${label} failed`, { err });
  }
}

module.exports = router;
