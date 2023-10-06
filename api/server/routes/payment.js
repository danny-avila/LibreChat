// routes/payment.js

const express = require('express');
const PaymentController = require('../controllers/PaymentController');
const router = express.Router();

router.post('/create-payment-intent', PaymentController.createPaymentIntent);
router.post('/webhook', PaymentController.handleWebhook);

module.exports = router;
