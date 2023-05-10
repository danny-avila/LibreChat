const express = require('express');
const {
  resetPasswordRequestController,
  resetPasswordController,
  getUserController,
  loginController,
  logoutController,
  refreshController,
  registrationController,
} = require('../controllers/auth.controller');
const requireJwtAuth = require('../../middleware/requireJwtAuth');
const requireLocalAuth = require('../../middleware/requireLocalAuth');

const router = express.Router();

// Routes with authentication middleware
router.get('/user', requireJwtAuth, getUserController);
router.post('/logout', requireJwtAuth, logoutController);
router.post('/login', requireLocalAuth, loginController);
router.post('/refresh', requireJwtAuth, refreshController);
router.post('/register', registrationController);
router.post('/requestPasswordReset', resetPasswordRequestController);
router.post('/resetPassword', resetPasswordController);

// Error handling middleware
router.use((err, req, res, next) => {
  if (err) {
    console.error(err.stack);
    res.status(500).send('Something broke!');
  }
});

module.exports = router;
