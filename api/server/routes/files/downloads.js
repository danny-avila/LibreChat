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

// Create middleware
const downloadRateLimit = rateLimitService.createMiddleware();
const securityValidation = securityService.createValidationMiddleware();
const metricsCollection = metricsService.createMetricsMiddleware();

// Public download endpoint (no auth required, token-based) with security, rate limiting, and metrics
// NOTE: uaParser middleware is intentionally excluded here to allow command-line tools like wget
// to access temporary download URLs. Security is maintained through token-based authentication.
router.get('/download/:fileId', metricsCollection, securityValidation, downloadRateLimit, downloadFile);

// Protected endpoints (require authentication)
// Apply uaParser middleware only to protected endpoints to ensure browser-only access for authenticated operations
router.use(requireJwtAuth);
router.use(checkBan);
router.use(uaParser);

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
