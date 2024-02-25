const getCustomConfig = require('~/server/services/Config/getCustomConfig');
const { isDomainAllowed } = require('./AuthService');

jest.mock('~/server/services/Config/getCustomConfig', () => jest.fn());

describe('isDomainAllowed', () => {
  it('should allow domain when customConfig is not available', async () => {
    getCustomConfig.mockResolvedValue(null);
    await expect(isDomainAllowed('test@domain1.com')).resolves.toBe(true);
  });

  it('should allow domain when allowedDomains is not defined in customConfig', async () => {
    getCustomConfig.mockResolvedValue({});
    await expect(isDomainAllowed('test@domain1.com')).resolves.toBe(true);
  });

  it('should reject an email if it is falsy', async () => {
    getCustomConfig.mockResolvedValue({});
    await expect(isDomainAllowed('')).resolves.toBe(false);
  });

  it('should allow a domain if it is included in the allowedDomains', async () => {
    getCustomConfig.mockResolvedValue({
      registration: {
        allowedDomains: ['domain1.com', 'domain2.com'],
      },
    });
    await expect(isDomainAllowed('user@domain1.com')).resolves.toBe(true);
  });

  it('should reject a domain if it is not included in the allowedDomains', async () => {
    getCustomConfig.mockResolvedValue({
      registration: {
        allowedDomains: ['domain1.com', 'domain2.com'],
      },
    });
    await expect(isDomainAllowed('user@domain3.com')).resolves.toBe(false);
  });
});
