const mongoose = require('mongoose');
const net = require('net');

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

// Enhanced indexes for performance optimization
downloadTokenSchema.index({ userId: 1, createdAt: -1 }); // For getUserTokens queries
downloadTokenSchema.index({ userId: 1, expiresAt: 1, used: 1 }); // For active user tokens
downloadTokenSchema.index({ fileId: 1, createdAt: -1 }); // For file download statistics
downloadTokenSchema.index({ clientIP: 1, createdAt: -1 }); // For IP-based rate limiting
downloadTokenSchema.index({ used: 1, downloadedAt: -1 }); // For usage analytics
downloadTokenSchema.index({ singleUse: 1, used: 1, expiresAt: 1 }); // For findValidToken optimization

// Sparse indexes for optional fields
downloadTokenSchema.index({ downloadedAt: -1 }, { sparse: true }); // Only index documents with downloadedAt
downloadTokenSchema.index({ mcpClientId: 1, expiresAt: 1 }, { sparse: true }); // For MCP client queries

// TTL index to automatically remove expired tokens
downloadTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Ensure indexes are created when the model is first used
downloadTokenSchema.set('autoIndex', true);

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

// Enhanced static methods for better performance
downloadTokenSchema.statics.findActiveTokensByUser = function(userId, limit = 50) {
  return this.find({
    userId,
    expiresAt: { $gt: new Date() },
    $or: [
      { singleUse: false },
      { singleUse: true, used: false }
    ]
  })
  .sort({ createdAt: -1 })
  .limit(limit)
  .select('fileId expiresAt used singleUse createdAt metadata');
};

downloadTokenSchema.statics.countTokensByIP = function(clientIP, timeframe = 1) {
  const since = new Date(Date.now() - timeframe * 60 * 60 * 1000);
  return this.countDocuments({
    clientIP,
    createdAt: { $gte: since }
  });
};

downloadTokenSchema.statics.countTokensByUser = function(userId, timeframe = 1) {
  const since = new Date(Date.now() - timeframe * 60 * 60 * 1000);
  return this.countDocuments({
    userId,
    createdAt: { $gte: since }
  });
};

downloadTokenSchema.statics.countTokensByFile = function(fileId, timeframe = 1) {
  const since = new Date(Date.now() - timeframe * 60 * 60 * 1000);
  return this.countDocuments({
    fileId,
    createdAt: { $gte: since }
  });
};

// Pre-save middleware
downloadTokenSchema.pre('save', function(next) {
  // Ensure expiresAt is set
  if (!this.expiresAt) {
    this.expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes default
  }

  // Validate TTL limits
  const now = Date.now();
  const maxTtl = parseInt(process.env.TEMP_DOWNLOAD_MAX_TTL) || 3600; // 1 hour
  const minTtl = parseInt(process.env.TEMP_DOWNLOAD_MIN_TTL) || 60; // 1 minute

  const ttlSeconds = Math.floor((this.expiresAt.getTime() - now) / 1000);

  if (ttlSeconds > maxTtl) {
    this.expiresAt = new Date(now + maxTtl * 1000);
  } else if (ttlSeconds < minTtl) {
    this.expiresAt = new Date(now + minTtl * 1000);
  }

  // Ensure downloadCount is non-negative
  if (this.downloadCount < 0) {
    this.downloadCount = 0;
  }

  next();
});

// Pre-validate middleware
downloadTokenSchema.pre('validate', function(next) {
  // Validate required fields
  if (!this.fileId || typeof this.fileId !== 'string') {
    return next(new Error('fileId is required and must be a string'));
  }

  if (!this.tokenHash || typeof this.tokenHash !== 'string') {
    return next(new Error('tokenHash is required and must be a string'));
  }

  if (!this.userId) {
    return next(new Error('userId is required'));
  }

  if (!this.clientIP || typeof this.clientIP !== 'string') {
    return next(new Error('clientIP is required and must be a string'));
  }

  // Validate IP address format using Node.js built-in validation
  if (!net.isIP(this.clientIP)) {
    return next(new Error('clientIP must be a valid IPv4 or IPv6 address'));
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
