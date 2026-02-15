const express = require('express');
const router = express.Router();
const { getBalanceController, adminGetBalanceController, adminSetBalanceController, adminAddBalanceController} = require('../controllers/Balance');
const { requireJwtAuth } = require('../middleware/');
const requireApiKeyAuth = require('../middleware/requireApiKeyAuth');

// app balance routes
router.get('/', requireJwtAuth, getBalanceController);

// admin balance routes
router.post('/admin/set-balance', requireApiKeyAuth, adminSetBalanceController);
router.post('/admin/add-balance', requireApiKeyAuth, adminAddBalanceController);
router.get('/admin/get-balance', requireApiKeyAuth, adminGetBalanceController);

module.exports = router;
