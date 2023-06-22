const mongoose = require('mongoose');

const userActivitySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  date: {
    type: Date,
    default: Date.now, // Set default date as now
  },
  messageCount: {
    type: Number,
    default: 0, // Set default message count as 0
  },
});

module.exports = mongoose.model('UserActivity', userActivitySchema);
