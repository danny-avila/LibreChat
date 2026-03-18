import type { Request, Response } from 'express';
import type { AppConfig, IUser } from '@librechat/data-schemas';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('~/utils', () => ({
  isEnabled: jest.fn(() => false),
  math: jest.fn(() => 60000),
}));

const mockGetSigningKey = jest.fn();
const mockGetKeys = jest.fn();

jest.mock('jwks-rsa', () =>
  jest.fn(() => ({ getSigningKey: mockGetSigningKey, getKeys: mockGetKeys })),
);

jest.mock('jsonwebtoken', () => ({
  decode: jest.fn(),
  verify: jest.fn(),
}));

jest.mock('../auth/openid', () => ({
  findOpenIDUser: jest.fn(),
}));

import jwt from 'jsonwebtoken';
import { logger } from '@librechat/data-schemas';
import { findOpenIDUser } from '../auth/openid';
import { createRemoteAgentAuth } from './remoteAgentAuth';

const fetchMock = jest.fn();

beforeAll(() => {
  (global as unknown as Record<string, unknown>).fetch = fetchMock;
});

const FAKE_TOKEN = 'header.payload.signature';
const BASE_ISSUER = 'https://auth.example.com/realms/test';
const BASE_JWKS_URI = `${BASE_ISSUER}/protocol/openid-connect/certs`;

type SigningKeyCallback = (err: Error | null, key?: { getPublicKey: () => string }) => void;
type JwtVerifyCallback = (err: Error | null, payload?: object) => void;

const mockUser = { _id: 'uid123', id: 'uid123', email: 'agent@test.com' };

function makeRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { res: { status, json } as unknown as Response, status, json };
}

function makeReq(headers: Record<string, string> = {}): Partial<Request> {
  return { headers };
}

function makeConfig(oidcOverrides?: object, apiKeyOverrides?: object): AppConfig {
  return {
    endpoints: {
      agents: {
        remoteApi: {
          auth: {
            oidc: {
              enabled: true,
              issuer: BASE_ISSUER,
              jwksUri: BASE_JWKS_URI,
              ...oidcOverrides,
            },
            apiKey: { enabled: true, ...apiKeyOverrides },
          },
        },
      },
    },
  } as unknown as AppConfig;
}

function makeDeps(appConfig: AppConfig | null = makeConfig()) {
  return {
    findUser: jest.fn(),
    getAppConfig: jest.fn().mockResolvedValue(appConfig),
    apiKeyMiddleware: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  };
}

function setupOidcMocks(payload: object, kid = 'test-kid') {
  (jwt.decode as jest.Mock).mockReturnValue({ header: { kid }, payload });
  mockGetSigningKey.mockImplementation((_k: string, cb: SigningKeyCallback) =>
    cb(null, { getPublicKey: () => 'public-key' }),
  );
  (jwt.verify as jest.Mock).mockImplementation(
    (_t: string, _k: string, _o: object, cb: JwtVerifyCallback) => cb(null, payload),
  );
}

