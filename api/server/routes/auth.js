const express = require('express');
const {
  resetPasswordRequestController,
  resetPasswordController,
  refreshController,
  registrationController,
} = require('../controllers/AuthController');
const { loginController } = require('../controllers/auth/LoginController');
const { logoutController } = require('../controllers/auth/LogoutController');
const {
  loginLimiter,
  registerLimiter,
  requireJwtAuth,
  requireLocalAuth,
  validateRegistration,
} = require('../middleware');

const router = express.Router();

//Local
router.post('/logout', requireJwtAuth, logoutController);
router.post('/login', loginLimiter, requireLocalAuth, loginController);
router.post('/refresh', refreshController);
router.post('/register', registerLimiter, validateRegistration, registrationController);
router.post('/requestPasswordReset', resetPasswordRequestController);
router.post('/resetPassword', resetPasswordController);

module.exports = router;
