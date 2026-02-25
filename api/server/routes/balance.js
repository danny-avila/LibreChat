const express = require('express');
const router = express.Router();
const controller = require('../controllers/Balance');
const { requireJwtAuth, loginLimiter } = require('../middleware/');

router.get('/', loginLimiter, requireJwtAuth, controller);

module.exports = router;
