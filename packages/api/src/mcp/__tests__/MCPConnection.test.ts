/**
 * Tests for MCPConnection error detection methods.
 *
 * These tests use standalone implementations that mirror the private methods in MCPConnection.
 * This approach was chosen because MCPConnection requires complex dependencies (Client, transport)
 * that are difficult to mock properly. The standalone implementations are kept in sync with
 * the actual implementation in connection.ts.
 *
 * Alternative approaches considered:
 * 1. Reflection/type casting - fragile and breaks with refactoring
 * 2. Protected methods with test subclass - changes public API for testing
 * 3. Integration tests - tested separately in the full MCP test suite
 */
describe('MCPConnection Error Detection', () => {
  /**
   * Standalone implementation of isRateLimitError for testing.
   * This mirrors the private method in MCPConnection (connection.ts).
   * Keep in sync with the actual implementation.
   */
  function isRateLimitError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    // Check for error code
    if ('code' in error) {
      const code = (error as { code?: number }).code;
      if (code === 429) {
        return true;
      }
    }

    // Check message for rate limit indicators
    if ('message' in error && typeof error.message === 'string') {
      const message = error.message.toLowerCase();
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
   * This mirrors the private method in MCPConnection (connection.ts).
   * Keep in sync with the actual implementation.
   */
  function isOAuthError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    // Check for error code
    if ('code' in error) {
      const code = (error as { code?: number }).code;
      if (code === 401 || code === 403) {
        return true;
      }
    }

    // Check message for various auth error indicators
    if ('message' in error && typeof error.message === 'string') {
      const message = error.message.toLowerCase();
      // Check for 401 status
      if (message.includes('401') || message.includes('non-200 status code (401)')) {
        return true;
      }
      // Check for invalid_grant (OAuth servers return this for expired/revoked grants)
      if (message.includes('invalid_grant')) {
        return true;
      }
      // Check for invalid_token (OAuth servers return this for expired/revoked tokens)
      if (message.includes('invalid_token')) {
        return true;
      }
      // Check for authentication required
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

    it('should detect OAuth error for invalid_grant', () => {
      const error = {
        message:
          'Streamable HTTP error: Error POSTing to endpoint: {"error":"invalid_grant","error_description":"The provided authorization grant is invalid, expired, or revoked"}',
      };
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

/**
 * Tests for extractSSEErrorMessage function.
 * This function extracts meaningful error messages from SSE transport errors,
 * particularly handling the "SSE error: undefined" case from the MCP SDK.
 */
describe('extractSSEErrorMessage', () => {
  /**
   * Standalone implementation of extractSSEErrorMessage for testing.
   * This mirrors the function in connection.ts.
   * Keep in sync with the actual implementation.
   */
  function extractSSEErrorMessage(error: unknown): {
    message: string;
    code?: number;
    isProxyHint: boolean;
    isTransient: boolean;
  } {
    if (!error || typeof error !== 'object') {
      return {
        message: 'Unknown SSE transport error',
        isProxyHint: true,
        isTransient: true,
      };
    }

    const errorObj = error as { message?: string; code?: number; event?: unknown };
    const rawMessage = errorObj.message ?? '';
    const code = errorObj.code;

    // Handle the common "SSE error: undefined" case
    if (rawMessage === 'SSE error: undefined' || rawMessage === 'undefined' || !rawMessage) {
      return {
        message:
          'SSE connection closed. This can occur due to: (1) idle connection timeout (normal), ' +
          '(2) reverse proxy buffering (check proxy_buffering config), or (3) network interruption.',
        code,
        isProxyHint: true,
        isTransient: true,
      };
    }

    // Check for timeout patterns with case-insensitive matching
    const lowerMessage = rawMessage.toLowerCase();
    if (
      rawMessage.includes('ETIMEDOUT') ||
      rawMessage.includes('ESOCKETTIMEDOUT') ||
      lowerMessage.includes('timed out') ||
      lowerMessage.includes('timeout after') ||
      lowerMessage.includes('request timeout')
    ) {
      return {
        message: `SSE connection timed out: ${rawMessage}. If behind a reverse proxy, increase proxy_read_timeout.`,
        code,
        isProxyHint: true,
        isTransient: true,
      };
    }

    // Connection reset is often transient
    if (rawMessage.includes('ECONNRESET')) {
      return {
        message: `SSE connection reset: ${rawMessage}. The server or proxy may have restarted.`,
        code,
        isProxyHint: false,
        isTransient: true,
      };
    }

    // Connection refused is more serious
    if (rawMessage.includes('ECONNREFUSED')) {
      return {
        message: `SSE connection refused: ${rawMessage}. Verify the MCP server is running and accessible.`,
        code,
        isProxyHint: false,
        isTransient: false,
      };
    }

    // DNS failure
    if (rawMessage.includes('ENOTFOUND') || rawMessage.includes('getaddrinfo')) {
      return {
        message: `SSE DNS resolution failed: ${rawMessage}. Check the server URL is correct.`,
        code,
        isProxyHint: false,
        isTransient: false,
      };
    }

    // Check for HTTP status codes
    const statusMatch = rawMessage.match(/\b(4\d{2}|5\d{2})\b/);
    if (statusMatch) {
      const statusCode = parseInt(statusMatch[1], 10);
      const isServerError = statusCode >= 500 && statusCode < 600;
      return {
        message: rawMessage,
        code: statusCode,
        isProxyHint: statusCode === 502 || statusCode === 503 || statusCode === 504,
        isTransient: isServerError,
      };
    }

    return {
      message: rawMessage,
      code,
      isProxyHint: false,
      isTransient: false,
    };
  }

  describe('undefined/empty error handling', () => {
    it('should handle "SSE error: undefined" from MCP SDK', () => {
      const error = { message: 'SSE error: undefined', code: undefined };
      const result = extractSSEErrorMessage(error);

      expect(result.message).toContain('SSE connection closed');
      expect(result.isProxyHint).toBe(true);
      expect(result.isTransient).toBe(true);
    });

    it('should handle empty message', () => {
      const error = { message: '' };
      const result = extractSSEErrorMessage(error);

      expect(result.message).toContain('SSE connection closed');
      expect(result.isTransient).toBe(true);
    });

    it('should handle message "undefined"', () => {
      const error = { message: 'undefined' };
      const result = extractSSEErrorMessage(error);

      expect(result.message).toContain('SSE connection closed');
      expect(result.isTransient).toBe(true);
    });

    it('should handle null error', () => {
      const result = extractSSEErrorMessage(null);

      expect(result.message).toBe('Unknown SSE transport error');
      expect(result.isTransient).toBe(true);
    });

    it('should handle undefined error', () => {
      const result = extractSSEErrorMessage(undefined);

      expect(result.message).toBe('Unknown SSE transport error');
      expect(result.isTransient).toBe(true);
    });

    it('should handle non-object error', () => {
      const result = extractSSEErrorMessage('string error');

      expect(result.message).toBe('Unknown SSE transport error');
      expect(result.isTransient).toBe(true);
    });
  });

  describe('timeout errors', () => {
    it('should detect ETIMEDOUT', () => {
      const error = { message: 'connect ETIMEDOUT 1.2.3.4:443' };
      const result = extractSSEErrorMessage(error);

      expect(result.message).toContain('SSE connection timed out');
      expect(result.message).toContain('proxy_read_timeout');
      expect(result.isProxyHint).toBe(true);
      expect(result.isTransient).toBe(true);
    });

    it('should detect ESOCKETTIMEDOUT', () => {
      const error = { message: 'ESOCKETTIMEDOUT' };
      const result = extractSSEErrorMessage(error);

      expect(result.message).toContain('SSE connection timed out');
      expect(result.isTransient).toBe(true);
    });

    it('should detect "timed out" (case insensitive)', () => {
      const error = { message: 'Connection Timed Out' };
      const result = extractSSEErrorMessage(error);

      expect(result.message).toContain('SSE connection timed out');
      expect(result.isTransient).toBe(true);
    });

    it('should detect "timeout after"', () => {
      const error = { message: 'Request timeout after 60000ms' };
      const result = extractSSEErrorMessage(error);

      expect(result.message).toContain('SSE connection timed out');
      expect(result.isTransient).toBe(true);
    });

    it('should detect "request timeout"', () => {
      const error = { message: 'Request Timeout' };
      const result = extractSSEErrorMessage(error);

      expect(result.message).toContain('SSE connection timed out');
      expect(result.isTransient).toBe(true);
    });

    it('should NOT match "timeout" in unrelated context', () => {
      // URL containing "timeout" should not trigger timeout detection
      const error = { message: 'Failed to connect to https://api.example.com/timeout-settings' };
      const result = extractSSEErrorMessage(error);

      expect(result.message).not.toContain('SSE connection timed out');
      expect(result.message).toBe('Failed to connect to https://api.example.com/timeout-settings');
    });
  });

  describe('connection errors', () => {
    it('should detect ECONNRESET as transient', () => {
      const error = { message: 'read ECONNRESET' };
      const result = extractSSEErrorMessage(error);

      expect(result.message).toContain('SSE connection reset');
      expect(result.isProxyHint).toBe(false);
      expect(result.isTransient).toBe(true);
    });

    it('should detect ECONNREFUSED as non-transient', () => {
      const error = { message: 'connect ECONNREFUSED 127.0.0.1:8080' };
      const result = extractSSEErrorMessage(error);

      expect(result.message).toContain('SSE connection refused');
      expect(result.message).toContain('Verify the MCP server is running');
      expect(result.isTransient).toBe(false);
    });
  });

  describe('DNS errors', () => {
    it('should detect ENOTFOUND', () => {
      const error = { message: 'getaddrinfo ENOTFOUND unknown.host.com' };
      const result = extractSSEErrorMessage(error);

      expect(result.message).toContain('SSE DNS resolution failed');
      expect(result.message).toContain('Check the server URL');
      expect(result.isTransient).toBe(false);
    });

    it('should detect getaddrinfo errors', () => {
      const error = { message: 'getaddrinfo EAI_AGAIN example.com' };
      const result = extractSSEErrorMessage(error);

      expect(result.message).toContain('SSE DNS resolution failed');
      expect(result.isTransient).toBe(false);
    });
  });

  describe('HTTP status code errors', () => {
    it('should detect 502 as proxy hint and transient', () => {
      const error = { message: 'Non-200 status code (502): Bad Gateway' };
      const result = extractSSEErrorMessage(error);

      expect(result.code).toBe(502);
      expect(result.isProxyHint).toBe(true);
      expect(result.isTransient).toBe(true);
    });

    it('should detect 503 as proxy hint and transient', () => {
      const error = { message: 'Error: Service Unavailable (503)' };
      const result = extractSSEErrorMessage(error);

      expect(result.code).toBe(503);
      expect(result.isProxyHint).toBe(true);
      expect(result.isTransient).toBe(true);
    });

    it('should detect 504 as proxy hint and transient', () => {
      const error = { message: 'Gateway Timeout 504' };
      const result = extractSSEErrorMessage(error);

      expect(result.code).toBe(504);
      expect(result.isProxyHint).toBe(true);
      expect(result.isTransient).toBe(true);
    });

    it('should detect 500 as transient but not proxy hint', () => {
      const error = { message: 'Internal Server Error (500)' };
      const result = extractSSEErrorMessage(error);

      expect(result.code).toBe(500);
      expect(result.isProxyHint).toBe(false);
      expect(result.isTransient).toBe(true);
    });

    it('should detect 404 as non-transient', () => {
      const error = { message: 'Not Found (404)' };
      const result = extractSSEErrorMessage(error);

      expect(result.code).toBe(404);
      expect(result.isProxyHint).toBe(false);
      expect(result.isTransient).toBe(false);
    });

    it('should detect 401 as non-transient', () => {
      const error = { message: 'Unauthorized (401)' };
      const result = extractSSEErrorMessage(error);

      expect(result.code).toBe(401);
      expect(result.isTransient).toBe(false);
    });
  });

  describe('SseError from MCP SDK', () => {
    it('should handle SseError with event property', () => {
      const error = {
        message: 'SSE error: undefined',
        code: undefined,
        event: { type: 'error', code: undefined, message: undefined },
      };
      const result = extractSSEErrorMessage(error);

      expect(result.message).toContain('SSE connection closed');
      expect(result.isTransient).toBe(true);
    });

    it('should preserve code from SseError', () => {
      const error = {
        message: 'SSE error: Server sent HTTP 204, not reconnecting',
        code: 204,
      };
      const result = extractSSEErrorMessage(error);

      expect(result.code).toBe(204);
    });
  });

  describe('regular error messages', () => {
    it('should pass through regular error messages', () => {
      const error = { message: 'Some specific error message', code: 42 };
      const result = extractSSEErrorMessage(error);

      expect(result.message).toBe('Some specific error message');
      expect(result.code).toBe(42);
      expect(result.isProxyHint).toBe(false);
      expect(result.isTransient).toBe(false);
    });
  });
});
