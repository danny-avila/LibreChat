const express = require('express');
const { logger } = require('@librechat/data-schemas');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const { countTokens } = require('~/server/utils');

const router = express.Router();

router.post('/', requireJwtAuth, async (req, res) => {
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
