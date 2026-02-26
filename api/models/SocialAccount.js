const mongoose = require('mongoose');

const socialAccountSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    platform: {
      type: String,
      required: true,
      enum: ['linkedin', 'x', 'instagram', 'facebook', 'tiktok', 'youtube', 'pinterest'],
    },
    
    postizIntegrationId: {
      type: String,
      required: true,
      unique: true,
    },
    accountName: {
      type: String,
      required: true,
    },
    accountId: {
      type: String,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    lastUsed: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for user + platform (one account per platform per user)
socialAccountSchema.index({ userId: 1, platform: 1 }, { unique: true });

// Index for quick lookups by integration ID
socialAccountSchema.index({ postizIntegrationId: 1 });

const SocialAccount = mongoose.model('SocialAccount', socialAccountSchema);

module.exports = SocialAccount;
