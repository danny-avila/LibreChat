/**
 * Tests for MCPConnection error detection methods.
 * These test the logic for detecting rate limit and OAuth errors.
 */
describe('MCPConnection Error Detection', () => {
  /**
   * Standalone implementation of isRateLimitError for testing.
   * This mirrors the private method in MCPConnection.
   */
  function isRateLimitError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    if ('code' in error) {
      const code = (error as { code?: number }).code;
      if (code === 429) {
        return true;
      }
    }

    if ('message' in error && typeof (error as { message?: string }).message === 'string') {
      const message = (error as { message: string }).message.toLowerCase();
      if (
        message.includes('429') ||
        message.includes('rate limit') ||
        message.includes('too many requests')
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Standalone implementation of isOAuthError for testing.
   * This mirrors the private method in MCPConnection.
   */
  function isOAuthError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    if ('code' in error) {
      const code = (error as { code?: number }).code;
      if (code === 401 || code === 403) {
        return true;
      }
    }

    if ('message' in error && typeof (error as { message?: string }).message === 'string') {
      const message = (error as { message: string }).message.toLowerCase();
      if (message.includes('401') || message.includes('non-200 status code (401)')) {
        return true;
      }
      if (message.includes('invalid_token')) {
        return true;
      }
      if (message.includes('authentication required') || message.includes('unauthorized')) {
        return true;
      }
    }

    return false;
  }

  describe('isRateLimitError', () => {
    it('should detect rate limit error by code 429', () => {
      const error = { code: 429, message: 'Too many requests' };
      expect(isRateLimitError(error)).toBe(true);
    });

    it('should detect rate limit error by message containing 429', () => {
      const error = { message: 'Error POSTing to endpoint (HTTP 429): Too many requests' };
      expect(isRateLimitError(error)).toBe(true);
    });

    it('should detect rate limit error by message containing "rate limit"', () => {
      const error = { message: 'Rate limit exceeded, please try again later' };
      expect(isRateLimitError(error)).toBe(true);
    });

    it('should detect rate limit error by message containing "too many requests"', () => {
      const error = { message: 'Too many requests - slow down!' };
      expect(isRateLimitError(error)).toBe(true);
    });

    it('should not detect rate limit for 401 errors', () => {
      const error = { code: 401, message: 'Unauthorized' };
      expect(isRateLimitError(error)).toBe(false);
    });

    it('should not detect rate limit for 500 errors', () => {
      const error = { code: 500, message: 'Internal server error' };
      expect(isRateLimitError(error)).toBe(false);
    });

    it('should not detect rate limit for null/undefined', () => {
      expect(isRateLimitError(null)).toBe(false);
      expect(isRateLimitError(undefined)).toBe(false);
    });

    it('should not detect rate limit for non-object errors', () => {
      expect(isRateLimitError('string error')).toBe(false);
      expect(isRateLimitError(123)).toBe(false);
    });

    it('should handle real-world StackOverflow rate limit error', () => {
      const error = {
        code: 429,
        message:
          'Streamable HTTP error: Error POSTing to endpoint: <!DOCTYPE html><html>Too Many Requests</html>',
      };
      expect(isRateLimitError(error)).toBe(true);
    });
  });

  describe('isOAuthError', () => {
    it('should detect OAuth error by code 401', () => {
      const error = { code: 401, message: 'Unauthorized' };
      expect(isOAuthError(error)).toBe(true);
    });

    it('should detect OAuth error by code 403', () => {
      const error = { code: 403, message: 'Forbidden' };
      expect(isOAuthError(error)).toBe(true);
    });

    it('should detect OAuth error by message containing 401', () => {
      const error = { message: 'Error POSTing to endpoint (HTTP 401): Unauthorized' };
      expect(isOAuthError(error)).toBe(true);
    });

    it('should not detect OAuth error for 429 rate limit', () => {
      const error = { code: 429, message: 'Too many requests' };
      expect(isOAuthError(error)).toBe(false);
    });

    it('should detect OAuth error for invalid_token', () => {
      const error = { message: 'The access token is invalid_token or expired' };
      expect(isOAuthError(error)).toBe(true);
    });
  });

  describe('error type differentiation', () => {
    it('should correctly differentiate between rate limit and OAuth errors', () => {
      const rateLimitError = { code: 429, message: 'Too many requests' };
      const oauthError = { code: 401, message: 'Unauthorized' };

      // Rate limit error should be detected as rate limit, not OAuth
      expect(isRateLimitError(rateLimitError)).toBe(true);
      expect(isOAuthError(rateLimitError)).toBe(false);

      // OAuth error should be detected as OAuth, not rate limit
      expect(isOAuthError(oauthError)).toBe(true);
      expect(isRateLimitError(oauthError)).toBe(false);
    });
  });
});
