const crypto = require('crypto');
const { logger } = require('~/config');
const TokenStorageService = require('./TokenStorageService');

/**
 * URL Generator Service for temporary file downloads
 * Handles secure token generation and validation for time-limited file access
 */
class UrlGeneratorService {
  constructor() {
    this.secretKey = process.env.TEMP_DOWNLOAD_SECRET_KEY || 'default-secret-key-for-development-only';
    this.defaultTtl = parseInt(process.env.TEMP_DOWNLOAD_DEFAULT_TTL) || 600; // 10 minutes
    this.maxTtl = parseInt(process.env.TEMP_DOWNLOAD_MAX_TTL) || 3600; // 1 hour
    this.minTtl = parseInt(process.env.TEMP_DOWNLOAD_MIN_TTL) || 60; // 1 minute

    if (this.secretKey === 'default-secret-key-for-development-only') {
      logger.warn('Using default secret key for temporary downloads. Set TEMP_DOWNLOAD_SECRET_KEY in production.');
    }

    if (this.secretKey.length < 32) {
      logger.warn('TEMP_DOWNLOAD_SECRET_KEY should be at least 32 characters long for security');
    }
  }

  /**
   * Generate a secure download URL for a file
   * @param {string} fileId - The file ID
   * @param {Object} options - Configuration options
   * @param {number} options.ttlSeconds - Time to live in seconds
   * @param {boolean} options.singleUse - Whether token is single-use
   * @param {string} options.userId - User ID requesting the download
   * @param {string} options.clientIP - Client IP address
   * @param {string} options.userAgent - User agent string
   * @param {string} options.requestId - Request ID for tracking
   * @param {string} options.mcpClientId - MCP client ID if applicable
   * @param {Object} options.metadata - Additional metadata
   * @returns {Promise<Object>} Download URL and token information
   */
  async generateDownloadUrl(fileId, options = {}) {
    try {
      logger.debug('[UrlGeneratorService] Starting generateDownloadUrl', {
        fileId,
        optionsKeys: Object.keys(options),
        secretKeyLength: this.secretKey.length
      });

      const {
        ttlSeconds = this.defaultTtl,
        singleUse = true,
        userId,
        clientIP,
        userAgent,
        requestId,
        mcpClientId,
        metadata = {}
      } = options;

      // Validate inputs
      this._validateFileId(fileId);
      this._validateTtl(ttlSeconds);
      this._validateUserId(userId);
      this._validateClientIP(clientIP);

      // Generate token
      const token = await this.generateToken(fileId, ttlSeconds, {
        singleUse,
        userId,
        clientIP,
        userAgent,
        requestId,
        mcpClientId,
        metadata
      });

      // Store token in database
      const tokenHash = this._hashToken(token);
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

      if (process.env.TEMP_DOWNLOAD_DETAILED_LOGGING === 'true') {
        console.log('[UrlGeneratorService] Preparing to store token', {
          fileId,
          userId,
          clientIP,
          ttlSeconds,
          expiresAt,
          hasTokenStorageService: !!TokenStorageService,
          tokenHashLength: tokenHash.length
        });
      }

      await TokenStorageService.storeToken({
        fileId,
        tokenHash,
        expiresAt,
        used: false,
        singleUse,
        userId,
        clientIP,
        userAgent,
        requestId,
        mcpClientId,
        metadata
      });

      // Generate download URL
      const baseUrl = process.env.DOMAIN_SERVER || 'http://localhost:3080';
      const downloadUrl = `${baseUrl}/api/files/download/${fileId}?token=${encodeURIComponent(token)}&t=${Date.now()}`;

      logger.info('Generated download URL', {
        fileId,
        userId,
        clientIP,
        ttlSeconds,
        singleUse,
        requestId
      });

      return {
        downloadUrl,
        token,
        expiresAt,
        singleUse,
        ttlSeconds
      };

    } catch (error) {
      if (process.env.TEMP_DOWNLOAD_DETAILED_LOGGING === 'true') {
        console.error('[UrlGeneratorService] Failed to generate download URL', {
          fileId,
          userId: options.userId,
          error: error.message,
          stack: error.stack,
          errorName: error.name,
          errorCode: error.code,
          options: JSON.stringify(options, null, 2)
        });
      }

      logger.error('Failed to generate download URL', {
        fileId,
        userId: options.userId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Generate a secure token for file access
   * @param {string} fileId - The file ID
   * @param {number} ttlSeconds - Time to live in seconds
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<string>} Base64url encoded token
   */
  async generateToken(fileId, ttlSeconds, metadata = {}) {
    const payload = {
      fileId,
      expires: Date.now() + (ttlSeconds * 1000),
      nonce: crypto.randomBytes(16).toString('hex'),
      ...metadata
    };

    const payloadString = JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', this.secretKey)
      .update(payloadString)
      .digest('hex');

    const token = {
      payload: Buffer.from(payloadString).toString('base64url'),
      signature
    };

    return Buffer.from(JSON.stringify(token)).toString('base64url');
  }

  /**
   * Validate and decode a token
   * @param {string} token - The token to validate
   * @returns {Promise<Object>} Decoded token payload
   */
  async validateToken(token) {
    try {
      const tokenData = JSON.parse(Buffer.from(token, 'base64url').toString());
      const payloadString = Buffer.from(tokenData.payload, 'base64url').toString();
      const payload = JSON.parse(payloadString);

      // Verify signature
      const expectedSignature = crypto
        .createHmac('sha256', this.secretKey)
        .update(payloadString)
        .digest('hex');

      if (tokenData.signature !== expectedSignature) {
        throw new Error('Invalid token signature');
      }

      // Check expiration
      if (Date.now() > payload.expires) {
        throw new Error('Token has expired');
      }

      return payload;
    } catch (error) {
      throw new Error(`Invalid token: ${error.message}`);
    }
  }

  /**
   * Expose hash token method for external use
   * @param {string} token - Token to hash
   * @returns {string} Hashed token
   */
  static _hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Hash a token for storage (instance method)
   * @param {string} token - Token to hash
   * @returns {string} Hashed token
   * @private
   */
  _hashToken(token) {
    return UrlGeneratorService._hashToken(token);
  }

  /**
   * Validate file ID
   * @param {string} fileId - File ID to validate
   * @private
   */
  _validateFileId(fileId) {
    if (!fileId || typeof fileId !== 'string' || fileId.trim().length === 0) {
      throw new Error('Valid file ID is required');
    }
  }

  /**
   * Validate TTL
   * @param {number} ttlSeconds - TTL to validate
   * @private
   */
  _validateTtl(ttlSeconds) {
    if (typeof ttlSeconds !== 'number' || ttlSeconds < this.minTtl || ttlSeconds > this.maxTtl) {
      throw new Error(`TTL must be between ${this.minTtl} and ${this.maxTtl} seconds`);
    }
  }

  /**
   * Validate user ID
   * @param {string} userId - User ID to validate
   * @private
   */
  _validateUserId(userId) {
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      throw new Error('Valid user ID is required');
    }
  }

  /**
   * Validate client IP
   * @param {string} clientIP - Client IP to validate
   * @private
   */
  _validateClientIP(clientIP) {
    if (!clientIP || typeof clientIP !== 'string' || clientIP.trim().length === 0) {
      throw new Error('Valid client IP is required');
    }
  }
}

module.exports = new UrlGeneratorService();
