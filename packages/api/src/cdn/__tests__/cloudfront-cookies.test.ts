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
import { setCloudFrontCookies, clearCloudFrontCookies } from '../cloudfront-cookies';

const { logger: mockLogger } = jest.requireMock('@librechat/data-schemas') as {
  logger: { warn: jest.Mock; error: jest.Mock; info: jest.Mock; debug: jest.Mock };
};

describe('setCloudFrontCookies', () => {
  let mockRes: Partial<Response>;
  let cookieArgs: Array<[string, string, object]>;

  beforeEach(() => {
    jest.clearAllMocks();
    cookieArgs = [];
    mockRes = {
      cookie: jest.fn((name: string, value: string, options: object) => {
        cookieArgs.push([name, value, options]);
        return mockRes as Response;
      }) as unknown as Response['cookie'],
    };
  });

  it('returns false when CloudFront config is null', () => {
    mockGetCloudFrontConfig.mockReturnValue(null);

    const result = setCloudFrontCookies(mockRes as Response);

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

    const result = setCloudFrontCookies(mockRes as Response);

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

    const result = setCloudFrontCookies(mockRes as Response);

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

    const result = setCloudFrontCookies(mockRes as Response);

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

    const result = setCloudFrontCookies(mockRes as Response);

    expect(result).toBe(true);
    expect(mockLogger.warn).not.toHaveBeenCalled();
    const [, , options] = cookieArgs[0];
    expect((options as { expires: Date }).expires).toBeInstanceOf(Date);
    expect(isNaN((options as { expires: Date }).expires.getTime())).toBe(false);
  });

  it('sets three CloudFront cookies when enabled', () => {
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

    const result = setCloudFrontCookies(mockRes as Response);

    expect(result).toBe(true);
    expect(mockRes.cookie).toHaveBeenCalledTimes(3);

    const cookieNames = cookieArgs.map(([name]) => name);
    expect(cookieNames).toContain('CloudFront-Policy');
    expect(cookieNames).toContain('CloudFront-Signature');
    expect(cookieNames).toContain('CloudFront-Key-Pair-Id');
  });

  it('uses cookieDomain from config with path', () => {
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

    setCloudFrontCookies(mockRes as Response);

    const [, , options] = cookieArgs[0];
    expect(options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      domain: '.example.com',
      path: '/images',
    });
  });

  it('builds correct custom policy for images resource', () => {
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

    setCloudFrontCookies(mockRes as Response);

    expect(mockGetSignedCookies).toHaveBeenCalledWith(
      expect.objectContaining({
        keyPairId: 'K123ABC',
        privateKey: expect.stringContaining('BEGIN RSA PRIVATE KEY'),
        policy: expect.stringContaining('https://cdn.example.com/images/*'),
      }),
    );
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

    setCloudFrontCookies(mockRes as Response);

    expect(mockGetSignedCookies).toHaveBeenCalledWith(
      expect.objectContaining({
        policy: expect.stringContaining('https://cdn.example.com/images/*'),
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

    const result = setCloudFrontCookies(mockRes as Response);

    expect(result).toBe(false);
    expect(mockRes.cookie).not.toHaveBeenCalled();
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

    const result = setCloudFrontCookies(mockRes as Response);

    expect(result).toBe(false);
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

    const result = setCloudFrontCookies(mockRes as Response);

    expect(result).toBe(false);
    expect(mockRes.cookie).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      '[setCloudFrontCookies] Failed to generate signed cookies:',
      signingError,
    );
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

  it('does nothing when imageSigning is not "cookies"', () => {
    mockGetCloudFrontConfig.mockReturnValue({
      domain: 'https://cdn.example.com',
      imageSigning: 'none',
      cookieDomain: '.example.com',
    });

    clearCloudFrontCookies(mockRes as Response);

    expect(mockRes.clearCookie).not.toHaveBeenCalled();
  });

  it('does nothing when cookieDomain is missing', () => {
    mockGetCloudFrontConfig.mockReturnValue({
      domain: 'https://cdn.example.com',
      imageSigning: 'cookies',
    });

    clearCloudFrontCookies(mockRes as Response);

    expect(mockRes.clearCookie).not.toHaveBeenCalled();
  });

  it('clears all three CloudFront cookies with correct domain', () => {
    mockGetCloudFrontConfig.mockReturnValue({
      domain: 'https://cdn.example.com',
      imageSigning: 'cookies',
      cookieDomain: '.example.com',
      privateKey: 'test-key',
      keyPairId: 'K123',
    });

    clearCloudFrontCookies(mockRes as Response);

    expect(mockRes.clearCookie).toHaveBeenCalledTimes(3);

    const expectedOptions = {
      domain: '.example.com',
      path: '/images',
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    };
    expect(clearedCookies).toContainEqual(['CloudFront-Policy', expectedOptions]);
    expect(clearedCookies).toContainEqual(['CloudFront-Signature', expectedOptions]);
    expect(clearedCookies).toContainEqual(['CloudFront-Key-Pair-Id', expectedOptions]);
  });

  it('clears cookies with full security attributes matching set path', () => {
    mockGetCloudFrontConfig.mockReturnValue({
      domain: 'https://cdn.example.com',
      imageSigning: 'cookies',
      cookieDomain: '.example.com',
      privateKey: 'test-key',
      keyPairId: 'K123',
    });

    clearCloudFrontCookies(mockRes as Response);

    expect(mockRes.clearCookie).toHaveBeenCalledTimes(3);

    const expectedOptions = {
      domain: '.example.com',
      path: '/images',
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    };
    expect(clearedCookies).toContainEqual(['CloudFront-Policy', expectedOptions]);
    expect(clearedCookies).toContainEqual(['CloudFront-Signature', expectedOptions]);
    expect(clearedCookies).toContainEqual(['CloudFront-Key-Pair-Id', expectedOptions]);
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
