const express = require('express');
const {
  resetPasswordRequestController,
  resetPasswordController,
  // refreshController,
  registrationController,
} = require('../controllers/AuthController');
const { loginController } = require('../controllers/auth/LoginController');
const { logoutController } = require('../controllers/auth/LogoutController');
const { requireJwtAuth, requireLocalAuth, validateRegistration } = require('../middleware');

const router = express.Router();

//Local
router.post('/logout', requireJwtAuth, logoutController);
router.post('/login', requireLocalAuth, loginController);
// router.post('/refresh', requireJwtAuth, refreshController);
router.post('/register', validateRegistration, registrationController);
router.post('/requestPasswordReset', resetPasswordRequestController);
router.post('/resetPassword', resetPasswordController);

module.exports = router;
