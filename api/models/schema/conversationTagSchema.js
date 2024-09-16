const { logger } = require('~/config');
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
    },
  },
  { timestamps: true },
);

conversationTagSchema.index({ tag: 1, user: 1 }, { unique: true });

const ConversationTag = mongoose.model('ConversationTag', conversationTagSchema);

ConversationTag.on('index', (error) => {
  if (error) {
    logger.error(`Failed to create ConversationTag index ${error}`);
  }
});

module.exports = ConversationTag;
