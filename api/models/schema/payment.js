const mongoose = require('mongoose');

const paymentSchema = mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  subscriptionPlanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubscriptionPlan',
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  transactionId: {
    type: String,
    unique: true,
    required: true,
  },
  provider: {
    type: String,
    required: true,
    enum: ['zarinpal', 'paypal', 'stripe', 'other'], // List of payment providers
  },
  status: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending',
  },
  paymentDate: {
    type: Date,
    default: Date.now,
  },
  callbackUrl: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = paymentSchema;
