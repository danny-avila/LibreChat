const express = require('express');
const { requireJwtAuth, canDeleteAccount, verifyEmailLimiter } = require('~/server/middleware');
const {
  getUserController,
  getUsersController,
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
router.get('/list', requireJwtAuth, getUsersController);

module.exports = router;
