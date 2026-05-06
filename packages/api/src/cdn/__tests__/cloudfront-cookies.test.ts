import type { CloudfrontSignInput } from '@aws-sdk/cloudfront-signer';

const mockGetCloudFrontConfig = jest.fn();
const mockGetSignedCookies = jest.fn();

jest.mock('~/cdn/cloudfront', () => ({
  getCloudFrontConfig: () => mockGetCloudFrontConfig(),
}));

jest.mock('@aws-sdk/cloudfront-signer', () => ({
  getSignedCookies: (params: CloudfrontSignInput) => mockGetSignedCookies(params),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import type { Response } from 'express';
import {
  setCloudFrontCookies,
  clearCloudFrontCookies,
  parseCloudFrontCookieScope,
} from '../cloudfront-cookies';

const { logger: mockLogger } = jest.requireMock('@librechat/data-schemas') as {
  logger: { warn: jest.Mock; error: jest.Mock; info: jest.Mock; debug: jest.Mock };
};

const defaultScope = { userId: 'user123' };

describe('setCloudFrontCookies', () => {
  let mockRes: Partial<Response>;
  let cookieArgs: Array<[string, string, object]>;
  let clearedCookies: Array<[string, object]>;

  beforeEach(() => {
    jest.clearAllMocks();
    cookieArgs = [];
    clearedCookies = [];
    mockRes = {
      cookie: jest.fn((name: string, value: string, options: object) => {
        cookieArgs.push([name, value, options]);
        return mockRes as Response;
      }) as unknown as Response['cookie'],
      clearCookie: jest.fn((name: string, options: object) => {
        clearedCookies.push([name, options]);
        return mockRes as Response;
      }) as unknown as Response['clearCookie'],
    };
  });

  it('returns false when CloudFront config is null', () => {
    mockGetCloudFrontConfig.mockReturnValue(null);

    const result = setCloudFrontCookies(mockRes as Response, defaultScope);

    expect(result).toBe(false);
    expect(mockRes.cookie).not.toHaveBeenCalled();
  });

  it('returns false when imageSigning is not "cookies"', () => {
    mockGetCloudFrontConfig.mockReturnValue({
      domain: 'https://cdn.example.com',
      imageSigning: 'none',
      cookieDomain: '.example.com',
      privateKey: 'test-key',
      keyPairId: 'K123',
    });

    const result = setCloudFrontCookies(mockRes as Response, defaultScope);

    expect(result).toBe(false);
    expect(mockRes.cookie).not.toHaveBeenCalled();
  });

  it('returns false when signing keys are missing', () => {
    mockGetCloudFrontConfig.mockReturnValue({
      domain: 'https://cdn.example.com',
      imageSigning: 'cookies',
      cookieDomain: '.example.com',
      privateKey: null,
      keyPairId: null,
    });

    const result = setCloudFrontCookies(mockRes as Response, defaultScope);

    expect(result).toBe(false);
    expect(mockRes.cookie).not.toHaveBeenCalled();
  });

  it('returns false when cookieDomain is missing', () => {
    mockGetCloudFrontConfig.mockReturnValue({
      domain: 'https://cdn.example.com',
      imageSigning: 'cookies',
      cookieExpiry: 1800,
      privateKey: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
      keyPairId: 'K123ABC',
    });

    const result = setCloudFrontCookies(mockRes as Response, defaultScope);

    expect(result).toBe(false);
    expect(mockRes.cookie).not.toHaveBeenCalled();
  });

  it('uses default expiry of 1800s when cookieExpiry is missing from config (Zod default not applied)', () => {
    mockGetCloudFrontConfig.mockReturnValue({
      domain: 'https://cdn.example.com',
      imageSigning: 'cookies',
      // cookieExpiry intentionally absent — simulates raw YAML without Zod defaults
      cookieDomain: '.example.com',
      privateKey: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
      keyPairId: 'K123ABC',
    });

    mockGetSignedCookies.mockReturnValue({
      'CloudFront-Policy': 'policy-value',
      'CloudFront-Signature': 'signature-value',
      'CloudFront-Key-Pair-Id': 'K123ABC',
    });

    const result = setCloudFrontCookies(mockRes as Response, defaultScope);

    expect(result).toBe(true);
    expect(mockLogger.warn).not.toHaveBeenCalled();
    const [, , options] = cookieArgs[0];
    expect((options as { expires: Date }).expires).toBeInstanceOf(Date);
    expect(isNaN((options as { expires: Date }).expires.getTime())).toBe(false);
  });

  it('sets separate CloudFront cookie sets for private images and avatars when enabled', () => {
    mockGetCloudFrontConfig.mockReturnValue({
      domain: 'https://cdn.example.com',
      imageSigning: 'cookies',
      cookieExpiry: 1800,
      cookieDomain: '.example.com',
      privateKey: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
      keyPairId: 'K123ABC',
    });

    mockGetSignedCookies.mockReturnValue({
      'CloudFront-Policy': 'policy-value',
      'CloudFront-Signature': 'signature-value',
      'CloudFront-Key-Pair-Id': 'K123ABC',
    });

    const result = setCloudFrontCookies(mockRes as Response, defaultScope);

    expect(result).toBe(true);
    expect(mockRes.cookie).toHaveBeenCalledTimes(7);
    expect(mockRes.clearCookie).toHaveBeenCalledTimes(6);

    const cookieNames = cookieArgs.map(([name]) => name);
    expect(cookieNames).toContain('CloudFront-Policy');
    expect(cookieNames).toContain('CloudFront-Signature');
    expect(cookieNames).toContain('CloudFront-Key-Pair-Id');
  });

  it('uses cookieDomain from config with path-scoped cookies', () => {
    mockGetCloudFrontConfig.mockReturnValue({
      domain: 'https://cdn.example.com',
      imageSigning: 'cookies',
      cookieExpiry: 1800,
      cookieDomain: '.example.com',
      privateKey: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
      keyPairId: 'K123ABC',
    });

    mockGetSignedCookies.mockReturnValue({
      'CloudFront-Policy': 'policy-value',
      'CloudFront-Signature': 'signature-value',
      'CloudFront-Key-Pair-Id': 'K123ABC',
    });

    setCloudFrontCookies(mockRes as Response, defaultScope);

    const [, , options] = cookieArgs[0];
    expect(options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      domain: '.example.com',
      path: '/images/user123',
    });
    expect(cookieArgs[3][2]).toMatchObject({ path: '/avatars' });
  });

  it('clears legacy image-wide and avatar cookie paths before setting scoped cookies', () => {
    mockGetCloudFrontConfig.mockReturnValue({
      domain: 'https://cdn.example.com',
      imageSigning: 'cookies',
      cookieExpiry: 1800,
      cookieDomain: '.example.com',
      privateKey: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
      keyPairId: 'K123ABC',
    });

    mockGetSignedCookies.mockReturnValue({
      'CloudFront-Policy': 'policy-value',
      'CloudFront-Signature': 'signature-value',
      'CloudFront-Key-Pair-Id': 'K123ABC',
    });

    setCloudFrontCookies(mockRes as Response, defaultScope);

    expect(clearedCookies).toHaveLength(6);
    expect(clearedCookies).toContainEqual([
      'CloudFront-Policy',
      expect.objectContaining({ path: '/images' }),
    ]);
    expect(clearedCookies).toContainEqual([
      'CloudFront-Key-Pair-Id',
      expect.objectContaining({ path: '/avatars' }),
    ]);
  });

  it('clears the previously issued scoped cookie paths before setting new cookies', () => {
    mockGetCloudFrontConfig.mockReturnValue({
      domain: 'https://cdn.example.com',
      imageSigning: 'cookies',
      cookieExpiry: 1800,
      cookieDomain: '.example.com',
      privateKey: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
      keyPairId: 'K123ABC',
    });

    mockGetSignedCookies.mockReturnValue({
      'CloudFront-Policy': 'policy-value',
      'CloudFront-Signature': 'signature-value',
      'CloudFront-Key-Pair-Id': 'K123ABC',
    });

    setCloudFrontCookies(
      mockRes as Response,
      { userId: 'newUser', tenantId: 'newTenant' },
      { userId: 'oldUser', tenantId: 'oldTenant' },
    );

    expect(clearedCookies).toContainEqual([
      'CloudFront-Policy',
      expect.objectContaining({ path: '/t/oldTenant/images/oldUser' }),
    ]);
    expect(clearedCookies).toContainEqual([
      'CloudFront-Signature',
      expect.objectContaining({ path: '/t/oldTenant/avatars' }),
    ]);
  });

  it('stores the issued CloudFront cookie scope for later cleanup', () => {
    mockGetCloudFrontConfig.mockReturnValue({
      domain: 'https://cdn.example.com',
      imageSigning: 'cookies',
      cookieExpiry: 1800,
      cookieDomain: '.example.com',
      privateKey: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
      keyPairId: 'K123ABC',
    });

    mockGetSignedCookies.mockReturnValue({
      'CloudFront-Policy': 'policy-value',
      'CloudFront-Signature': 'signature-value',
      'CloudFront-Key-Pair-Id': 'K123ABC',
    });

    setCloudFrontCookies(mockRes as Response, { userId: 'user123', tenantId: 'tenantA' });

    const [name, value, options] = cookieArgs[cookieArgs.length - 1];
    expect(name).toBe('LibreChat-CloudFront-Scope');
    expect(options).toMatchObject({ domain: '.example.com', path: '/' });
    expect(Buffer.from(value, 'base64url').toString('utf8')).toBe(
      JSON.stringify({ userId: 'user123', tenantId: 'tenantA' }),
    );
  });

  it('builds user-scoped custom policies for private images and avatars', () => {
    mockGetCloudFrontConfig.mockReturnValue({
      domain: 'https://cdn.example.com',
      imageSigning: 'cookies',
      cookieExpiry: 1800,
      cookieDomain: '.example.com',
      privateKey: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
      keyPairId: 'K123ABC',
    });

    mockGetSignedCookies.mockReturnValue({
      'CloudFront-Policy': 'policy-value',
      'CloudFront-Signature': 'signature-value',
      'CloudFront-Key-Pair-Id': 'K123ABC',
    });

    setCloudFrontCookies(mockRes as Response, defaultScope);

    const privatePolicy = JSON.parse(mockGetSignedCookies.mock.calls[0][0].policy);
    const avatarPolicy = JSON.parse(mockGetSignedCookies.mock.calls[1][0].policy);
    expect(mockGetSignedCookies).toHaveBeenCalledTimes(2);
    expect(mockGetSignedCookies).toHaveBeenCalledWith(
      expect.objectContaining({
        keyPairId: 'K123ABC',
        privateKey: expect.stringContaining('BEGIN RSA PRIVATE KEY'),
      }),
    );
    expect(privatePolicy.Statement).toEqual([
      expect.objectContaining({ Resource: 'https://cdn.example.com/images/user123/*' }),
    ]);
    expect(avatarPolicy.Statement).toEqual([
      expect.objectContaining({ Resource: 'https://cdn.example.com/avatars/*' }),
    ]);
  });

  it('builds a tenant-scoped custom policy and cookie path', () => {
    mockGetCloudFrontConfig.mockReturnValue({
      domain: 'https://cdn.example.com',
      imageSigning: 'cookies',
      cookieExpiry: 1800,
      cookieDomain: '.example.com',
      privateKey: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
      keyPairId: 'K123ABC',
    });

    mockGetSignedCookies.mockReturnValue({
      'CloudFront-Policy': 'policy-value',
      'CloudFront-Signature': 'signature-value',
      'CloudFront-Key-Pair-Id': 'K123ABC',
    });

    const result = setCloudFrontCookies(mockRes as Response, {
      userId: 'user123',
      tenantId: 'tenantA',
    });

    const privatePolicy = JSON.parse(mockGetSignedCookies.mock.calls[0][0].policy);
    const avatarPolicy = JSON.parse(mockGetSignedCookies.mock.calls[1][0].policy);
    expect(result).toBe(true);
    expect(privatePolicy.Statement).toEqual([
      expect.objectContaining({
        Resource: 'https://cdn.example.com/t/tenantA/images/user123/*',
      }),
    ]);
    expect(avatarPolicy.Statement).toEqual([
      expect.objectContaining({ Resource: 'https://cdn.example.com/t/tenantA/avatars/*' }),
    ]);
    expect(cookieArgs[0][2]).toMatchObject({ path: '/t/tenantA/images/user123' });
    expect(cookieArgs[3][2]).toMatchObject({ path: '/t/tenantA/avatars' });
  });

  it('handles multiple trailing slashes in domain', () => {
    mockGetCloudFrontConfig.mockReturnValue({
      domain: 'https://cdn.example.com///',
      imageSigning: 'cookies',
      cookieExpiry: 1800,
      cookieDomain: '.example.com',
      privateKey: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
      keyPairId: 'K123ABC',
    });

    mockGetSignedCookies.mockReturnValue({
      'CloudFront-Policy': 'policy-value',
      'CloudFront-Signature': 'signature-value',
      'CloudFront-Key-Pair-Id': 'K123ABC',
    });

    setCloudFrontCookies(mockRes as Response, defaultScope);

    expect(mockGetSignedCookies).toHaveBeenCalledWith(
      expect.objectContaining({
        policy: expect.stringContaining('https://cdn.example.com/images/user123/*'),
      }),
    );
  });

  it('returns false when getSignedCookies returns empty object', () => {
    mockGetCloudFrontConfig.mockReturnValue({
      domain: 'https://cdn.example.com',
      imageSigning: 'cookies',
      cookieExpiry: 1800,
      cookieDomain: '.example.com',
      privateKey: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
      keyPairId: 'K123ABC',
    });

    mockGetSignedCookies.mockReturnValue({});

    const result = setCloudFrontCookies(mockRes as Response, defaultScope);

    expect(result).toBe(false);
    expect(mockRes.cookie).not.toHaveBeenCalled();
    expect(mockRes.clearCookie).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Missing expected cookie from AWS SDK'),
    );
  });

  it('returns false when getSignedCookies returns partial result', () => {
    mockGetCloudFrontConfig.mockReturnValue({
      domain: 'https://cdn.example.com',
      imageSigning: 'cookies',
      cookieExpiry: 1800,
      cookieDomain: '.example.com',
      privateKey: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
      keyPairId: 'K123ABC',
    });

    mockGetSignedCookies.mockReturnValue({ 'CloudFront-Policy': 'policy-value' });

    const result = setCloudFrontCookies(mockRes as Response, defaultScope);

    expect(result).toBe(false);
    expect(mockRes.cookie).not.toHaveBeenCalled();
    expect(mockRes.clearCookie).not.toHaveBeenCalled();
  });

  it('returns false when userId is missing from scope', () => {
    mockGetCloudFrontConfig.mockReturnValue({
      domain: 'https://cdn.example.com',
      imageSigning: 'cookies',
      cookieExpiry: 1800,
      cookieDomain: '.example.com',
      privateKey: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
      keyPairId: 'K123ABC',
    });

    const result = setCloudFrontCookies(mockRes as Response);

    expect(result).toBe(false);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[setCloudFrontCookies] CloudFront configured but userId missing from scope',
    );
    expect(mockRes.cookie).not.toHaveBeenCalled();
  });

  it('returns false when scope path segments contain policy wildcards or traversal', () => {
    mockGetCloudFrontConfig.mockReturnValue({
      domain: 'https://cdn.example.com',
      imageSigning: 'cookies',
      cookieExpiry: 1800,
      cookieDomain: '.example.com',
      privateKey: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
      keyPairId: 'K123ABC',
    });

    expect(setCloudFrontCookies(mockRes as Response, { userId: 'user*' })).toBe(false);
    expect(
      setCloudFrontCookies(mockRes as Response, { userId: 'user123', tenantId: '../tenantA' }),
    ).toBe(false);
    expect(
      setCloudFrontCookies(mockRes as Response, { userId: 'user123', tenantId: 'tenant A' }),
    ).toBe(false);
    expect(mockGetSignedCookies).not.toHaveBeenCalled();
    expect(mockRes.cookie).not.toHaveBeenCalled();
  });

  it('returns false and logs error on signing error', () => {
    mockGetCloudFrontConfig.mockReturnValue({
      domain: 'https://cdn.example.com',
      imageSigning: 'cookies',
      cookieExpiry: 1800,
      cookieDomain: '.example.com',
      privateKey: 'invalid-key',
      keyPairId: 'K123ABC',
    });

    const signingError = new Error('Invalid private key');
    mockGetSignedCookies.mockImplementation(() => {
      throw signingError;
    });

    const result = setCloudFrontCookies(mockRes as Response, defaultScope);

    expect(result).toBe(false);
    expect(mockRes.cookie).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      '[setCloudFrontCookies] Failed to generate signed cookies:',
      signingError,
    );
  });
});

