const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('../middleware/');
const {
  getMailConnectionStatus,
  initiateMailOAuth,
  handleMailOAuthCallback,
  disconnectMailProvider,
} = require('../controllers/MailOAuthController');

router.get('/status', requireJwtAuth, getMailConnectionStatus);
router.get('/connect/:provider', requireJwtAuth, initiateMailOAuth);
router.get('/callback/:provider', handleMailOAuthCallback);
router.post('/disconnect/:provider', requireJwtAuth, disconnectMailProvider);

module.exports = router;
