/* eslint-disable @typescript-eslint/ban-ts-comment */
import { isEmailDomainAllowed, isActionDomainAllowed } from './domain';

describe('isEmailDomainAllowed', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return true if email is falsy and no domain restrictions exist', async () => {
    const email = '';
    const result = isEmailDomainAllowed(email);
    expect(result).toBe(true);
  });

  it('should return true if domain is not present in the email and no domain restrictions exist', async () => {
    const email = 'test';
    const result = isEmailDomainAllowed(email);
    expect(result).toBe(true);
  });

  it('should return false if email is falsy and domain restrictions exist', async () => {
    const email = '';
    const result = isEmailDomainAllowed(email, ['domain1.com']);
    expect(result).toBe(false);
  });

  it('should return false if domain is not present in the email and domain restrictions exist', async () => {
    const email = 'test';
    const result = isEmailDomainAllowed(email, ['domain1.com']);
    expect(result).toBe(false);
  });

  it('should return true if customConfig is not available', async () => {
    const email = 'test@domain1.com';
    const result = isEmailDomainAllowed(email, null);
    expect(result).toBe(true);
  });

  it('should return true if allowedDomains is not defined in customConfig', async () => {
    const email = 'test@domain1.com';
    const result = isEmailDomainAllowed(email, undefined);
    expect(result).toBe(true);
  });

  it('should return true if domain is included in the allowedDomains', async () => {
    const email = 'user@domain1.com';
    const result = isEmailDomainAllowed(email, ['domain1.com', 'domain2.com']);
    expect(result).toBe(true);
  });

  it('should return false if domain is not included in the allowedDomains', async () => {
    const email = 'user@domain3.com';
    const result = isEmailDomainAllowed(email, ['domain1.com', 'domain2.com']);
    expect(result).toBe(false);
  });

  describe('case-insensitive domain matching', () => {
    it('should match domains case-insensitively when email has uppercase domain', () => {
      const email = 'user@DOMAIN1.COM';
      const result = isEmailDomainAllowed(email, ['domain1.com', 'domain2.com']);
      expect(result).toBe(true);
    });

    it('should match domains case-insensitively when allowedDomains has uppercase', () => {
      const email = 'user@domain1.com';
      const result = isEmailDomainAllowed(email, ['DOMAIN1.COM', 'DOMAIN2.COM']);
      expect(result).toBe(true);
    });

    it('should match domains with mixed case in email', () => {
      const email = 'user@Example.Com';
      const result = isEmailDomainAllowed(email, ['example.com', 'domain2.com']);
      expect(result).toBe(true);
    });

    it('should match domains with mixed case in allowedDomains', () => {
      const email = 'user@example.com';
      const result = isEmailDomainAllowed(email, ['Example.Com', 'Domain2.Com']);
      expect(result).toBe(true);
    });

    it('should match when both email and allowedDomains have different mixed cases', () => {
      const email = 'user@ExAmPlE.cOm';
      const result = isEmailDomainAllowed(email, ['eXaMpLe.CoM', 'domain2.com']);
      expect(result).toBe(true);
    });

    it('should still return false for non-matching domains regardless of case', () => {
      const email = 'user@DOMAIN3.COM';
      const result = isEmailDomainAllowed(email, ['domain1.com', 'DOMAIN2.COM']);
      expect(result).toBe(false);
    });

    it('should handle null/undefined entries in allowedDomains gracefully', () => {
      const email = 'user@domain1.com';
      // @ts-expect-error Testing invalid input
      const result = isEmailDomainAllowed(email, [null, 'DOMAIN1.COM', undefined]);
      expect(result).toBe(true);
    });
  });
});

