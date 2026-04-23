import { shouldUseSecureCookie } from './csrf';

describe('shouldUseSecureCookie', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
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

    it('should return false for http://[::1]:3080 (any explicit http:// scheme opts out of secure)', () => {
      // Regardless of whether IPv6 loopback is recognised as localhost, an
      // explicit http:// scheme means Secure cookies cannot be transmitted.
      process.env.DOMAIN_SERVER = 'http://[::1]:3080';
      expect(shouldUseSecureCookie()).toBe(false);
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

  describe('explicit http:// scheme opts out of secure cookies', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('should return false for a LAN IP served over plain HTTP', () => {
      process.env.DOMAIN_SERVER = 'http://10.0.0.5';
      expect(shouldUseSecureCookie()).toBe(false);
    });

    it('should return false for a public IP served over plain HTTP', () => {
      process.env.DOMAIN_SERVER = 'http://34.64.12.34';
      expect(shouldUseSecureCookie()).toBe(false);
    });

    it('should return false for a plain-HTTP FQDN (intranet pilot)', () => {
      process.env.DOMAIN_SERVER = 'http://chat.intranet.example';
      expect(shouldUseSecureCookie()).toBe(false);
    });

    it('should still return true for explicit HTTPS on the same host', () => {
      process.env.DOMAIN_SERVER = 'https://chat.intranet.example';
      expect(shouldUseSecureCookie()).toBe(true);
    });

    it('should return true when scheme is omitted (operator relied on default)', () => {
      // We only opt out for explicit http://; omitting the scheme must keep
      // the historical default so HTTPS deployments that set DOMAIN_SERVER=
      // chat.example.com without a scheme keep Secure cookies.
      process.env.DOMAIN_SERVER = 'chat.example.com';
      expect(shouldUseSecureCookie()).toBe(true);
    });
  });
});
