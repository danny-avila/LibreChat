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
    
    // DEPRECATED: For Postiz integration (kept for backward compatibility, will be removed in future)
    // New integrations should use direct OAuth (accessToken, refreshToken, expiresAt)
    postizIntegrationId: {
      type: String,
      sparse: true, // Allow null values
    },
    
    // For direct API integrations (LinkedIn, etc.)
    accessToken: {
      type: String,
    },
    refreshToken: {
      type: String,
    },
    expiresAt: {
      type: Date,
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

// Index for quick lookups by integration ID (sparse to allow nulls)
socialAccountSchema.index({ postizIntegrationId: 1 }, { sparse: true });

const SocialAccount = mongoose.model('SocialAccount', socialAccountSchema);

module.exports = SocialAccount;
