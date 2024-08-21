const {
  remoteAddAssistant,
  verifyToken,
  remoteRemoveAssistant,
} = require('../../../custom/customEndpoints'); // Added line
const express = require('express');
const { requireJwtAuth, canDeleteAccount, verifyEmailLimiter } = require('~/server/middleware');
const {
  getUserController,
  deleteUserController,
  verifyEmailController,
  updateUserPluginsController,
  resendVerificationController,
} = require('~/server/controllers/UserController');

const router = express.Router();

router.get('/', requireJwtAuth, getUserController);
router.post('/plugins', requireJwtAuth, updateUserPluginsController);
router.delete('/delete', requireJwtAuth, canDeleteAccount, deleteUserController);
router.post('/verify', verifyEmailController);
router.post('/verify/resend', verifyEmailLimiter, resendVerificationController);

router.post('/remote/add-assistant', verifyToken, remoteAddAssistant); // Added line
router.post('/remote/remove-assistant', verifyToken, remoteRemoveAssistant); // Added line

module.exports = router;
