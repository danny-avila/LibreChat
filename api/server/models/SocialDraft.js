const mongoose = require('mongoose');

const SocialDraftSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    drafts: {
      linkedin: { type: String, default: '' },
      x: { type: String, default: '' },
      instagram: { type: String, default: '' },
      facebook: { type: String, default: '' },
      farcaster: { type: String, default: '' },
    },
    resumeUrl: {
      type: String,
      required: true,
    },
    executionId: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    selectedPlatforms: [String],
    rawIdea: { type: String, default: '' },
    ideaId: { type: String, default: '' },
  },
  {
    timestamps: true,
  },
);

SocialDraftSchema.index({ userId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('SocialDraft', SocialDraftSchema);