describe('createRemoteAgentAuth', () => {
  let mockNext: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.mockReset();
    mockNext = jest.fn();
  });

  describe('when OIDC is not enabled', () => {
    it('falls back to apiKeyMiddleware when getAppConfig returns null', async () => {
      const deps = makeDeps(null);
      const mw = createRemoteAgentAuth(deps);
      const req = makeReq();
      const { res } = makeRes();

      await mw(req as Request, res, mockNext);

      expect(deps.apiKeyMiddleware).toHaveBeenCalledWith(req, res, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('falls back to apiKeyMiddleware when oidc.enabled is false', async () => {
      const deps = makeDeps(makeConfig({ enabled: false }));
      await createRemoteAgentAuth(deps)(makeReq() as Request, makeRes().res, mockNext);
      expect(deps.apiKeyMiddleware).toHaveBeenCalled();
    });

    it('falls back to apiKeyMiddleware when remoteApi auth is absent', async () => {
      const deps = makeDeps({ endpoints: { agents: {} } } as unknown as AppConfig);
      await createRemoteAgentAuth(deps)(makeReq() as Request, makeRes().res, mockNext);
      expect(deps.apiKeyMiddleware).toHaveBeenCalled();
    });
  });

  describe('when OIDC enabled but no Bearer token', () => {
    it('falls back to apiKeyMiddleware when apiKey is enabled', async () => {
      const deps = makeDeps(makeConfig({}, { enabled: true }));
      const { res } = makeRes();

      await createRemoteAgentAuth(deps)(makeReq() as Request, res, mockNext);

      expect(deps.apiKeyMiddleware).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('returns 401 when apiKey is disabled and no token present', async () => {
      const deps = makeDeps(makeConfig({}, { enabled: false }));
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(deps)(makeReq() as Request, res, mockNext);

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Bearer token required' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('when OIDC verification succeeds', () => {
    beforeEach(() => {
      (findOpenIDUser as jest.Mock).mockResolvedValue({ user: { ...mockUser }, error: null });
    });

    it('sets req.user and calls next()', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@test.com', exp: 9999999999 });
      const deps = makeDeps();
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });
      const { res } = makeRes();

      await createRemoteAgentAuth(deps)(req as Request, res, mockNext);

      expect(req.user).toMatchObject({ id: 'uid123', email: 'agent@test.com' });
      expect(mockNext).toHaveBeenCalledWith();
      expect(deps.apiKeyMiddleware).not.toHaveBeenCalled();
    });

    it('attaches federatedTokens with access_token and expires_at', async () => {
      const exp = 1234567890;
      setupOidcMocks({ sub: 'sub123', email: 'agent@test.com', exp });
      const deps = makeDeps();
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });

      await createRemoteAgentAuth(deps)(req as Request, makeRes().res, mockNext);

      expect((req.user as IUser).federatedTokens).toEqual({
        access_token: FAKE_TOKEN,
        expires_at: exp,
      });
    });

    it('falls back to apiKeyMiddleware when user is not found and apiKey is enabled', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@test.com' });
      (findOpenIDUser as jest.Mock).mockResolvedValue({ user: null, error: null });

      const deps = makeDeps(makeConfig({}, { enabled: true }));
      const { res } = makeRes();

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(deps.apiKeyMiddleware).toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('no matching LibreChat user'),
      );
    });

    it('returns 401 when user is not found and apiKey is disabled', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@test.com' });
      (findOpenIDUser as jest.Mock).mockResolvedValue({ user: null, error: null });

      const deps = makeDeps(makeConfig({}, { enabled: false }));
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('when OIDC verification fails', () => {
    beforeEach(() => {
      (jwt.decode as jest.Mock).mockReturnValue({ header: { kid: 'kid' }, payload: {} });
      mockGetSigningKey.mockImplementation((_k: string, cb: SigningKeyCallback) =>
        cb(new Error('Signing key not found')),
      );
    });

    it('falls back to apiKeyMiddleware when apiKey is enabled', async () => {
      const deps = makeDeps(makeConfig({}, { enabled: true }));
      const { res } = makeRes();

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(deps.apiKeyMiddleware).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('OIDC verification failed'),
        expect.any(Error),
      );
    });

    it('returns 401 when apiKey is disabled', async () => {
      const deps = makeDeps(makeConfig({}, { enabled: false }));
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('returns 401 when JWT cannot be decoded', async () => {
      (jwt.decode as jest.Mock).mockReturnValue(null);
      const deps = makeDeps(makeConfig({}, { enabled: false }));
      const { res, status } = makeRes();

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: 'Bearer not.a.jwt' }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
    });
  });

  describe('unexpected errors', () => {
    it('returns 500 when getAppConfig throws', async () => {
      const deps = {
        ...makeDeps(),
        getAppConfig: jest.fn().mockRejectedValue(new Error('DB down')),
      };
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(deps)(makeReq() as Request, res, mockNext);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Internal server error' });
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Unexpected error'),
        expect.any(Error),
      );
    });

    it('returns 401 when findOpenIDUser throws and apiKey is disabled', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@test.com' });
      (findOpenIDUser as jest.Mock).mockRejectedValue(new Error('DB error'));

      const deps = makeDeps(makeConfig({}, { enabled: false }));
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });
  });

  describe('JWKS URI resolution', () => {
    beforeEach(() => {
      setupOidcMocks({ sub: 'sub1', email: 'a@b.com' });
      (findOpenIDUser as jest.Mock).mockResolvedValue({ user: { ...mockUser }, error: null });
    });

    it('uses jwksUri from config and skips discovery', async () => {
      const deps = makeDeps(
        makeConfig({
          jwksUri: 'https://explicit-1.example.com/jwks',
          issuer: 'https://issuer-explicit-1.example.com',
        }),
      );

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(fetchMock).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('uses OPENID_JWKS_URL env var and skips discovery', async () => {
      process.env.OPENID_JWKS_URL = 'https://env.example.com/jwks';
      const deps = makeDeps(
        makeConfig({ jwksUri: undefined, issuer: 'https://issuer-env-1.example.com' }),
      );

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(fetchMock).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();

      delete process.env.OPENID_JWKS_URL;
    });

    it('fetches discovery document when jwksUri and env var are absent', async () => {
      delete process.env.OPENID_JWKS_URL;
      const issuer = 'https://issuer-discovery-1.example.com';

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ jwks_uri: `${issuer}/protocol/openid-connect/certs` }),
      });

      const deps = makeDeps(makeConfig({ jwksUri: undefined, issuer }));

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(fetchMock).toHaveBeenCalledWith(`${issuer}/.well-known/openid-configuration`);
      expect(mockNext).toHaveBeenCalled();
    });

    it('returns 401 when discovery returns non-ok response', async () => {
      delete process.env.OPENID_JWKS_URL;
      fetchMock.mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });

      const deps = makeDeps(
        makeConfig(
          { jwksUri: undefined, issuer: 'https://issuer-discovery-fail-1.example.com' },
          { enabled: false },
        ),
      );
      const { res, status } = makeRes();

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
    });

    it('returns 401 when discovery response is missing jwks_uri field', async () => {
      delete process.env.OPENID_JWKS_URL;
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

      const deps = makeDeps(
        makeConfig(
          { jwksUri: undefined, issuer: 'https://issuer-missing-jwks-1.example.com' },
          { enabled: false },
        ),
      );
      const { res, status } = makeRes();

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
    });
  });

  describe('email claim resolution', () => {
    async function captureEmailArg(claims: object): Promise<string | undefined> {
      setupOidcMocks(claims);
      (findOpenIDUser as jest.Mock).mockResolvedValue({ user: { ...mockUser }, error: null });

      const deps = makeDeps();
      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      return (findOpenIDUser as jest.Mock).mock.calls[0][0].email;
    }

    it('uses email claim', async () => {
      expect(await captureEmailArg({ sub: 's1', email: 'user@example.com' })).toBe(
        'user@example.com',
      );
    });

    it('falls back to preferred_username when email is absent', async () => {
      expect(await captureEmailArg({ sub: 's2', preferred_username: 'agent-user' })).toBe(
        'agent-user',
      );
    });

    it('falls back to upn when email and preferred_username are absent', async () => {
      expect(await captureEmailArg({ sub: 's3', upn: 'upn@corp.com' })).toBe('upn@corp.com');
    });
  });
});
