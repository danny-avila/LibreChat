const express = require('express');
const {
  uaParser,
  checkBan,
  requireJwtAuth,
} = require('~/server/middleware');
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

// Public download endpoint (no auth required, token-based)
router.get('/download/:fileId', downloadFile);

// Protected endpoints (require authentication)
router.use(requireJwtAuth);
router.use(checkBan);

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
