const { logger } = require('~/config');
const { File } = require('~/db/models');
const UrlGeneratorService = require('~/server/services/Files/UrlGeneratorService');
const TokenStorageService = require('~/server/services/Files/TokenStorageService');
const DownloadService = require('~/server/services/Files/DownloadService');
const rateLimitService = require('~/server/services/Files/RateLimitService');
const securityService = require('~/server/services/Files/SecurityService');
const metricsService = require('~/server/services/Files/MetricsService');
const auditService = require('~/server/services/Files/AuditService');

/**
 * Generate a temporary download URL for a file
 * POST /api/files/generate-download-url
 */
const generateDownloadUrl = async (req, res) => {
  try {
    const { fileId, ttlSeconds, singleUse = true, metadata = {} } = req.body;
    const userId = req.user.id;
    const clientIP = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');
    const requestId = req.headers['x-request-id'] || `req-${Date.now()}`;

    // Validate required fields
    if (!fileId) {
      return res.status(400).json({
        error: 'File ID is required',
        code: 'MISSING_FILE_ID'
      });
    }

    // Check if file exists and user has access
    const file = await File.findOne({ 
      file_id: fileId,
      user: userId 
    });

    if (!file) {
      logger.warn('File not found or access denied', {
        fileId,
        userId,
        clientIP
      });

      return res.status(404).json({
        error: 'File not found',
        code: 'FILE_NOT_FOUND'
      });
    }

    // Validate security constraints
    const securityValidation = securityService.validateDownloadRequest({
      clientIP,
      filename: file.filename,
      fileSize: file.bytes,
      mimeType: file.type,
      userId,
      requestId
    });

    if (!securityValidation.allowed) {
      securityService.logSecurityEvent({
        type: 'download_blocked',
        clientIP,
        userId,
        fileId,
        filename: file.filename,
        violations: securityValidation.violations,
        requestId
      });

      return res.status(403).json({
        error: 'Download not allowed due to security restrictions',
        code: 'SECURITY_VIOLATION',
        violations: securityValidation.violations
      });
    }

    // Check if downloads are enabled for this file
    if (file.downloadEnabled === false) {
      return res.status(403).json({
        error: 'Downloads not enabled for this file',
        code: 'DOWNLOADS_DISABLED'
      });
    }

    // Generate download URL
    const urlData = await UrlGeneratorService.generateDownloadUrl(fileId, {
      ttlSeconds,
      singleUse,
      userId,
      clientIP,
      userAgent,
      requestId,
      metadata
    });

    logger.info('Download URL generated', {
      fileId,
      userId,
      clientIP,
      ttlSeconds: urlData.ttlSeconds,
      singleUse: urlData.singleUse,
      requestId
    });

    // Record metrics and audit logs
    metricsService.recordTokenGeneration();

    await auditService.logTokenGeneration({
      userId,
      fileId,
      clientIP,
      userAgent,
      requestId,
      tokenId: urlData.tokenId,
      expiresAt: urlData.expiresAt,
      singleUse: urlData.singleUse
    });

    // Log successful download URL generation
    securityService.logDownloadAttempt({
      success: true,
      clientIP,
      userId,
      fileId,
      filename: file.filename,
      requestId
    });

    res.json({
      success: true,
      data: {
        downloadUrl: urlData.downloadUrl,
        expiresAt: urlData.expiresAt,
        singleUse: urlData.singleUse,
        ttlSeconds: urlData.ttlSeconds,
        fileInfo: {
          filename: file.filename,
          size: file.bytes,
          type: file.type
        }
      }
    });

  } catch (error) {
    logger.error('Failed to generate download URL', {
      userId: req.user?.id,
      fileId: req.body?.fileId,
      error: error.message,
      stack: error.stack
    });

    // Log failed download attempt
    const clientIP = req.ip || req.connection.remoteAddress;
    const requestId = req.headers['x-request-id'] || `req-${Date.now()}`;

    await auditService.logDownloadAttempt({
      success: false,
      clientIP,
      userId: req.user?.id,
      fileId: req.body?.fileId,
      statusCode: 500,
      error,
      requestId,
      userAgent: req.get('User-Agent')
    });

    securityService.logDownloadAttempt({
      success: false,
      clientIP,
      userId: req.user?.id,
      fileId: req.body?.fileId,
      error,
      requestId
    });

    res.status(500).json({
      error: 'Failed to generate download URL',
      code: 'GENERATION_FAILED'
    });
  }
};

/**
 * Download a file using a temporary token
 * GET /api/files/download/:fileId
 */
