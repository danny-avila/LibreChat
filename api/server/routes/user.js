const express = require('express');
const requireJwtAuth = require('../middleware/requireJwtAuth');
const canDeleteAccount = require('../middleware/canDeleteAccount');
const {
  getUserController,
  updateUserPluginsController,
  deleteUserController,
} = require('../controllers/UserController');

const router = express.Router();

router.get('/', requireJwtAuth, getUserController);
router.post('/plugins', requireJwtAuth, updateUserPluginsController);
router.delete('/delete', requireJwtAuth, canDeleteAccount, deleteUserController);

module.exports = router;