describe('parseCloudFrontCookieScope', () => {
  const encodeScope = (scope: object) =>
    Buffer.from(JSON.stringify(scope), 'utf8').toString('base64url');

  it('round-trips a valid user and tenant scope', () => {
    const value = encodeScope({ userId: 'user123', tenantId: 'tenantA' });

    expect(parseCloudFrontCookieScope(value)).toEqual({
      userId: 'user123',
      tenantId: 'tenantA',
    });
  });

  it('returns null for empty, malformed, or userless values', () => {
    expect(parseCloudFrontCookieScope(null)).toBeNull();
    expect(parseCloudFrontCookieScope(undefined)).toBeNull();
    expect(parseCloudFrontCookieScope('')).toBeNull();
    expect(parseCloudFrontCookieScope('not-json')).toBeNull();
    expect(parseCloudFrontCookieScope(encodeScope({ tenantId: 'tenantA' }))).toBeNull();
  });

  it('rejects traversal and wildcard path segments', () => {
    expect(parseCloudFrontCookieScope(encodeScope({ userId: '../user' }))).toBeNull();
    expect(parseCloudFrontCookieScope(encodeScope({ userId: 'user*' }))).toBeNull();
    expect(
      parseCloudFrontCookieScope(encodeScope({ userId: 'user123', tenantId: 'tenant A' })),
    ).toBeNull();
  });
});

