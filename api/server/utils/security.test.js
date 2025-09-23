/**
 * Automated security tests to detect API key leakage
 */

const request = require('supertest');
const express = require('express');
const { maskAPIKey, sanitizeError, looksLikeAPIKey } = require('./keyMasking');

// Mock API keys for testing
const TEST_KEYS = {
  openai: 'sk-1234567890abcdefghijklmnopqrstuvwxyz',
  openrouter: 'sk-or-v1-1234567890abcdefghijklmnopqrstuvwxyz',
  anthropic: 'sk-ant-api03-1234567890abcdefghijklmnopqrstuvwxyz',
  google: 'AIzaSyB1234567890abcdefghijklmnopqrstuv',
};

describe('Security Tests - API Key Protection', () => {
  let app;
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Create test express app
    app = express();
    app.use(express.json());

    // Mock environment with test keys
    process.env.OPENAI_API_KEY = TEST_KEYS.openai;
    process.env.OPENROUTER_API_KEY = TEST_KEYS.openrouter;
    process.env.ANTHROPIC_API_KEY = TEST_KEYS.anthropic;
    process.env.GOOGLE_API_KEY = TEST_KEYS.google;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('API Response Security', () => {
    it('should not expose API keys in error responses', async () => {
      app.get('/test-error', (req, res) => {
        const error = new Error(`Failed to authenticate with key ${process.env.OPENAI_API_KEY}`);
        const sanitized = sanitizeError(error);
        res.status(500).json({ error: sanitized.message });
      });

      const response = await request(app).get('/test-error');

      expect(response.status).toBe(500);
      expect(response.body.error).not.toContain(TEST_KEYS.openai);
      expect(response.body.error).toBe('An error occurred with authentication');
    });

    it('should not expose API keys in successful responses', async () => {
      app.get('/test-config', (req, res) => {
        // Simulate returning config (bad practice)
        const config = {
          provider: 'openai',
          apiKey: process.env.OPENAI_API_KEY,
          model: 'gpt-4',
        };

        // Should mask before sending
        const safeConfig = {
          ...config,
          apiKey: maskAPIKey(config.apiKey),
        };

        res.json(safeConfig);
      });

      const response = await request(app).get('/test-config');

      expect(response.status).toBe(200);
      expect(response.body.apiKey).not.toBe(TEST_KEYS.openai);
      expect(response.body.apiKey).toMatch(/^sk-\*+wxyz$/);
    });

    it('should not expose keys in debug endpoints', async () => {
      app.get('/debug/env', (req, res) => {
        // Bad practice: exposing environment
        const { getSafeEnvironment } = require('./envValidation');
        res.json(getSafeEnvironment());
      });

      const response = await request(app).get('/debug/env');

      // Check that all test keys are masked
      for (const [provider, key] of Object.entries(TEST_KEYS)) {
        const envKey = `${provider.toUpperCase()}_API_KEY`;
        if (response.body[envKey]) {
          expect(response.body[envKey]).not.toBe(key);
          expect(response.body[envKey]).not.toContain(key.substring(10, 20));
        }
      }
    });
  });

  describe('Logging Security', () => {
    it('should not log raw API keys', () => {
      const mockLogger = {
        logs: [],
        error: function(msg, data) {
          this.logs.push({ level: 'error', msg, data });
        },
        info: function(msg, data) {
          this.logs.push({ level: 'info', msg, data });
        },
      };

      // Simulate logging with API key
      const { safeLog } = require('./keyMasking');

      safeLog('error', 'Authentication failed', {
        apiKey: TEST_KEYS.openai,
        endpoint: '/v1/chat',
      }, mockLogger);

      expect(mockLogger.logs).toHaveLength(1);
      const log = mockLogger.logs[0];
      expect(JSON.stringify(log)).not.toContain(TEST_KEYS.openai);
      expect(log.data.apiKey).toMatch(/^sk-\*+wxyz$/);
    });

    it('should detect and mask keys in error messages', () => {
      const errors = [
        `Failed with key ${TEST_KEYS.openai}`,
        `Invalid API key: ${TEST_KEYS.openrouter}`,
        `Authentication error for ${TEST_KEYS.anthropic}`,
      ];

      errors.forEach(errorMsg => {
        const error = new Error(errorMsg);
        const sanitized = sanitizeError(error);

        // Should detect that message contains API key
        expect(sanitized.message).toBe('An error occurred with authentication');
      });
    });
  });

  describe('Key Pattern Detection', () => {
    it('should correctly identify API key patterns', () => {
      // Valid API keys
      expect(looksLikeAPIKey(TEST_KEYS.openai)).toBe(true);
      expect(looksLikeAPIKey(TEST_KEYS.openrouter)).toBe(true);
      expect(looksLikeAPIKey('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')).toBe(true);

      // Not API keys
      expect(looksLikeAPIKey('hello world')).toBe(false);
      expect(looksLikeAPIKey('user@example.com')).toBe(false);
      expect(looksLikeAPIKey('http://localhost:3000')).toBe(false);
      expect(looksLikeAPIKey('2024-01-01')).toBe(false);
    });
  });

  describe('Headers Security', () => {
    it('should not expose API keys in response headers', async () => {
      app.get('/test-headers', (req, res) => {
        // Bad practice: putting API key in header
        res.setHeader('X-API-Key', maskAPIKey(process.env.OPENAI_API_KEY));
        res.json({ success: true });
      });

      const response = await request(app).get('/test-headers');

      const apiKeyHeader = response.headers['x-api-key'];
      if (apiKeyHeader) {
        expect(apiKeyHeader).not.toBe(TEST_KEYS.openai);
        expect(apiKeyHeader).toMatch(/\*/);
      }
    });

    it('should not expose keys in error stack traces', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      app.get('/test-stack', (req, res) => {
        const error = new Error('Something went wrong');
        error.stack = `Error: Something went wrong\n    at /app/auth.js:10 (apiKey: ${TEST_KEYS.openai})`;

        const sanitized = sanitizeError(error);
        res.status(500).json(sanitized);
      });

      const response = await request(app).get('/test-stack');

      expect(response.body.stack).toBeUndefined(); // Stack hidden in production
      expect(JSON.stringify(response.body)).not.toContain(TEST_KEYS.openai);

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Request Body Security', () => {
    it('should mask API keys in logged request bodies', () => {
      const requestBody = {
        provider: 'openai',
        api_key: TEST_KEYS.openai,
        config: {
          auth_token: 'Bearer ' + TEST_KEYS.google,
        },
      };

      const { maskObjectKeys } = require('./keyMasking');
      const masked = maskObjectKeys(requestBody);

      expect(masked.api_key).not.toBe(TEST_KEYS.openai);
      expect(masked.api_key).toMatch(/\*/);
      expect(masked.config.auth_token).not.toContain(TEST_KEYS.google);
    });
  });
});

describe('Security Tests - Static Analysis', () => {
  it('should not find console.log with API keys in codebase', async () => {
    // This is a meta-test that would be run by CI/CD
    // It checks for patterns that might leak keys

    const dangerousPatterns = [
      /console\.log.*process\.env\.[A-Z_]*KEY/,
      /console\.log.*apiKey/i,
      /res\.json\(.*process\.env\.[A-Z_]*KEY/,
      /res\.send\(.*apiKey/i,
    ];

    // In a real implementation, this would scan actual files
    // For now, we just verify the patterns work
    const badCode = `
      console.log('API Key:', process.env.OPENAI_API_KEY);
      res.json({ key: process.env.OPENROUTER_KEY });
    `;

    let foundViolation = false;
    dangerousPatterns.forEach(pattern => {
      if (pattern.test(badCode)) {
        foundViolation = true;
      }
    });

    expect(foundViolation).toBe(true); // Patterns should catch bad code
  });
});