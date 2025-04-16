const { Constants, EModelEndpoint, actionDomainSeparator } = require('librechat-data-provider');
const { domainParser } = require('./ActionService');

jest.mock('keyv');
jest.mock('~/server/services/Config', () => ({
  getCustomConfig: jest.fn(),
}));

const globalCache = {};
jest.mock('~/cache/getLogStores', () => {
  return jest.fn().mockImplementation(() => {
    const EventEmitter = require('events');
    const { CacheKeys } = require('librechat-data-provider');

    class KeyvMongo extends EventEmitter {
      constructor(url = 'mongodb://127.0.0.1:27017', options) {
        super();
        this.ttlSupport = false;
        url = url ?? {};
        if (typeof url === 'string') {
          url = { url };
        }
        if (url.uri) {
          url = { url: url.uri, ...url };
        }
        this.opts = {
          url,
          collection: 'keyv',
          ...url,
          ...options,
        };
      }

      get = async (key) => {
        return new Promise((resolve) => {
          resolve(globalCache[key] || null);
        });
      };

      set = async (key, value) => {
        return new Promise((resolve) => {
          globalCache[key] = value;
          resolve(true);
        });
      };
    }

    return new KeyvMongo('', {
      namespace: CacheKeys.ENCODED_DOMAINS,
      ttl: 0,
    });
  });
});

describe('domainParser', () => {
  const req = {
    app: {
      locals: {
        [EModelEndpoint.azureOpenAI]: {
          assistants: true,
        },
      },
    },
  };

  const reqNoAzure = {
    app: {
      locals: {
        [EModelEndpoint.azureOpenAI]: {
          assistants: false,
        },
      },
    },
  };

  const TLD = '.com';

  // Non-azure request
  it('does not return domain as is if not azure', async () => {
    const domain = `example.com${actionDomainSeparator}test${actionDomainSeparator}`;
    const result1 = await domainParser(domain, false);
    const result2 = await domainParser(domain, true);
    expect(result1).not.toEqual(domain);
    expect(result2).not.toEqual(domain);
  });

  // Test for Empty or Null Inputs
  it('returns undefined for null domain input', async () => {
    const result = await domainParser(null, true);
    expect(result).toBeUndefined();
  });

  it('returns undefined for empty domain input', async () => {
    const result = await domainParser('', true);
    expect(result).toBeUndefined();
  });

  // Verify Correct Caching Behavior
  it('caches encoded domain correctly', async () => {
    const domain = 'longdomainname.com';
    const encodedDomain = Buffer.from(domain)
      .toString('base64')
      .substring(0, Constants.ENCODED_DOMAIN_LENGTH);

    await domainParser(domain, true);

    const cachedValue = await globalCache[encodedDomain];
    expect(cachedValue).toEqual(Buffer.from(domain).toString('base64'));
  });

  // Test for Edge Cases Around Length Threshold
  it('encodes domain exactly at threshold without modification', async () => {
    const domain = 'a'.repeat(Constants.ENCODED_DOMAIN_LENGTH - TLD.length) + TLD;
    const expected = domain.replace(/\./g, actionDomainSeparator);
    const result = await domainParser(domain, true);
    expect(result).toEqual(expected);
  });

  it('encodes domain just below threshold without modification', async () => {
    const domain = 'a'.repeat(Constants.ENCODED_DOMAIN_LENGTH - 1 - TLD.length) + TLD;
    const expected = domain.replace(/\./g, actionDomainSeparator);
    const result = await domainParser(domain, true);
    expect(result).toEqual(expected);
  });

  // Test for Unicode Domain Names
  it('handles unicode characters in domain names correctly when encoding', async () => {
    const unicodeDomain = 'täst.example.com';
    const encodedDomain = Buffer.from(unicodeDomain)
      .toString('base64')
      .substring(0, Constants.ENCODED_DOMAIN_LENGTH);
    const result = await domainParser(unicodeDomain, true);
    expect(result).toEqual(encodedDomain);
  });

  it('decodes unicode domain names correctly', async () => {
    const unicodeDomain = 'täst.example.com';
    const encodedDomain = Buffer.from(unicodeDomain).toString('base64');
    globalCache[encodedDomain.substring(0, Constants.ENCODED_DOMAIN_LENGTH)] = encodedDomain; // Simulate caching

    const result = await domainParser(
      encodedDomain.substring(0, Constants.ENCODED_DOMAIN_LENGTH),
      false,
    );
    expect(result).toEqual(unicodeDomain);
  });

  // Core Functionality Tests
  it('returns domain with replaced separators if no cached domain exists', async () => {
    const domain = 'example.com';
    const withSeparator = domain.replace(/\./g, actionDomainSeparator);
    const result = await domainParser(withSeparator, false);
    expect(result).toEqual(domain);
  });

  it('returns domain with replaced separators when inverse is false and under encoding length', async () => {
    const domain = 'examp.com';
    const withSeparator = domain.replace(/\./g, actionDomainSeparator);
    const result = await domainParser(withSeparator, false);
    expect(result).toEqual(domain);
  });

  it('replaces periods with actionDomainSeparator when inverse is true and under encoding length', async () => {
    const domain = 'examp.com';
    const expected = domain.replace(/\./g, actionDomainSeparator);
    const result = await domainParser(domain, true);
    expect(result).toEqual(expected);
  });

  it('encodes domain when length is above threshold and inverse is true', async () => {
    const domain = 'a'.repeat(Constants.ENCODED_DOMAIN_LENGTH + 1).concat('.com');
    const result = await domainParser(domain, true);
    expect(result).not.toEqual(domain);
    expect(result.length).toBeLessThanOrEqual(Constants.ENCODED_DOMAIN_LENGTH);
  });

  it('returns encoded value if no encoded value is cached, and inverse is false', async () => {
    const originalDomain = 'example.com';
    const encodedDomain = Buffer.from(
      originalDomain.replace(/\./g, actionDomainSeparator),
    ).toString('base64');
    const result = await domainParser(encodedDomain, false);
    expect(result).toEqual(encodedDomain);
  });

  it('decodes encoded value if cached and encoded value is provided, and inverse is false', async () => {
    const originalDomain = 'example.com';
    const encodedDomain = await domainParser(originalDomain, true);
    const result = await domainParser(encodedDomain, false);
    expect(result).toEqual(originalDomain);
  });

  it('handles invalid base64 encoded values gracefully', async () => {
    const invalidBase64Domain = 'not_base64_encoded';
    const result = await domainParser(invalidBase64Domain, false);
    expect(result).toEqual(invalidBase64Domain);
  });
});
