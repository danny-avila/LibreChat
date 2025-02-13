const mongoose = require('mongoose');

const shareSchema = new mongoose.Schema(
  {
    shareId: {
      type: String,
      required: true,
      unique: true,
    },
    conversationId: {
      type: String,
      required: true,
    },
    user: {
      type: String,
      required: true,
    },
    messages: [mongoose.Schema.Types.Mixed], // Store messages directly
    isPublic: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

const SharedLink = mongoose.models.SharedLink || mongoose.model('SharedLink', shareSchema);

module.exports = SharedLink;