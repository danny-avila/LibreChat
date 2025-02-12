const mongoose = require('mongoose');

const challengeSchema = mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
  },
  challenge: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: {
      expires: '5m',
    },
  },
});

module.exports = challengeSchema;