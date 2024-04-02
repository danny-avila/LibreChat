// routes/openNodePayment.js

const express = require('express');
const OpenNodeController = require('../controllers/OpenNodeController');
const router = express.Router();

router.post('/create-bitcoin-charge', OpenNodeController.createBitcoinCharge);
router.post('/callback', OpenNodeController.handleOpenNodeCallback);

module.exports = router;
