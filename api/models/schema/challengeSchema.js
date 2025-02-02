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
  // Automatically deletes the document 5 minutes after creation
  createdAt: {
    type: Date,
    default: Date.now,
    index: {
      expires: '5m',
    },
  },
});

module.exports = challengeSchema;