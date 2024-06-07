const express = require('express');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const canDeleteAccount = require('~/server/middleware/canDeleteAccount');
const {
  getUserController,
  deleteUserController,
  updateUserPluginsController,
} = require('~/server/controllers/UserController');

const router = express.Router();

router.get('/', requireJwtAuth, getUserController);
router.post('/plugins', requireJwtAuth, updateUserPluginsController);
router.delete('/delete', requireJwtAuth, canDeleteAccount, deleteUserController);

module.exports = router;