describe('isActionDomainAllowed', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // Basic Input Validation Tests
  describe('input validation', () => {
    it('should return false for falsy values', async () => {
      expect(await isActionDomainAllowed()).toBe(false);
      expect(await isActionDomainAllowed(null)).toBe(false);
      expect(await isActionDomainAllowed('')).toBe(false);
      expect(await isActionDomainAllowed(undefined)).toBe(false);
    });

    it('should return false for non-string inputs', async () => {
      /** @ts-expect-error */
      expect(await isActionDomainAllowed(123)).toBe(false);
      /** @ts-expect-error */
      expect(await isActionDomainAllowed({})).toBe(false);
      /** @ts-expect-error */
      expect(await isActionDomainAllowed([])).toBe(false);
    });

    it('should return false for invalid domain formats', async () => {
      expect(await isActionDomainAllowed('http://', ['http://', 'https://'])).toBe(false);
      expect(await isActionDomainAllowed('https://', ['http://', 'https://'])).toBe(false);
    });
  });

  // Configuration Tests
  describe('configuration handling', () => {
    it('should return true if customConfig is null', async () => {
      expect(await isActionDomainAllowed('example.com', null)).toBe(true);
    });

    it('should return true if actions.allowedDomains is not defined', async () => {
      expect(await isActionDomainAllowed('example.com', undefined)).toBe(true);
    });

    it('should return true if allowedDomains is empty array', async () => {
      expect(await isActionDomainAllowed('example.com', [])).toBe(true);
    });
  });

  // Domain Matching Tests
  describe('domain matching', () => {
    const allowedDomains = [
      'example.com',
      '*.subdomain.com',
      'specific.domain.com',
      'www.withprefix.com',
      'swapi.dev',
    ];

    it('should match exact domains', async () => {
      expect(await isActionDomainAllowed('example.com', allowedDomains)).toBe(true);
      expect(await isActionDomainAllowed('other.com', allowedDomains)).toBe(false);
      expect(await isActionDomainAllowed('swapi.dev', allowedDomains)).toBe(true);
    });

    it('should handle domains with www prefix', async () => {
      expect(await isActionDomainAllowed('www.example.com', allowedDomains)).toBe(true);
      expect(await isActionDomainAllowed('www.withprefix.com', allowedDomains)).toBe(true);
    });

    it('should handle full URLs', async () => {
      expect(await isActionDomainAllowed('https://example.com', allowedDomains)).toBe(true);
      expect(await isActionDomainAllowed('http://example.com', allowedDomains)).toBe(true);
      expect(await isActionDomainAllowed('https://example.com/path', allowedDomains)).toBe(true);
    });

    it('should handle wildcard subdomains', async () => {
      expect(await isActionDomainAllowed('test.subdomain.com', allowedDomains)).toBe(true);
      expect(await isActionDomainAllowed('any.subdomain.com', allowedDomains)).toBe(true);
      expect(await isActionDomainAllowed('subdomain.com', allowedDomains)).toBe(true);
    });

    it('should handle specific subdomains', async () => {
      expect(await isActionDomainAllowed('specific.domain.com', allowedDomains)).toBe(true);
      expect(await isActionDomainAllowed('other.domain.com', allowedDomains)).toBe(false);
    });
  });

  // Edge Cases
  describe('edge cases', () => {
    const edgeAllowedDomains = ['example.com', '*.test.com'];

    it('should handle domains with query parameters', async () => {
      expect(await isActionDomainAllowed('example.com?param=value', edgeAllowedDomains)).toBe(true);
    });

    it('should handle domains with ports', async () => {
      expect(await isActionDomainAllowed('example.com:8080', edgeAllowedDomains)).toBe(true);
    });

    it('should handle domains with trailing slashes', async () => {
      expect(await isActionDomainAllowed('example.com/', edgeAllowedDomains)).toBe(true);
    });

    it('should handle case insensitivity', async () => {
      expect(await isActionDomainAllowed('EXAMPLE.COM', edgeAllowedDomains)).toBe(true);
      expect(await isActionDomainAllowed('Example.Com', edgeAllowedDomains)).toBe(true);
    });

    it('should handle invalid entries in allowedDomains', async () => {
      const invalidAllowedDomains = ['example.com', null, undefined, '', 'test.com'];
      /** @ts-expect-error */
      expect(await isActionDomainAllowed('example.com', invalidAllowedDomains)).toBe(true);
      /** @ts-expect-error */
      expect(await isActionDomainAllowed('test.com', invalidAllowedDomains)).toBe(true);
    });
  });
});
