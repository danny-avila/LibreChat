const express = require('express');
const { requireJwtAuth, checkAdmin, canDeleteAccount, verifyEmailLimiter } = require('~/server/middleware');
const {
  getUserController,
  getUsersController,
  deleteUserController,
  deleteUserByEmailController,
  verifyEmailController,
  updateUserPluginsController,
  resendVerificationController,
  getTermsStatusController,
  acceptTermsController,
} = require('~/server/controllers/UserController');

const router = express.Router();

router.get('/', requireJwtAuth, getUserController);
router.get('/terms', requireJwtAuth, getTermsStatusController);
router.post('/terms/accept', requireJwtAuth, acceptTermsController);
router.post('/plugins', requireJwtAuth, updateUserPluginsController);
router.delete('/delete', requireJwtAuth, canDeleteAccount, deleteUserController);
router.post('/verify', verifyEmailController);
router.post('/verify/resend', verifyEmailLimiter, resendVerificationController);
router.get('/list', requireJwtAuth, checkAdmin, getUsersController);
router.post('/deleteByEmail', requireJwtAuth, checkAdmin, deleteUserByEmailController);

module.exports = router;
