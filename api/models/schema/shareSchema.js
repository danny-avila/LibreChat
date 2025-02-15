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
      default: true,
    },
    // --- Field for re-encrypting the conversation key for the forked user ---
    encryptionKeys: [
      {
        user: { type: String, index: true },
        encryptedKey: { type: String },
      },
    ],
  },
  { timestamps: true },
);

module.exports = mongoose.model('SharedLink', shareSchema);
