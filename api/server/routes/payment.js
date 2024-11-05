const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { requireJwtAuth } = require('../middleware/');

// Initiate a new payment
router.post('/initiate', requireJwtAuth, paymentController.initiatePaymentController);

// Verify an existing payment
router.post('/verify', requireJwtAuth, paymentController.verifyPaymentController);
router.get('/history', requireJwtAuth, paymentController.getUserPaymentHistoryController);

module.exports = router;
