const mongoose = require('mongoose');

const balanceSchema = mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    required: true,
  },
  tokens: {
    type: Number,
    default: 0,
  },
});

module.exports = balanceSchema;
