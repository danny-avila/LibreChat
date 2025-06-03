const { isEmailDomainAllowed, isActionDomainAllowed } = require('~/server/services/domains');
const { getCustomConfig } = require('~/server/services/Config');

jest.mock('~/server/services/Config', () => ({
  getCustomConfig: jest.fn(),
}));

describe('isEmailDomainAllowed', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return false if email is falsy', async () => {
    const email = '';
    const result = await isEmailDomainAllowed(email);
    expect(result).toBe(false);
  });

  it('should return false if domain is not present in the email', async () => {
    const email = 'test';
    const result = await isEmailDomainAllowed(email);
    expect(result).toBe(false);
  });

  it('should return true if customConfig is not available', async () => {
    const email = 'test@domain1.com';
    getCustomConfig.mockResolvedValue(null);
    const result = await isEmailDomainAllowed(email);
    expect(result).toBe(true);
  });

  it('should return true if allowedDomains is not defined in customConfig', async () => {
    const email = 'test@domain1.com';
    getCustomConfig.mockResolvedValue({});
    const result = await isEmailDomainAllowed(email);
    expect(result).toBe(true);
  });

  it('should return true if domain is included in the allowedDomains', async () => {
    const email = 'user@domain1.com';
    getCustomConfig.mockResolvedValue({
      registration: {
        allowedDomains: ['domain1.com', 'domain2.com'],
      },
    });
    const result = await isEmailDomainAllowed(email);
    expect(result).toBe(true);
  });

  it('should return false if domain is not included in the allowedDomains', async () => {
    const email = 'user@domain3.com';
    getCustomConfig.mockResolvedValue({
      registration: {
        allowedDomains: ['domain1.com', 'domain2.com'],
      },
    });
    const result = await isEmailDomainAllowed(email);
    expect(result).toBe(false);
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
      expect(await isActionDomainAllowed(123)).toBe(false);
      expect(await isActionDomainAllowed({})).toBe(false);
      expect(await isActionDomainAllowed([])).toBe(false);
    });

    it('should return false for invalid domain formats', async () => {
      getCustomConfig.mockResolvedValue({
        actions: { allowedDomains: ['http://', 'https://'] },
      });
      expect(await isActionDomainAllowed('http://')).toBe(false);
      expect(await isActionDomainAllowed('https://')).toBe(false);
    });
  });

  // Configuration Tests
  describe('configuration handling', () => {
    it('should return true if customConfig is null', async () => {
      getCustomConfig.mockResolvedValue(null);
      expect(await isActionDomainAllowed('example.com')).toBe(true);
    });

    it('should return true if actions.allowedDomains is not defined', async () => {
      getCustomConfig.mockResolvedValue({});
      expect(await isActionDomainAllowed('example.com')).toBe(true);
    });

    it('should return true if allowedDomains is empty array', async () => {
      getCustomConfig.mockResolvedValue({
        actions: { allowedDomains: [] },
      });
      expect(await isActionDomainAllowed('example.com')).toBe(true);
    });
  });

  // Domain Matching Tests
  describe('domain matching', () => {
    beforeEach(() => {
      getCustomConfig.mockResolvedValue({
        actions: {
          allowedDomains: [
            'example.com',
            '*.subdomain.com',
            'specific.domain.com',
            'www.withprefix.com',
            'swapi.dev',
          ],
        },
      });
    });

    it('should match exact domains', async () => {
      expect(await isActionDomainAllowed('example.com')).toBe(true);
      expect(await isActionDomainAllowed('other.com')).toBe(false);
      expect(await isActionDomainAllowed('swapi.dev')).toBe(true);
    });

    it('should handle domains with www prefix', async () => {
      expect(await isActionDomainAllowed('www.example.com')).toBe(true);
      expect(await isActionDomainAllowed('www.withprefix.com')).toBe(true);
    });

    it('should handle full URLs', async () => {
      expect(await isActionDomainAllowed('https://example.com')).toBe(true);
      expect(await isActionDomainAllowed('http://example.com')).toBe(true);
      expect(await isActionDomainAllowed('https://example.com/path')).toBe(true);
    });

    it('should handle wildcard subdomains', async () => {
      expect(await isActionDomainAllowed('test.subdomain.com')).toBe(true);
      expect(await isActionDomainAllowed('any.subdomain.com')).toBe(true);
      expect(await isActionDomainAllowed('subdomain.com')).toBe(true);
    });

    it('should handle specific subdomains', async () => {
      expect(await isActionDomainAllowed('specific.domain.com')).toBe(true);
      expect(await isActionDomainAllowed('other.domain.com')).toBe(false);
    });
  });

  // Edge Cases
  describe('edge cases', () => {
    beforeEach(() => {
      getCustomConfig.mockResolvedValue({
        actions: {
          allowedDomains: ['example.com', '*.test.com'],
        },
      });
    });

    it('should handle domains with query parameters', async () => {
      expect(await isActionDomainAllowed('example.com?param=value')).toBe(true);
    });

    it('should handle domains with ports', async () => {
      expect(await isActionDomainAllowed('example.com:8080')).toBe(true);
    });

    it('should handle domains with trailing slashes', async () => {
      expect(await isActionDomainAllowed('example.com/')).toBe(true);
    });

    it('should handle case insensitivity', async () => {
      expect(await isActionDomainAllowed('EXAMPLE.COM')).toBe(true);
      expect(await isActionDomainAllowed('Example.Com')).toBe(true);
    });

    it('should handle invalid entries in allowedDomains', async () => {
      getCustomConfig.mockResolvedValue({
        actions: {
          allowedDomains: ['example.com', null, undefined, '', 'test.com'],
        },
      });
      expect(await isActionDomainAllowed('example.com')).toBe(true);
      expect(await isActionDomainAllowed('test.com')).toBe(true);
    });
  });
});