const downloadFile = async (req, res) => {
  // Delegate to DownloadService which handles all the complexity
  await DownloadService.handleDownloadRequest(req, res);
};

/**
 * Validate a download token
 * POST /api/files/validate-token
 */
const validateToken = async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user.id;

    if (!token) {
      return res.status(400).json({
        error: 'Token is required',
        code: 'MISSING_TOKEN'
      });
    }

    // Validate token
    const tokenPayload = await UrlGeneratorService.validateToken(token);
    
    // Check if token belongs to user
    if (tokenPayload.userId !== userId) {
      return res.status(403).json({
        error: 'Token does not belong to user',
        code: 'TOKEN_OWNERSHIP_MISMATCH'
      });
    }

    // Check token in database
    const tokenHash = UrlGeneratorService._hashToken(token);
    const storedToken = await TokenStorageService.findValidToken(tokenHash);

    if (!storedToken || !storedToken.canBeUsed()) {
      return res.status(401).json({
        error: 'Token is invalid or expired',
        code: 'TOKEN_INVALID'
      });
    }

    res.json({
      success: true,
      data: {
        valid: true,
        fileId: tokenPayload.fileId,
        expiresAt: storedToken.expiresAt,
        singleUse: storedToken.singleUse,
        used: storedToken.used
      }
    });

  } catch (error) {
    logger.error('Failed to validate token', {
      userId: req.user?.id,
      error: error.message
    });

    res.status(500).json({
      error: 'Failed to validate token',
      code: 'VALIDATION_FAILED'
    });
  }
};

/**
 * Revoke a download token
 * DELETE /api/files/download-token/:tokenId
 */
const revokeToken = async (req, res) => {
  try {
    const { tokenId } = req.params;
    const userId = req.user.id;

    if (!tokenId) {
      return res.status(400).json({
        error: 'Token ID is required',
        code: 'MISSING_TOKEN_ID'
      });
    }

    const success = await TokenStorageService.revokeToken(tokenId, userId);

    if (!success) {
      return res.status(404).json({
        error: 'Token not found',
        code: 'TOKEN_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      message: 'Token revoked successfully'
    });

  } catch (error) {
    logger.error('Failed to revoke token', {
      userId: req.user?.id,
      tokenId: req.params?.tokenId,
      error: error.message
    });

    res.status(500).json({
      error: 'Failed to revoke token',
      code: 'REVOCATION_FAILED'
    });
  }
};

/**
 * Get user's download tokens
 * GET /api/files/download-tokens
 */
const getUserTokens = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      limit = 50, 
      skip = 0, 
      includeExpired = false, 
      includeUsed = false 
    } = req.query;

    const tokens = await TokenStorageService.getUserTokens(userId, {
      limit: parseInt(limit),
      skip: parseInt(skip),
      includeExpired: includeExpired === 'true',
      includeUsed: includeUsed === 'true'
    });

    res.json({
      success: true,
      data: {
        tokens,
        count: tokens.length,
        pagination: {
          limit: parseInt(limit),
          skip: parseInt(skip)
        }
      }
    });

  } catch (error) {
    logger.error('Failed to get user tokens', {
      userId: req.user?.id,
      error: error.message
    });

    res.status(500).json({
      error: 'Failed to retrieve tokens',
      code: 'RETRIEVAL_FAILED'
    });
  }
};

/**
 * Get download statistics for admin users
 * GET /api/files/download-stats
 */
const getDownloadStats = async (req, res) => {
  try {
    // This would typically require admin permissions
    const { timeframe = 24 } = req.query; // hours

    // Get token statistics
    const tokenStats = await TokenStorageService.getTokenStatistics({ timeframe });

    // Get rate limiting statistics
    const rateLimitStats = await rateLimitService.getStatistics();

    // Get security statistics
    const securityStats = securityService.getSecurityStats();

    // Get metrics and audit statistics
    const [metrics, auditStats] = await Promise.all([
      metricsService.getMetrics(`${timeframe}h`),
      auditService.getAuditStatistics(`${timeframe}h`)
    ]);

    res.json({
      success: true,
      data: {
        timeframe: `${timeframe} hours`,
        tokens: tokenStats,
        rateLimiting: rateLimitStats,
        security: securityStats,
        metrics,
        audit: auditStats,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Failed to get download statistics', {
      userId: req.user?.id,
      error: error.message
    });

    res.status(500).json({
      error: 'Failed to retrieve statistics',
      code: 'STATS_FAILED'
    });
  }
};

module.exports = {
  generateDownloadUrl,
  downloadFile,
  validateToken,
  revokeToken,
  getUserTokens,
  getDownloadStats
};
