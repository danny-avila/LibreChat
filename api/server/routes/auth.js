const express = require('express');
const {
  resetPasswordRequestController,
  resetPasswordController,
  verifyEmailController,
  refreshController,
  registrationController,
} = require('../controllers/AuthController');
const { loginController } = require('../controllers/auth/LoginController');
const { logoutController } = require('../controllers/auth/LogoutController');
const {
  checkBan,
  loginLimiter,
  registerLimiter,
  requireJwtAuth,
  requireLocalAuth,
  validateRegistration,
} = require('../middleware');

const router = express.Router();

//Local
router.post('/logout', requireJwtAuth, logoutController);
router.post('/login', loginLimiter, checkBan, requireLocalAuth, loginController);
router.post('/refresh', refreshController);
router.post('/register', registerLimiter, checkBan, validateRegistration, registrationController);
router.post('/requestPasswordReset', resetPasswordRequestController);
router.post('/resetPassword', resetPasswordController);
router.post('/verify', verifyEmailController);

module.exports = router;
