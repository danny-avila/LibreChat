const { getCustomConfig } = require('~/server/services/Config');
const isDomainAllowed = require('./isDomainAllowed');

jest.mock('~/server/services/Config', () => ({
  getCustomConfig: jest.fn(),
}));

describe('isDomainAllowed', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return false if email is falsy', async () => {
    const email = '';
    const result = await isDomainAllowed(email);
    expect(result).toBe(false);
  });

  it('should return false if domain is not present in the email', async () => {
    const email = 'test';
    const result = await isDomainAllowed(email);
    expect(result).toBe(false);
  });

  it('should return true if customConfig is not available', async () => {
    const email = 'test@domain1.com';
    getCustomConfig.mockResolvedValue(null);
    const result = await isDomainAllowed(email);
    expect(result).toBe(true);
  });

  it('should return true if allowedDomains is not defined in customConfig', async () => {
    const email = 'test@domain1.com';
    getCustomConfig.mockResolvedValue({});
    const result = await isDomainAllowed(email);
    expect(result).toBe(true);
  });

  it('should return true if domain is included in the allowedDomains', async () => {
    const email = 'user@domain1.com';
    getCustomConfig.mockResolvedValue({
      registration: {
        allowedDomains: ['domain1.com', 'domain2.com'],
      },
    });
    const result = await isDomainAllowed(email);
    expect(result).toBe(true);
  });

  it('should return false if domain is not included in the allowedDomains', async () => {
    const email = 'user@domain3.com';
    getCustomConfig.mockResolvedValue({
      registration: {
        allowedDomains: ['domain1.com', 'domain2.com'],
      },
    });
    const result = await isDomainAllowed(email);
    expect(result).toBe(false);
  });
});
