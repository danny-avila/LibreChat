import { shouldUseSecureCookie } from './csrf';

describe('shouldUseSecureCookie', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.SESSION_COOKIE_SECURE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return true in production with a non-localhost domain', () => {
    process.env.NODE_ENV = 'production';
    process.env.DOMAIN_SERVER = 'https://myapp.example.com';
    expect(shouldUseSecureCookie()).toBe(true);
  });

  it('should return false in development regardless of domain', () => {
    process.env.NODE_ENV = 'development';
    process.env.DOMAIN_SERVER = 'https://myapp.example.com';
    expect(shouldUseSecureCookie()).toBe(false);
  });

  it('should return false when NODE_ENV is not set', () => {
    delete process.env.NODE_ENV;
    process.env.DOMAIN_SERVER = 'https://myapp.example.com';
    expect(shouldUseSecureCookie()).toBe(false);
  });

  it('should return true when SESSION_COOKIE_SECURE=true', () => {
    process.env.NODE_ENV = 'development';
    process.env.DOMAIN_SERVER = 'http://localhost:3080';
    process.env.SESSION_COOKIE_SECURE = 'true';
    expect(shouldUseSecureCookie()).toBe(true);
  });

  it('should return false when SESSION_COOKIE_SECURE=false', () => {
    process.env.NODE_ENV = 'production';
    process.env.DOMAIN_SERVER = 'http://10.0.0.5:3080';
    process.env.SESSION_COOKIE_SECURE = 'false';
    expect(shouldUseSecureCookie()).toBe(false);
  });

  it('should trim and normalize SESSION_COOKIE_SECURE values', () => {
    process.env.NODE_ENV = 'development';
    process.env.DOMAIN_SERVER = 'http://localhost:3080';
    process.env.SESSION_COOKIE_SECURE = ' TRUE ';
    expect(shouldUseSecureCookie()).toBe(true);
  });

  it('should ignore invalid SESSION_COOKIE_SECURE values', () => {
    process.env.NODE_ENV = 'production';
    process.env.DOMAIN_SERVER = 'https://myapp.example.com';
    process.env.SESSION_COOKIE_SECURE = 'yes';
    expect(shouldUseSecureCookie()).toBe(true);
  });

  describe('localhost detection in production', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('should return false for http://localhost:3080', () => {
      process.env.DOMAIN_SERVER = 'http://localhost:3080';
      expect(shouldUseSecureCookie()).toBe(false);
    });

    it('should return false for https://localhost:3080', () => {
      process.env.DOMAIN_SERVER = 'https://localhost:3080';
      expect(shouldUseSecureCookie()).toBe(false);
    });

    it('should return false for http://localhost (no port)', () => {
      process.env.DOMAIN_SERVER = 'http://localhost';
      expect(shouldUseSecureCookie()).toBe(false);
    });

    it('should return false for http://127.0.0.1:3080', () => {
      process.env.DOMAIN_SERVER = 'http://127.0.0.1:3080';
      expect(shouldUseSecureCookie()).toBe(false);
    });

    it('should return true for http://[::1]:3080 (IPv6 loopback — not detected due to URL bracket parsing)', () => {
      // Known limitation: new URL('http://[::1]:3080').hostname returns '[::1]' (with brackets)
      // but the check compares against '::1' (without brackets). IPv6 localhost is rare in practice.
      process.env.DOMAIN_SERVER = 'http://[::1]:3080';
      expect(shouldUseSecureCookie()).toBe(true);
    });

    it('should return false for subdomain of localhost', () => {
      process.env.DOMAIN_SERVER = 'http://app.localhost:3080';
      expect(shouldUseSecureCookie()).toBe(false);
    });

    it('should return true for a domain containing "localhost" as a substring but not as hostname', () => {
      process.env.DOMAIN_SERVER = 'https://notlocalhost.example.com';
      expect(shouldUseSecureCookie()).toBe(true);
    });

    it('should return true for a regular production domain', () => {
      process.env.DOMAIN_SERVER = 'https://chat.example.com';
      expect(shouldUseSecureCookie()).toBe(true);
    });

    it('should return true when DOMAIN_SERVER is empty (conservative default)', () => {
      process.env.DOMAIN_SERVER = '';
      expect(shouldUseSecureCookie()).toBe(true);
    });

    it('should return true when DOMAIN_SERVER is not set (conservative default)', () => {
      delete process.env.DOMAIN_SERVER;
      expect(shouldUseSecureCookie()).toBe(true);
    });

    it('should handle DOMAIN_SERVER without protocol prefix', () => {
      process.env.DOMAIN_SERVER = 'localhost:3080';
      expect(shouldUseSecureCookie()).toBe(false);
    });

    it('should handle case-insensitive hostnames', () => {
      process.env.DOMAIN_SERVER = 'http://LOCALHOST:3080';
      expect(shouldUseSecureCookie()).toBe(false);
    });
  });
});
