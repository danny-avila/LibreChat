const mongoose = require('mongoose');

const conversationTagSchema = mongoose.Schema(
  {
    tag: {
      type: String,
      index: true,
    },
    user: {
      type: String,
      index: true,
    },
    description: {
      type: String,
      index: true,
    },
    count: {
      type: Number,
      default: 0,
    },
    position: {
      type: Number,
      default: 0,
      index: true,
    },
  },
  { timestamps: true },
);

conversationTagSchema.index({ tag: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('ConversationTag', conversationTagSchema);
