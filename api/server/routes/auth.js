const express = require('express');
const {
  resetPasswordRequestController,
  resetPasswordController,
  getUserController,
  refreshController,
  registrationController
} = require('../controllers/auth.controller');
const { loginController } = require('../controllers/auth/login.controller');
const { logoutController } = require('../controllers/auth/logout.controller');
const requireJwtAuth = require('../../middleware/requireJwtAuth');
const requireLocalAuth = require('../../middleware/requireLocalAuth');

const router = express.Router();

//Local
router.get('/user', requireJwtAuth, getUserController);
router.post('/logout', requireJwtAuth, logoutController);
router.post('/login', requireLocalAuth, loginController);
router.post('/refresh', requireJwtAuth, refreshController);
if (process.env.ALLOW_REGISTRATION) {
  router.post('/register', registrationController);
}
router.post('/requestPasswordReset', resetPasswordRequestController);
router.post('/resetPassword', resetPasswordController);

module.exports = router;
