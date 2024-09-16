const { logger } = require('~/config');
const mongoose = require('mongoose');

const shareSchema = mongoose.Schema(
  {
    conversationId: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      index: true,
    },
    user: {
      type: String,
      index: true,
    },
    messages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
    shareId: {
      type: String,
      index: true,
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    isVisible: {
      type: Boolean,
      default: false,
    },
    isAnonymous: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

const SharedLink = mongoose.model('SharedLink', shareSchema);

SharedLink.on('index', (error) => {
  if (error) {
    logger.error(`Failed to create SharedLink index ${error}`);
  }
});

module.exports = SharedLink;
