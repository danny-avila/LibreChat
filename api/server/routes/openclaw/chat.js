const express = require('express');
const { openClawChatHandler } = require('@librechat/api');
const { moderateText, validateConvoAccess, buildEndpointOption } = require('~/server/middleware');

const router = express.Router();

router.use(moderateText);
router.use(validateConvoAccess);
router.use(buildEndpointOption);

/**
 * @route POST /
 * @desc Chat with OpenClaw agent
 * @access Private
 */
router.post('/', async (req, res, next) => {
  try {
    await openClawChatHandler(req, res);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
