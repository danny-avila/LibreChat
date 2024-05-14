const express = require('express');
const requireJwtAuth = require('../middleware/requireJwtAuth');
const {
  getUserController,
  updateUserPluginsController,
  saveCryptoAdresses,
  sendKarma,
} = require('../controllers/UserController');

const router = express.Router();

router.get('/', requireJwtAuth, getUserController);
router.post('/plugins', requireJwtAuth, updateUserPluginsController);
router.post('/crypto', requireJwtAuth, saveCryptoAdresses);
router.post('/sendkarma', requireJwtAuth, sendKarma);

module.exports = router;
