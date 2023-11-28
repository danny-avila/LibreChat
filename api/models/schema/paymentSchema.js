// paymentSchema.js
const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  planId: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    required: true
  },
  paymentId: {
    type: String,
    required: true
  },
  paymentReference: {
    type: String,
    required: true
  },
  paymentMethod: {
    type: String,
    required: true
  },
  paymentStatus: {
    type: String,
    required: true
  },
  subscriptionStartDate: {
    type: Date,
    required: true
  },
  expirationDate: {
    type: Date,
    required: true
  }
}, { timestamps: true });

module.exports = paymentSchema;