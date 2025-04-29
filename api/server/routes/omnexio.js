const express = require('express');
const router = express.Router();
const omnexioBalanceController = require('../controllers/omnexio/OmnexioBalance');
const { requireJwtAuth } = require('../middleware/');

router.get('/balance', requireJwtAuth, omnexioBalanceController);

module.exports = router;
