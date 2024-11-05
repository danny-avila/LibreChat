const mongoose = require('mongoose');

const subscriptionPlanSchema = mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  description: {
    type: String,
  },
  price: {
    type: Number,
    required: true,
  },
  durationInDays: {
    type: Number,
    required: true, // e.g., 30 for monthly, 365 for yearly
  },
  tokenCredits: {
    type: Number,
    required: true,
    default: 0, // Number of token credits provided with this plan
  },
  features: {
    type: [String], // Array of features for each plan, stored as strings
    default: [],    // Default to an empty array if no features are specified
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = subscriptionPlanSchema;
