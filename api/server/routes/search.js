const express = require('express');
const { isEnabled } = require('@librechat/api');
const { isChatSearchReady } = require('~/server/services/Search');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');

const router = express.Router();

router.use(requireJwtAuth);

/**
 * Capability probe for every chat-search surface in the client.
 *
 * Reports the backend the search routes actually resolve candidates through,
 * whichever that is. Probing Meilisearch specifically would hide conversation,
 * archived-chat and shared-link search from a PostgreSQL deployment whose reader
 * is perfectly healthy — the routes would work and the UI would never offer
 * them.
 *
 * `SEARCH` stays the operator's master switch, and the response stays a bare
 * boolean: the client reads it as one.
 */
router.get('/enable', async function (req, res) {
  if (!isEnabled(process.env.SEARCH)) {
    return res.send(false);
  }

  return res.send(await isChatSearchReady());
});

module.exports = router;
