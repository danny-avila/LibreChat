const request = require('supertest');
const express = require('express');
const downloadsRouter = require('../../../server/routes/files/downloads');

// Mock dependencies
jest.mock('../../../server/middleware', () => ({
  uaParser: jest.fn((req, res, next) => {
    const ua = require('ua-parser-js')(req.headers['user-agent']);
    if (!ua.browser.name) {
      return res.status(400).json({ message: 'Illegal request' });
    }
    next();
  }),
  checkBan: jest.fn((req, res, next) => next()),
  requireJwtAuth: jest.fn((req, res, next) => {
    req.user = { id: 'test-user-id' };
    next();
  }),
}));

jest.mock('../../../server/services/Files/RateLimitService', () => ({
  createMiddleware: jest.fn(() => (req, res, next) => next())
}));

jest.mock('../../../server/services/Files/SecurityService', () => ({
  createValidationMiddleware: jest.fn(() => (req, res, next) => next())
}));

jest.mock('../../../server/services/Files/MetricsService', () => ({
  createMetricsMiddleware: jest.fn(() => (req, res, next) => next())
}));

jest.mock('../../../server/controllers/files/downloadController', () => ({
  generateDownloadUrl: jest.fn((req, res) => {
    res.json({ success: true, downloadUrl: 'https://example.com/download/test' });
  }),
  downloadFile: jest.fn((req, res) => {
    res.json({ success: true, message: 'File download started' });
  }),
  validateToken: jest.fn((req, res) => {
    res.json({ success: true, valid: true });
  }),
  revokeToken: jest.fn((req, res) => {
    res.json({ success: true, message: 'Token revoked' });
  }),
  getUserTokens: jest.fn((req, res) => {
    res.json({ success: true, tokens: [] });
  }),
  getDownloadStats: jest.fn((req, res) => {
    res.json({ success: true, stats: {} });
  })
}));

describe('Downloads Router - User-Agent Handling', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/files', downloadsRouter);
  });

  describe('Public download endpoint', () => {
    it('should allow browser requests', async () => {
      const response = await request(app)
        .get('/api/files/download/test-file-id?token=test-token')
        .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should allow wget requests (command-line tools)', async () => {
      const response = await request(app)
        .get('/api/files/download/test-file-id?token=test-token')
        .set('User-Agent', 'Wget/1.21.3');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should allow curl requests (command-line tools)', async () => {
      const response = await request(app)
        .get('/api/files/download/test-file-id?token=test-token')
        .set('User-Agent', 'curl/7.68.0');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should allow requests without User-Agent header', async () => {
      const response = await request(app)
        .get('/api/files/download/test-file-id?token=test-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should allow custom MCP client requests', async () => {
      const response = await request(app)
        .get('/api/files/download/test-file-id?token=test-token')
        .set('User-Agent', 'MCP-Client/1.0');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('Protected endpoints (require authentication)', () => {
    it('should block non-browser requests for generate-download-url', async () => {
      const response = await request(app)
        .post('/api/files/generate-download-url')
        .set('User-Agent', 'wget/1.21.3')
        .send({ fileId: 'test-file-id' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Illegal request');
    });

    it('should allow browser requests for generate-download-url', async () => {
      const response = await request(app)
        .post('/api/files/generate-download-url')
        .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
        .send({ fileId: 'test-file-id' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should block non-browser requests for validate-token', async () => {
      const response = await request(app)
        .post('/api/files/validate-token')
        .set('User-Agent', 'curl/7.68.0')
        .send({ token: 'test-token' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Illegal request');
    });

    it('should allow browser requests for validate-token', async () => {
      const response = await request(app)
        .post('/api/files/validate-token')
        .set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36')
        .send({ token: 'test-token' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
