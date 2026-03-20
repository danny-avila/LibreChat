/**
 * Integration tests for math function with actual config patterns.
 * These tests verify that real environment variable expressions from .env.example
 * are correctly evaluated by the math function.
 */
import { math } from './math';

describe('math - integration with real config patterns', () => {
  describe('SESSION_EXPIRY patterns', () => {
    test('should evaluate default SESSION_EXPIRY (15 minutes)', () => {
      const result = math('1000 * 60 * 15');
      expect(result).toBe(900000); // 15 minutes in ms
    });

    test('should evaluate 30 minute session', () => {
      const result = math('1000 * 60 * 30');
      expect(result).toBe(1800000); // 30 minutes in ms
    });

    test('should evaluate 1 hour session', () => {
      const result = math('1000 * 60 * 60');
      expect(result).toBe(3600000); // 1 hour in ms
    });
  });

  describe('REFRESH_TOKEN_EXPIRY patterns', () => {
    test('should evaluate default REFRESH_TOKEN_EXPIRY (7 days)', () => {
      const result = math('(1000 * 60 * 60 * 24) * 7');
      expect(result).toBe(604800000); // 7 days in ms
    });

    test('should evaluate 1 day refresh token', () => {
      const result = math('1000 * 60 * 60 * 24');
      expect(result).toBe(86400000); // 1 day in ms
    });

    test('should evaluate 30 day refresh token', () => {
      const result = math('(1000 * 60 * 60 * 24) * 30');
      expect(result).toBe(2592000000); // 30 days in ms
    });
  });

  describe('BAN_DURATION patterns', () => {
    test('should evaluate default BAN_DURATION (2 hours)', () => {
      const result = math('1000 * 60 * 60 * 2');
      expect(result).toBe(7200000); // 2 hours in ms
    });

    test('should evaluate 24 hour ban', () => {
      const result = math('1000 * 60 * 60 * 24');
      expect(result).toBe(86400000); // 24 hours in ms
    });
  });

  describe('Redis config patterns', () => {
    test('should evaluate REDIS_RETRY_MAX_DELAY', () => {
      expect(math('3000')).toBe(3000);
    });

    test('should evaluate REDIS_RETRY_MAX_ATTEMPTS', () => {
      expect(math('10')).toBe(10);
    });

    test('should evaluate REDIS_CONNECT_TIMEOUT', () => {
      expect(math('10000')).toBe(10000);
    });

    test('should evaluate REDIS_MAX_LISTENERS', () => {
      expect(math('40')).toBe(40);
    });

    test('should evaluate REDIS_DELETE_CHUNK_SIZE', () => {
      expect(math('1000')).toBe(1000);
    });
  });

  describe('MCP config patterns', () => {
    test('should evaluate MCP_OAUTH_DETECTION_TIMEOUT', () => {
      expect(math('5000')).toBe(5000);
    });

    test('should evaluate MCP_CONNECTION_CHECK_TTL', () => {
      expect(math('60000')).toBe(60000); // 1 minute
    });

    test('should evaluate MCP_USER_CONNECTION_IDLE_TIMEOUT (15 minutes)', () => {
      const result = math('15 * 60 * 1000');
      expect(result).toBe(900000); // 15 minutes in ms
    });

    test('should evaluate MCP_REGISTRY_CACHE_TTL', () => {
      expect(math('5000')).toBe(5000); // 5 seconds
    });
  });

  describe('Leader election config patterns', () => {
    test('should evaluate LEADER_LEASE_DURATION (25 seconds)', () => {
      expect(math('25')).toBe(25);
    });

    test('should evaluate LEADER_RENEW_INTERVAL (10 seconds)', () => {
      expect(math('10')).toBe(10);
    });

    test('should evaluate LEADER_RENEW_ATTEMPTS', () => {
      expect(math('3')).toBe(3);
    });

    test('should evaluate LEADER_RENEW_RETRY_DELAY (0.5 seconds)', () => {
      expect(math('0.5')).toBe(0.5);
    });
  });

  describe('OpenID config patterns', () => {
    test('should evaluate OPENID_JWKS_URL_CACHE_TIME (10 minutes)', () => {
      const result = math('600000');
      expect(result).toBe(600000); // 10 minutes in ms
    });

    test('should evaluate custom cache time expression', () => {
      const result = math('1000 * 60 * 10');
      expect(result).toBe(600000); // 10 minutes in ms
    });
  });

  describe('simulated process.env usage', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    test('should work with SESSION_EXPIRY from env', () => {
      process.env.SESSION_EXPIRY = '1000 * 60 * 15';
      const result = math(process.env.SESSION_EXPIRY, 900000);
      expect(result).toBe(900000);
    });

    test('should work with REFRESH_TOKEN_EXPIRY from env', () => {
      process.env.REFRESH_TOKEN_EXPIRY = '(1000 * 60 * 60 * 24) * 7';
      const result = math(process.env.REFRESH_TOKEN_EXPIRY, 604800000);
      expect(result).toBe(604800000);
    });

    test('should work with BAN_DURATION from env', () => {
      process.env.BAN_DURATION = '1000 * 60 * 60 * 2';
      const result = math(process.env.BAN_DURATION, 7200000);
      expect(result).toBe(7200000);
    });

    test('should use fallback when env var is undefined', () => {
      delete process.env.SESSION_EXPIRY;
      const result = math(process.env.SESSION_EXPIRY, 900000);
      expect(result).toBe(900000);
    });

    test('should use fallback when env var is empty string', () => {
      process.env.SESSION_EXPIRY = '';
      const result = math(process.env.SESSION_EXPIRY, 900000);
      expect(result).toBe(900000);
    });

    test('should use fallback when env var has invalid expression', () => {
      process.env.SESSION_EXPIRY = 'invalid';
      const result = math(process.env.SESSION_EXPIRY, 900000);
      expect(result).toBe(900000);
    });
  });

  describe('time calculation helpers', () => {
    // Helper functions to make time calculations more readable
    const seconds = (n: number) => n * 1000;
    const minutes = (n: number) => seconds(n * 60);
    const hours = (n: number) => minutes(n * 60);
    const days = (n: number) => hours(n * 24);

    test('should match helper calculations', () => {
      // Verify our math function produces same results as programmatic calculations
      expect(math('1000 * 60 * 15')).toBe(minutes(15));
      expect(math('1000 * 60 * 60 * 2')).toBe(hours(2));
      expect(math('(1000 * 60 * 60 * 24) * 7')).toBe(days(7));
    });

    test('should handle complex expressions', () => {
      // 2 hours + 30 minutes
      expect(math('(1000 * 60 * 60 * 2) + (1000 * 60 * 30)')).toBe(hours(2) + minutes(30));

      // Half a day
      expect(math('(1000 * 60 * 60 * 24) / 2')).toBe(days(1) / 2);
    });
  });
});
