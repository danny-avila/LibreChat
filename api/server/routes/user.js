const express = require('express');
const requireJwtAuth = require('../middleware/requireJwtAuth');
const {
  getUserController,
  updateUserPluginsController,
  getUserLastTokenClaimTimestamp,
  claimTokens,
} = require('../controllers/UserController');

const router = express.Router();

router.get('/', requireJwtAuth, getUserController);
router.post('/plugins', requireJwtAuth, updateUserPluginsController);
router.get('/last-token-claim', requireJwtAuth, getUserLastTokenClaimTimestamp);
router.post('/claim-tokens', requireJwtAuth, claimTokens);

module.exports = router;
