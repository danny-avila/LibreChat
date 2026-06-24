const express = require('express');
const mongoose = require('mongoose');
const { createStripePaymentHandlers } = require('@librechat/api');
const { createTransaction } = require('~/models');
const { requireJwtAuth } = require('~/server/middleware');
const { getAppConfig } = require('~/server/services/Config');

const router = express.Router();

const getPaymentModel = () => mongoose.models.Payment;

const handlers = createStripePaymentHandlers({
  getAppConfig,
  createTransaction,
  createPayment: async (fields) => {
    const Payment = getPaymentModel();
    return Payment.findOneAndUpdate(
      { checkoutSessionId: fields.checkoutSessionId },
      { $setOnInsert: fields },
      { upsert: true, new: true },
    ).lean();
  },
  getPaymentByProviderEventId: async (providerEventId) => {
    const Payment = getPaymentModel();
    return Payment.findOne({ providerEventId }).lean();
  },
  claimPayment: async ({ checkoutSessionId, providerEventId, paymentIntentId }) => {
    const Payment = getPaymentModel();
    return Payment.findOneAndUpdate(
      {
        checkoutSessionId,
        status: { $in: ['pending', 'failed'] },
      },
      {
        $set: {
          status: 'processing',
          providerEventId,
          paymentIntentId,
        },
      },
      { new: true },
    ).lean();
  },
  updatePaymentByCheckoutSessionId: async (checkoutSessionId, fields) => {
    const Payment = getPaymentModel();
    return Payment.findOneAndUpdate(
      { checkoutSessionId },
      { $set: fields },
      { new: true },
    ).lean();
  },
});

router.post('/stripe/session', requireJwtAuth, handlers.createCheckoutSession);
router.post('/stripe/webhook', handlers.handleWebhook);

module.exports = router;