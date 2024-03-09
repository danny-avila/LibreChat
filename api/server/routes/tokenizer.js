const express = require('express');
const router = express.Router();
const { setCurrentUser, requireSubscription } = require('~/server/middleware');
const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');
const { countTokens } = require('~/server/utils');
const { logger } = require('~/config');

router.use(ClerkExpressRequireAuth(), setCurrentUser, requireSubscription);
router.post('/', async (req, res) => {
  try {
    const { arg } = req.body;
    const count = await countTokens(arg?.text ?? arg);
    res.send({ count });
  } catch (e) {
    logger.error('[/tokenizer] Error counting tokens', e);
    res.status(500).json('Error counting tokens');
  }
});

module.exports = router;
