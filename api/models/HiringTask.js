const mongoose = require('mongoose');

const hiringTaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: '' },
    status: {
      type: String,
      enum: ['todo', 'in_progress', 'review', 'done'],
      default: 'todo',
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model('HiringTask', hiringTaskSchema);
