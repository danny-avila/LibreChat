const express = require('express');
const PayPalController = require('../controllers/PayPalController');
const router = express.Router();

// Route for creating a PayPal payment
router.post('/create-payment', PayPalController.createPayment);

// Route for executing a PayPal payment after approval
router.post('/execute-payment', PayPalController.executePayment);

// Route for handling PayPal webhook events
router.post('/webhook', PayPalController.handleWebhook);

module.exports = router;
