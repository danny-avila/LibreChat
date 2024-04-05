const mongoose = require('mongoose');

const convoTokenSchema = mongoose.Schema({
  inputTokens: {
    type: Number,
    required: true,
  },
  outputTokens: {
    type: Number,
    required: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  endpoint: {
    type: String,
    enum: ['openAI', 'bingAI', 'anthropic', 'google', 'sdImage'],
    required: true,
  },
  model: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const ConvoToken = mongoose.model('ConvoToken', convoTokenSchema);

module.exports = ConvoToken;
