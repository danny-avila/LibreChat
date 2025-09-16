const { isEmailDomainAllowed, isActionDomainAllowed } = require('~/server/services/domains');
const { getAppConfig } = require('~/server/services/Config');

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn(),
}));

describe('isEmailDomainAllowed', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return false if email is falsy', async () => {
    const email = '';
    const result = isEmailDomainAllowed(email);
    expect(result).toBe(false);
  });

  it('should return false if domain is not present in the email', async () => {
    const email = 'test';
    const result = isEmailDomainAllowed(email);
    expect(result).toBe(false);
  });

  it('should return true if customConfig is not available', async () => {
    const email = 'test@domain1.com';
    getAppConfig.mockResolvedValue(null);
    const result = isEmailDomainAllowed(email, null);
    expect(result).toBe(true);
  });

  it('should return true if allowedDomains is not defined in customConfig', async () => {
    const email = 'test@domain1.com';
    getAppConfig.mockResolvedValue({});
    const result = isEmailDomainAllowed(email, undefined);
    expect(result).toBe(true);
  });

  it('should return true if domain is included in the allowedDomains', async () => {
    const email = 'user@domain1.com';
    getAppConfig.mockResolvedValue({
      registration: {
        allowedDomains: ['domain1.com', 'domain2.com'],
      },
    });
    const result = isEmailDomainAllowed(email, ['domain1.com', 'domain2.com']);
    expect(result).toBe(true);
  });

  it('should return false if domain is not included in the allowedDomains', async () => {
    const email = 'user@domain3.com';
    getAppConfig.mockResolvedValue({
      registration: {
        allowedDomains: ['domain1.com', 'domain2.com'],
      },
    });
    const result = isEmailDomainAllowed(email, ['domain1.com', 'domain2.com']);
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
      getAppConfig.mockResolvedValue({
        actions: { allowedDomains: ['http://', 'https://'] },
      });
      expect(await isActionDomainAllowed('http://', ['http://', 'https://'])).toBe(false);
      expect(await isActionDomainAllowed('https://', ['http://', 'https://'])).toBe(false);
    });
  });

  // Configuration Tests
  describe('configuration handling', () => {
    it('should return true if customConfig is null', async () => {
      getAppConfig.mockResolvedValue(null);
      expect(await isActionDomainAllowed('example.com', null)).toBe(true);
    });

    it('should return true if actions.allowedDomains is not defined', async () => {
      getAppConfig.mockResolvedValue({});
      expect(await isActionDomainAllowed('example.com', undefined)).toBe(true);
    });

    it('should return true if allowedDomains is empty array', async () => {
      getAppConfig.mockResolvedValue({
        actions: { allowedDomains: [] },
      });
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

    beforeEach(() => {
      getAppConfig.mockResolvedValue({
        actions: {
          allowedDomains,
        },
      });
    });

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

    beforeEach(() => {
      getAppConfig.mockResolvedValue({
        actions: {
          allowedDomains: edgeAllowedDomains,
        },
      });
    });

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
      getAppConfig.mockResolvedValue({
        actions: {
          allowedDomains: invalidAllowedDomains,
        },
      });
      expect(await isActionDomainAllowed('example.com', invalidAllowedDomains)).toBe(true);
      expect(await isActionDomainAllowed('test.com', invalidAllowedDomains)).toBe(true);
    });
  });
});
