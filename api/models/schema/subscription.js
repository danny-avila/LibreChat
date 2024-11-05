const mongoose = require('mongoose');

const subscriptionSchema = mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  subscriptionPlan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubscriptionPlan',
    required: true,
  },
  startDate: {
    type: Date,
    default: Date.now,
  },
  endDate: {
    type: Date,
    required: true, // Set based on durationInDays of the subscription plan
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'cancelled'],
    default: 'active',
  },
  tokenCredits: {
    type: Number,
    default: 0, // Number of token credits at the start, typically set from the subscription plan
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = subscriptionSchema;
