const { logger } = require('~/config');
const { DownloadToken } = require('~/models');

/**
 * Token Storage Service for managing download tokens in the database
 */
class TokenStorageService {
  /**
   * Find a valid token by hash
   * @param {string} tokenHash - Hashed token to find
   * @returns {Promise<Object|null>} Token document or null
   */
  static async findValidToken(tokenHash) {
    try {
      return await DownloadToken.findValidToken(tokenHash);
    } catch (error) {
      logger.error('Failed to find valid token', {
        tokenHash: tokenHash.substring(0, 8) + '...',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Store a new download token
   * @param {Object} tokenData - Token data to store
   * @returns {Promise<Object>} Stored token document
   */
  static async storeToken(tokenData) {
    const detailedLogging = process.env.TEMP_DOWNLOAD_DETAILED_LOGGING === 'true';

    try {
      if (detailedLogging) {
        console.log('[TokenStorageService] Attempting to store download token', {
          fileId: tokenData.fileId,
          userId: tokenData.userId,
          tokenDataKeys: Object.keys(tokenData),
          hasDownloadTokenModel: !!DownloadToken,
          mongooseConnectionState: require('mongoose').connection.readyState,
          tokenData: JSON.stringify(tokenData, null, 2)
        });
      }

      const downloadToken = new DownloadToken(tokenData);

      if (detailedLogging) {
        console.log('[TokenStorageService] DownloadToken instance created, attempting save', {
          fileId: tokenData.fileId,
          userId: tokenData.userId,
          validationErrors: downloadToken.validateSync()
        });
      }

      await downloadToken.save();

      if (detailedLogging) {
        console.log('[TokenStorageService] Download token stored successfully', {
          fileId: tokenData.fileId,
          userId: tokenData.userId,
          expiresAt: tokenData.expiresAt,
          singleUse: tokenData.singleUse
        });
      } else {
        logger.debug('Download token stored', {
          fileId: tokenData.fileId,
          userId: tokenData.userId,
          expiresAt: tokenData.expiresAt,
          singleUse: tokenData.singleUse
        });
      }

      return downloadToken;
    } catch (error) {
      if (detailedLogging) {
        console.error('[TokenStorageService] Failed to store download token', {
          fileId: tokenData.fileId,
          userId: tokenData.userId,
          error: error.message,
          stack: error.stack,
          errorName: error.name,
          errorCode: error.code,
          mongooseConnectionState: require('mongoose').connection.readyState,
          tokenData: JSON.stringify(tokenData, null, 2)
        });
      }

      logger.error('Failed to store download token', {
        fileId: tokenData.fileId,
        userId: tokenData.userId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Mark a token as used
   * @param {string} tokenHash - Hash of the token to mark as used
   * @returns {Promise<Object|null>} Updated token document
   */
  static async markTokenAsUsed(tokenHash) {
    try {
      const token = await DownloadToken.findOne({ tokenHash });
      
      if (!token) {
        return null;
      }
      
      await token.markAsUsed();
      
      logger.debug('Token marked as used', {
        tokenId: token._id,
        fileId: token.fileId,
        userId: token.userId
      });
      
      return token;
    } catch (error) {
      logger.error('Failed to mark token as used', {
        tokenHash: tokenHash.substring(0, 8) + '...',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Revoke a token by ID
   * @param {string} tokenId - Token ID to revoke
   * @param {string} userId - User ID (for authorization)
   * @returns {Promise<boolean>} Success status
   */
  static async revokeToken(tokenId, userId) {
    try {
      const result = await DownloadToken.findOneAndUpdate(
        { _id: tokenId, userId },
        { used: true, downloadedAt: new Date() },
        { new: true }
      );
      
      if (!result) {
        return false;
      }
      
      logger.info('Token revoked', {
        tokenId,
        userId,
        fileId: result.fileId
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to revoke token', {
        tokenId,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get user's download tokens
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of token documents
   */
  static async getUserTokens(userId, options = {}) {
    try {
      const {
        limit = 50,
        skip = 0,
        includeExpired = false,
        includeUsed = false
      } = options;

      const query = { userId };
      
      if (!includeExpired) {
        query.expiresAt = { $gt: new Date() };
      }
      
      if (!includeUsed) {
        query.used = false;
      }

      const tokens = await DownloadToken.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .select('fileId expiresAt used singleUse createdAt downloadedAt downloadCount metadata');

      return tokens;
    } catch (error) {
      logger.error('Failed to get user tokens', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Clean up expired tokens
   * @returns {Promise<number>} Number of tokens cleaned up
   */
  static async cleanupExpiredTokens() {
    try {
      const result = await DownloadToken.cleanupExpiredTokens();
      
      if (result.deletedCount > 0) {
        logger.info('Cleaned up expired tokens', {
          deletedCount: result.deletedCount
        });
      }
      
      return result.deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup expired tokens', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get token statistics
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Token statistics
   */
  static async getTokenStatistics(options = {}) {
    try {
      const { timeframe = 24 } = options; // hours
      const since = new Date(Date.now() - timeframe * 60 * 60 * 1000);

      const stats = await DownloadToken.aggregate([
        {
          $facet: {
            total: [
              { $count: 'count' }
            ],
            recent: [
              { $match: { createdAt: { $gte: since } } },
              { $count: 'count' }
            ],
            used: [
              { $match: { used: true } },
              { $count: 'count' }
            ],
            expired: [
              { $match: { expiresAt: { $lt: new Date() } } },
              { $count: 'count' }
            ],
            active: [
              {
                $match: {
                  expiresAt: { $gt: new Date() },
                  $or: [
                    { singleUse: false },
                    { singleUse: true, used: false }
                  ]
                }
              },
              { $count: 'count' }
            ]
          }
        }
      ]);

      const result = {
        total: stats[0].total[0]?.count || 0,
        recent: stats[0].recent[0]?.count || 0,
        used: stats[0].used[0]?.count || 0,
        expired: stats[0].expired[0]?.count || 0,
        active: stats[0].active[0]?.count || 0,
        timeframe: `${timeframe} hours`,
        timestamp: new Date().toISOString()
      };

      return result;
    } catch (error) {
      logger.error('Failed to get token statistics', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get file download statistics
   * @param {string} fileId - File ID
   * @returns {Promise<Object>} File download statistics
   */
  static async getFileDownloadStats(fileId) {
    try {
      const stats = await DownloadToken.aggregate([
        { $match: { fileId } },
        {
          $group: {
            _id: null,
            totalTokens: { $sum: 1 },
            usedTokens: { $sum: { $cond: ['$used', 1, 0] } },
            totalDownloads: { $sum: '$downloadCount' },
            firstDownload: { $min: '$createdAt' },
            lastDownload: { $max: '$downloadedAt' }
          }
        }
      ]);

      return stats[0] || {
        totalTokens: 0,
        usedTokens: 0,
        totalDownloads: 0,
        firstDownload: null,
        lastDownload: null
      };
    } catch (error) {
      logger.error('Failed to get file download statistics', {
        fileId,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = TokenStorageService;
