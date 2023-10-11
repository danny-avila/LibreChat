const express = require('express');
const PaymentController = require('../controllers/PaymentController'); // Ensure this path is correct
const router = express.Router();

function rawBodySaver(req, res, buf, encoding) {
  if (buf && buf.length) {
    req.rawBody = buf.toString(encoding || 'utf8');
  }
}

function rawMiddleware(req, res, next) {
  express.raw({ type: 'application/json', verify: rawBodySaver })(req, res, (err) => {
    if (err) {
      next(err);
    } else {
      next();
    }
  });
}

router.post('/create-checkout-session', PaymentController.createPaymentIntent);

router.post(
  '/webhook',
  rawMiddleware, // Apply rawMiddleware only to this route
  PaymentController.handleWebhook,
);

module.exports = router;
