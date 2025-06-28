const mongoose = require('mongoose');

/**
 * Schema for temporary download tokens
 * Used to track and validate file download access
 */
const downloadTokenSchema = new mongoose.Schema(
  {
    fileId: {
      type: String,
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    used: {
      type: Boolean,
      default: false,
      index: true,
    },
    singleUse: {
      type: Boolean,
      default: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    clientIP: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
    },
    requestId: {
      type: String,
    },
    mcpClientId: {
      type: String,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    downloadedAt: {
      type: Date,
    },
    downloadCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    collection: 'downloadtokens',
  }
);

// Compound indexes for efficient queries
downloadTokenSchema.index({ fileId: 1, userId: 1 });
downloadTokenSchema.index({ expiresAt: 1, used: 1 });
downloadTokenSchema.index({ mcpClientId: 1, createdAt: -1 });

// TTL index to automatically remove expired tokens
downloadTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Instance methods
downloadTokenSchema.methods.markAsUsed = function() {
  this.used = true;
  this.downloadedAt = new Date();
  this.downloadCount += 1;
  return this.save();
};

downloadTokenSchema.methods.isExpired = function() {
  return Date.now() > this.expiresAt.getTime();
};

downloadTokenSchema.methods.canBeUsed = function() {
  if (this.isExpired()) {
    return false;
  }
  
  if (this.singleUse && this.used) {
    return false;
  }
  
  return true;
};

// Static methods
downloadTokenSchema.statics.findValidToken = function(tokenHash) {
  return this.findOne({
    tokenHash,
    expiresAt: { $gt: new Date() },
    $or: [
      { singleUse: false },
      { singleUse: true, used: false }
    ]
  });
};

downloadTokenSchema.statics.cleanupExpiredTokens = function() {
  return this.deleteMany({
    expiresAt: { $lt: new Date() }
  });
};

downloadTokenSchema.statics.getUserTokenStats = function(userId, timeframe = 24) {
  const since = new Date(Date.now() - timeframe * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        createdAt: { $gte: since }
      }
    },
    {
      $group: {
        _id: null,
        totalTokens: { $sum: 1 },
        usedTokens: { $sum: { $cond: ['$used', 1, 0] } },
        totalDownloads: { $sum: '$downloadCount' }
      }
    }
  ]);
};

// Pre-save middleware
downloadTokenSchema.pre('save', function(next) {
  // Ensure expiresAt is set
  if (!this.expiresAt) {
    this.expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes default
  }
  
  next();
});

// Virtual for time remaining
downloadTokenSchema.virtual('timeRemaining').get(function() {
  const now = Date.now();
  const expires = this.expiresAt.getTime();
  return Math.max(0, expires - now);
});

// Virtual for human-readable status
downloadTokenSchema.virtual('status').get(function() {
  if (this.isExpired()) {
    return 'expired';
  }
  
  if (this.singleUse && this.used) {
    return 'used';
  }
  
  return 'active';
});

// Ensure virtuals are included in JSON output
downloadTokenSchema.set('toJSON', { virtuals: true });
downloadTokenSchema.set('toObject', { virtuals: true });

const DownloadToken = mongoose.model('DownloadToken', downloadTokenSchema);

module.exports = DownloadToken;
