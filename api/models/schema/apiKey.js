const mongoose = require('mongoose');

const apiKeySchema = mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  key: {
    type: String,
    required: true,
  },
  expiresAt: {
    type: Date,
  },
});

module.exports = apiKeySchema;
