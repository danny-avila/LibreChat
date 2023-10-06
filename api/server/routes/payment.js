const express = require('express');
const PaymentController = require('../controllers/PaymentController'); // Ensure this path is correct
const router = express.Router();

// Middleware to capture raw body
function rawBodyBuffer(req, res, buf, encoding) {
  if (buf && buf.length) {
    req.rawBody = buf.toString(encoding || 'utf8');
  }
}

router.post('/create-checkout-session', PaymentController.createPaymentIntent);

// Update this route to use express.raw()
router.post(
  '/webhook',
  express.raw({ type: 'application/json', verify: rawBodyBuffer }),
  PaymentController.handleWebhook,
);

module.exports = router;
