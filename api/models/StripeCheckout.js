const mongoose = require('mongoose');

const stripeCheckoutSchema = mongoose.Schema({
  _id: {
    type: String,
    required: true,
  },
  mode: String,
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  currency: String,
  successUrl: String,
  cancelUrl: String,
  plan: {
    type: String,
    enum: ['MONTHLY', 'YEARLY'],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const StripeCheckout = mongoose.model('StripeCheckout', stripeCheckoutSchema);

module.exports = StripeCheckout;