describe('clearCloudFrontCookies', () => {
  let mockRes: Partial<Response>;
  let clearedCookies: Array<[string, object]>;

  beforeEach(() => {
    jest.clearAllMocks();
    clearedCookies = [];
    mockRes = {
      clearCookie: jest.fn((name: string, options: object) => {
        clearedCookies.push([name, options]);
        return mockRes as Response;
      }) as unknown as Response['clearCookie'],
    };
  });

  it('does nothing when config is null', () => {
    mockGetCloudFrontConfig.mockReturnValue(null);

    clearCloudFrontCookies(mockRes as Response);

    expect(mockRes.clearCookie).not.toHaveBeenCalled();
  });

  it('clears stale cookies when imageSigning is not "cookies"', () => {
    mockGetCloudFrontConfig.mockReturnValue({
      domain: 'https://cdn.example.com',
      imageSigning: 'none',
      cookieDomain: '.example.com',
    });

    clearCloudFrontCookies(mockRes as Response);

    expect(mockRes.clearCookie).toHaveBeenCalledTimes(10);
  });

  it('does nothing when cookieDomain is missing', () => {
    mockGetCloudFrontConfig.mockReturnValue({
      domain: 'https://cdn.example.com',
      imageSigning: 'cookies',
    });

    clearCloudFrontCookies(mockRes as Response);

    expect(mockRes.clearCookie).not.toHaveBeenCalled();
  });

  it('clears all CloudFront cookies with correct domain and legacy paths', () => {
    mockGetCloudFrontConfig.mockReturnValue({
      domain: 'https://cdn.example.com',
      imageSigning: 'cookies',
      cookieDomain: '.example.com',
      privateKey: 'test-key',
      keyPairId: 'K123',
    });

    clearCloudFrontCookies(mockRes as Response);

    expect(mockRes.clearCookie).toHaveBeenCalledTimes(10);

    const legacyPathOptions = {
      domain: '.example.com',
      path: '/images',
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    };
    const rootPathOptions = {
      domain: '.example.com',
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    };
    expect(clearedCookies).toContainEqual(['CloudFront-Policy', legacyPathOptions]);
    expect(clearedCookies).toContainEqual(['CloudFront-Signature', legacyPathOptions]);
    expect(clearedCookies).toContainEqual(['CloudFront-Key-Pair-Id', legacyPathOptions]);
    expect(clearedCookies).toContainEqual(['CloudFront-Policy', rootPathOptions]);
    expect(clearedCookies).toContainEqual(['CloudFront-Signature', rootPathOptions]);
    expect(clearedCookies).toContainEqual(['CloudFront-Key-Pair-Id', rootPathOptions]);
  });

  it('clears tenant-scoped cookies', () => {
    mockGetCloudFrontConfig.mockReturnValue({
      domain: 'https://cdn.example.com',
      imageSigning: 'cookies',
      cookieDomain: '.example.com',
      privateKey: 'test-key',
      keyPairId: 'K123',
    });

    clearCloudFrontCookies(mockRes as Response, { userId: 'user123', tenantId: 'tenantA' });

    expect(mockRes.clearCookie).toHaveBeenCalledTimes(19);
    expect(clearedCookies).toContainEqual([
      'CloudFront-Policy',
      {
        domain: '.example.com',
        path: '/t/tenantA/images/user123',
        httpOnly: true,
        secure: true,
        sameSite: 'none',
      },
    ]);
    expect(clearedCookies).toContainEqual([
      'LibreChat-CloudFront-Scope',
      {
        domain: '.example.com',
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'none',
      },
    ]);
  });

  it('logs warning and does not throw when clearing fails', () => {
    mockGetCloudFrontConfig.mockReturnValue({
      domain: 'https://cdn.example.com',
      imageSigning: 'cookies',
      cookieDomain: '.example.com',
      privateKey: 'test-key',
      keyPairId: 'K123',
    });

    const clearError = new Error('Cookie clear failed');
    mockRes.clearCookie = jest.fn(() => {
      throw clearError;
    }) as unknown as Response['clearCookie'];

    expect(() => clearCloudFrontCookies(mockRes as Response)).not.toThrow();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[clearCloudFrontCookies] Failed to clear cookies:',
      clearError,
    );
  });
});
