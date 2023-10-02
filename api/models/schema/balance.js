const mongoose = require('mongoose');

const balanceSchema = mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    required: true,
  },
  // 1000 tokenCredits = 1 mill ($0.001 USD)
  tokenCredits: {
    type: Number,
    default: 0,
  },
});

module.exports = balanceSchema;
