const express = require('express');
const requireJwtAuth = require('../middleware/requireJwtAuth');
const {
  getUserController,
  updateUserPluginsController,
  saveCryptoAdresses,
  sendKarma,
  confirmCryptoTip,
  getTipTrack,
  copyCryptoAddress,
  deleteTip,
  muteUser,
} = require('../controllers/UserController');
const { validateUsername } = require('~/server/controllers/AuthController');

const router = express.Router();

router.get('/', requireJwtAuth, getUserController);
router.post('/plugins', requireJwtAuth, updateUserPluginsController);
router.post('/crypto', requireJwtAuth, saveCryptoAdresses);
router.post('/sendkarma', requireJwtAuth, sendKarma);
router.post('/tip', requireJwtAuth, copyCryptoAddress);
router.get('/tip', requireJwtAuth, getTipTrack);
router.delete('/tip/:id', requireJwtAuth, deleteTip);
router.post('/confirmtip', requireJwtAuth, confirmCryptoTip);
router.post('/mute/:userId', requireJwtAuth, muteUser);
router.get('/isusernametaken', validateUsername);

module.exports = router;
