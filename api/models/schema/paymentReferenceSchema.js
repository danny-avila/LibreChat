// paymentReferenceSchema.js
const mongoose = require('mongoose');

const paymentReferenceSchema = new mongoose.Schema({
  paymentReference: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    default: 'pending'
  }
});

module.exports = paymentReferenceSchema;