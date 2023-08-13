const express = require('express');
const {
  getAppConfigController,
  updateAppConfigController,
} = require('../controllers/AppConfigController');
const requireJwtAuth = require('../../middleware/requireJwtAuth');

const router = express.Router();

router.get('/', requireJwtAuth, getAppConfigController);
router.post('/', requireJwtAuth, updateAppConfigController);

module.exports = router;
