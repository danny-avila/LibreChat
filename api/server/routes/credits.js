// Customize
const express = require('express');
const { getCreditUsageByWeek, getUserCredits } = require('~/server/controllers/CreditController');
const { requireJwtAuth } = require('~/server/middleware');
const router = express.Router();

router.get('/usage', requireJwtAuth, getCreditUsageByWeek);
router.get('/', requireJwtAuth, getUserCredits);

module.exports = router;
