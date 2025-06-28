const express = require('express');
const {
  uaParser,
  checkBan,
  requireJwtAuth,
} = require('~/server/middleware');
const rateLimitService = require('~/server/services/Files/RateLimitService');
const securityService = require('~/server/services/Files/SecurityService');
const metricsService = require('~/server/services/Files/MetricsService');
const {
  generateDownloadUrl,
  downloadFile,
  validateToken,
  revokeToken,
  getUserTokens,
  getDownloadStats
} = require('~/server/controllers/files/downloadController');

const router = express.Router();

// Middleware for parsing user agent
router.use(uaParser);

// Create middleware
const downloadRateLimit = rateLimitService.createMiddleware();
const securityValidation = securityService.createValidationMiddleware();
const metricsCollection = metricsService.createMetricsMiddleware();

// Public download endpoint (no auth required, token-based) with security, rate limiting, and metrics
router.get('/download/:fileId', metricsCollection, securityValidation, downloadRateLimit, downloadFile);

// Protected endpoints (require authentication)
router.use(requireJwtAuth);
router.use(checkBan);

// Apply metrics, security validation and rate limiting to protected endpoints as well
router.use(metricsCollection);
router.use(securityValidation);
router.use(downloadRateLimit);

// Generate download URL
router.post('/generate-download-url', generateDownloadUrl);

// Validate download token
router.post('/validate-token', validateToken);

// Get user's download tokens
router.get('/download-tokens', getUserTokens);

// Revoke a download token
router.delete('/download-token/:tokenId', revokeToken);

// Get download statistics (admin only - would need additional middleware)
router.get('/download-stats', getDownloadStats);

module.exports = router;
