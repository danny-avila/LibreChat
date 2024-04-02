const express = require('express');
const PaymentController = require('../controllers/PaymentController');
const router = express.Router();

function rawBodySaver(req, res, buf, encoding) {
  if (buf && buf.length) {
    req.rawBody = buf.toString(encoding || 'utf8');
  }
}

function rawMiddleware(req, res, next) {
  express.raw({ type: 'application/json', verify: rawBodySaver })(req, res, next);
}

// Route for creating a Stripe checkout session
router.post('/create-checkout-session', PaymentController.createPaymentIntent);

// Route for handling Stripe webhook events
router.post('/webhook', rawMiddleware, PaymentController.handleWebhook);

module.exports = router;
