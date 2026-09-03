import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import { fetch as undiciFetch } from 'undici';
import type { JwtPayload } from 'jsonwebtoken';
import { clearOidcAccessTokenCache, verifyOidcAccessToken } from './oidc';

const mockGetSigningKey = jest.fn();

jest.mock('jwks-rsa', () => jest.fn(() => ({ getSigningKey: mockGetSigningKey })));
jest.mock('undici', () => ({ fetch: jest.fn() }));
jest.mock('jsonwebtoken', () => ({ decode: jest.fn(), verify: jest.fn() }));
jest.mock('~/utils', () => ({ isEnabled: jest.fn(() => true), math: jest.fn(() => 60000) }));
jest.mock('~/utils/proxy', () => ({
  getEnvProxyDispatcher: jest.fn(),
  getHttpsProxyAgent: jest.fn(),
}));

const mockFetch = undiciFetch as jest.Mock;
const mockDecode = jwt.decode as jest.Mock;
const mockVerify = jwt.verify as jest.Mock;
const originalOpenIdJwksUrl = process.env.OPENID_JWKS_URL;
type JwtVerifyCallback = (error: Error | null, payload?: JwtPayload) => void;

afterEach(() => {
  clearOidcAccessTokenCache();
  jest.clearAllMocks();
  if (originalOpenIdJwksUrl == null) {
    delete process.env.OPENID_JWKS_URL;
  } else {
    process.env.OPENID_JWKS_URL = originalOpenIdJwksUrl;
  }
});

it('does not use the interactive OpenID JWKS override unless explicitly enabled', async () => {
  const issuer = 'https://management-issuer.example.com';
  const discoveredJwksUri = `${issuer}/jwks`;
  process.env.OPENID_JWKS_URL = 'https://interactive-login.example.com/jwks';
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ jwks_uri: discoveredJwksUri }),
  });
  mockDecode.mockReturnValue({ header: { kid: 'management-key' } });
  mockGetSigningKey.mockResolvedValue({ getPublicKey: () => 'public-key' });
  mockVerify.mockImplementation(
    (_token: string, _key: string, _options: object, callback: JwtVerifyCallback) =>
      callback(null, { sub: 'machine-client@clients' } satisfies JwtPayload),
  );

  await verifyOidcAccessToken('access-token', {
    issuer,
    audience: 'agent-management',
  });

  expect(mockFetch).toHaveBeenCalledWith(
    `${issuer}/.well-known/openid-configuration`,
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(jwksRsa).toHaveBeenCalledWith(
    expect.objectContaining({
      jwksUri: discoveredJwksUri,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    }),
  );
});
