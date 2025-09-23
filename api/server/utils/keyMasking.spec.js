const {
  maskAPIKey,
  maskObjectKeys,
  safeLog,
  createSafeError,
  looksLikeAPIKey,
  sanitizeError,
} = require('./keyMasking');

describe('keyMasking utilities', () => {
  describe('maskAPIKey', () => {
    it('should mask a standard API key', () => {
      const key = 'sk-1234567890abcdefghijklmnop';
      const masked = maskAPIKey(key);
      expect(masked).toBe('sk-**********************mnop');
    });

    it('should mask an OpenRouter API key', () => {
      const key = 'sk-or-v1-1234567890abcdefghijklmnop';
      const masked = maskAPIKey(key);
      expect(masked).toBe('sk-****************************mnop');
    });

    it('should handle custom masking options', () => {
      const key = 'test-key-12345678';
      const masked = maskAPIKey(key, { showFirst: 5, showLast: 2, mask: '#' });
      expect(masked).toBe('test-##########78');
    });

    it('should return [REDACTED] for invalid inputs', () => {
      expect(maskAPIKey(null)).toBe('[REDACTED]');
      expect(maskAPIKey(undefined)).toBe('[REDACTED]');
      expect(maskAPIKey('')).toBe('[REDACTED]');
      expect(maskAPIKey(123)).toBe('[REDACTED]');
    });

    it('should return [REDACTED] for very short keys', () => {
      expect(maskAPIKey('abc')).toBe('[REDACTED]');
      expect(maskAPIKey('1234567')).toBe('[REDACTED]');
    });
  });

  describe('maskObjectKeys', () => {
    it('should mask API keys in objects', () => {
      const obj = {
        api_key: 'sk-1234567890abcdefghijklmnop',
        apiKey: 'test-key-12345678',
        normalField: 'this should not be masked',
      };

      const masked = maskObjectKeys(obj);
      expect(masked.api_key).toBe('sk-**********************mnop');
      expect(masked.apiKey).toBe('tes**************5678');
      expect(masked.normalField).toBe('this should not be masked');
    });

    it('should mask nested objects', () => {
      const obj = {
        config: {
          auth: {
            api_key: 'secret-key-12345',
            password: 'mypassword123',
          },
          public: 'not-secret',
        },
      };

      const masked = maskObjectKeys(obj);
      expect(masked.config.auth.api_key).toBe('sec**************2345');
      expect(masked.config.auth.password).toBe('myp**************d123');
      expect(masked.config.public).toBe('not-secret');
    });

    it('should handle arrays in objects', () => {
      const obj = {
        keys: ['key1', 'key2'],
        api_key: 'secret',
      };

      const masked = maskObjectKeys(obj);
      expect(masked.keys).toEqual(['key1', 'key2']);
      expect(masked.api_key).toBe('[REDACTED]');
    });

    it('should handle null and undefined', () => {
      expect(maskObjectKeys(null)).toBe(null);
      expect(maskObjectKeys(undefined)).toBe(undefined);
      expect(maskObjectKeys('string')).toBe('string');
    });
  });

  describe('looksLikeAPIKey', () => {
    it('should identify OpenAI style keys', () => {
      expect(looksLikeAPIKey('sk-1234567890abcdefghijklmnop')).toBe(true);
    });

    it('should identify OpenRouter style keys', () => {
      expect(looksLikeAPIKey('sk-or-v1-1234567890abcdefghijklmnop')).toBe(true);
    });

    it('should identify hex strings', () => {
      expect(looksLikeAPIKey('a1b2c3d4e5f6789012345678901234567890')).toBe(true);
    });

    it('should identify Bearer tokens', () => {
      expect(looksLikeAPIKey('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')).toBe(true);
    });

    it('should not identify regular strings', () => {
      expect(looksLikeAPIKey('hello world')).toBe(false);
      expect(looksLikeAPIKey('user@example.com')).toBe(false);
      expect(looksLikeAPIKey('12345')).toBe(false);
    });

    it('should handle invalid inputs', () => {
      expect(looksLikeAPIKey(null)).toBe(false);
      expect(looksLikeAPIKey(undefined)).toBe(false);
      expect(looksLikeAPIKey(123)).toBe(false);
    });
  });

  describe('safeLog', () => {
    it('should mask sensitive data before logging', () => {
      const mockLogger = {
        info: jest.fn(),
        error: jest.fn(),
      };

      const data = {
        user: 'john',
        api_key: 'sk-secret123',
        request: {
          auth_token: 'bearer-abc123',
        },
      };

      safeLog('info', 'Test message', data, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Test message',
        expect.objectContaining({
          user: 'john',
          api_key: expect.stringMatching(/^sk-\*+3$/),
          request: expect.objectContaining({
            auth_token: expect.stringMatching(/^bea\*+c123$/),
          }),
        })
      );
    });
  });

  describe('createSafeError', () => {
    it('should create error with masked details', () => {
      const error = createSafeError('Authentication failed', {
        api_key: 'sk-secret123',
        endpoint: '/api/chat',
      });

      expect(error.message).toBe('Authentication failed');
      expect(error.details.api_key).toBe('sk-**************t123');
      expect(error.details.endpoint).toBe('/api/chat');
    });
  });

  describe('sanitizeError', () => {
    it('should sanitize error objects', () => {
      const error = new Error('Failed with key sk-1234567890abcdefg');
      error.apiKey = 'sk-secret';
      error.config = { auth: 'bearer token' };
      error.stack = 'Error stack trace';

      const sanitized = sanitizeError(error);

      expect(sanitized.message).toBe('An error occurred with authentication');
      expect(sanitized.apiKey).toBe('[REDACTED]');
      expect(sanitized.config).toBe('[REDACTED]');
    });

    it('should preserve stack in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Test error');
      error.stack = 'Stack trace';

      const sanitized = sanitizeError(error);
      expect(sanitized.stack).toBe('Stack trace');

      process.env.NODE_ENV = originalEnv;
    });

    it('should hide stack in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new Error('Test error');
      error.stack = 'Stack trace';

      const sanitized = sanitizeError(error);
      expect(sanitized.stack).toBeUndefined();

      process.env.NODE_ENV = originalEnv;
    });
  });
});