import { tenantStorage, ClerkAuthClaimError } from '@librechat/data-schemas';
import type { ClerkAuthConfigEnabled } from './types';
import type { VerifiedClerkIdentity } from './verify';
import {
  validateClerkLoginBody,
  clerkLoginErrorAdapter,
  createPrepareClerkLogin,
  createEnforceClerkLoginPolicy,
  createCommitClerkLogin,
  createCompleteClerkLogin,
  createClerkAuthHandlers,
  ClerkRouteError,
  MAX_CLERK_TOKEN_BYTES,
} from './handler';
import { verifyClerkSessionToken, ClerkAuthError } from './verify';
import { resolveClerkIdentity } from './service';
import { fetchClerkProfile } from './profile';

jest.mock('./verify', () => ({
  ...jest.requireActual('./verify'),
  verifyClerkSessionToken: jest.fn(),
}));
jest.mock('./profile', () => ({
  ...jest.requireActual('./profile'),
  fetchClerkProfile: jest.fn(),
}));
jest.mock('./service', () => ({
  ...jest.requireActual('./service'),
  resolveClerkIdentity: jest.fn(),
}));

const mockVerifyClerkSessionToken = verifyClerkSessionToken as jest.Mock;
const mockFetchClerkProfile = fetchClerkProfile as jest.Mock;
const mockResolveClerkIdentity = resolveClerkIdentity as jest.Mock;

const enabledConfig: ClerkAuthConfigEnabled = {
  enabled: true,
  publishableKey: 'pk_test',
  secretKey: 'sk_test',
  jwtKey: '-----BEGIN PUBLIC KEY-----\nTEST\n-----END PUBLIC KEY-----',
  authorizedParties: ['https://chat.example.com'],
  webhookSigningSecret: 'whsec_test',
};

const claims: VerifiedClerkIdentity = {
  clerkId: 'user_clerk',
  clerkSessionId: 'sess_clerk',
  clerkTokenId: 'tok_clerk',
  authorizedParty: 'https://chat.example.com',
  tokenIssuedAt: new Date('2026-08-13T12:00:00.000Z'),
  tokenExpiresAt: new Date('2026-08-13T12:10:00.000Z'),
};

function createReq(overrides: Record<string, unknown> = {}) {
  return { body: { clerkToken: 'a.b.c' }, ...overrides } as never;
}

function createNext() {
  return jest.fn();
}

describe('validateClerkLoginBody', () => {
  it('accepts a body with only a non-empty clerkToken', () => {
    const next = createNext();
    validateClerkLoginBody(createReq(), {} as never, next);
    expect(next).toHaveBeenCalledWith();
  });

  it.each([
    ['missing clerkToken', {}],
    ['extra field', { clerkToken: 'a.b.c', email: 'x@example.com' }],
    ['non-string clerkToken', { clerkToken: 123 }],
    ['empty clerkToken', { clerkToken: '' }],
    ['whitespace-only clerkToken', { clerkToken: '   ' }],
    ['oversized clerkToken', { clerkToken: 'a'.repeat(MAX_CLERK_TOKEN_BYTES + 1) }],
  ])('rejects %s with CLERK_REQUEST_INVALID', (_label, body) => {
    const next = createNext();
    validateClerkLoginBody(createReq({ body }), {} as never, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'CLERK_REQUEST_INVALID' }));
  });
});

describe('createPrepareClerkLogin', () => {
  const getClerkAuthConfig = () => enabledConfig;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets req.user on an exact clerkId hit and never fetches a profile', async () => {
    mockVerifyClerkSessionToken.mockResolvedValue(claims);
    const existingUser = { _id: 'u1', email: 'user@example.com', clerkId: claims.clerkId };
    const findUser = jest.fn().mockResolvedValue(existingUser);
    const prepareClerkLogin = createPrepareClerkLogin({ getClerkAuthConfig, findUser });
    const req = createReq();
    const next = createNext();

    await prepareClerkLogin(req, {} as never, next);

    expect(next).toHaveBeenCalledWith();
    expect((req as { user: unknown }).user).toBe(existingUser);
    expect(mockFetchClerkProfile).not.toHaveBeenCalled();
    expect(findUser).toHaveBeenCalledTimes(1);
    expect(findUser).toHaveBeenCalledWith(
      expect.objectContaining({ clerkId: claims.clerkId }),
      '+clerkDeletedAt',
    );
  });

  it('fetches the profile and looks up by email on a clerkId miss', async () => {
    mockVerifyClerkSessionToken.mockResolvedValue(claims);
    mockFetchClerkProfile.mockResolvedValue({
      email: 'user@example.com',
      emailVerified: true,
      name: 'Test User',
    });
    const userByEmail = { _id: 'u2', email: 'user@example.com' };
    const findUser = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(userByEmail);
    const prepareClerkLogin = createPrepareClerkLogin({ getClerkAuthConfig, findUser });
    const req = createReq();
    const next = createNext();

    await prepareClerkLogin(req, {} as never, next);

    expect(next).toHaveBeenCalledWith();
    expect((req as { user: unknown }).user).toBe(userByEmail);
    expect(mockFetchClerkProfile).toHaveBeenCalledWith(claims.clerkId, enabledConfig);
    expect(findUser).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ email: 'user@example.com' }),
      '+clerkDeletedAt',
    );
  });

  it('leaves req.user undefined when neither lookup matches', async () => {
    mockVerifyClerkSessionToken.mockResolvedValue(claims);
    mockFetchClerkProfile.mockResolvedValue({ email: 'new@example.com', emailVerified: true });
    const findUser = jest.fn().mockResolvedValue(null);
    const prepareClerkLogin = createPrepareClerkLogin({ getClerkAuthConfig, findUser });
    const req = createReq();
    const next = createNext();

    await prepareClerkLogin(req, {} as never, next);

    expect(next).toHaveBeenCalledWith();
    expect((req as { user: unknown }).user).toBeUndefined();
  });

  it('maps a ClerkAuthError from verification to a ClerkRouteError with the same code/status', async () => {
    mockVerifyClerkSessionToken.mockRejectedValue(new ClerkAuthError('CLERK_TOKEN_INVALID', 401));
    const findUser = jest.fn();
    const prepareClerkLogin = createPrepareClerkLogin({ getClerkAuthConfig, findUser });
    const next = createNext();

    await prepareClerkLogin(createReq(), {} as never, next);

    expect(findUser).not.toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ClerkRouteError);
    expect(err.code).toBe('CLERK_TOKEN_INVALID');
    expect(err.status).toBe(401);
  });

  it('maps a forbidden profile outcome without ever calling findUser a second time', async () => {
    mockVerifyClerkSessionToken.mockResolvedValue(claims);
    mockFetchClerkProfile.mockRejectedValue(new ClerkAuthError('CLERK_LOGIN_FORBIDDEN', 403));
    const findUser = jest.fn().mockResolvedValue(null);
    const prepareClerkLogin = createPrepareClerkLogin({ getClerkAuthConfig, findUser });
    const next = createNext();

    await prepareClerkLogin(createReq(), {} as never, next);

    expect(findUser).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.code).toBe('CLERK_LOGIN_FORBIDDEN');
    expect(err.status).toBe(403);
  });
});

describe('createEnforceClerkLoginPolicy', () => {
  const identity: VerifiedClerkIdentity = {
    ...claims,
    email: 'user@example.com',
    emailVerified: true,
  };

  function reqWithState(candidate: Record<string, unknown> | null) {
    return createReq({
      clerkAuth: {
        clerkIdentity: identity,
        clerkLookups: { userByClerkId: candidate, userByEmail: undefined },
      },
    });
  }

  it('forbids when the base config domain allow-list rejects the email', async () => {
    const getAppConfig = jest
      .fn()
      .mockResolvedValue({ registration: { allowedDomains: ['other.com'] } });
    const enforce = createEnforceClerkLoginPolicy({
      getAppConfig,
      isSocialRegistrationAllowed: () => true,
    });
    const next = createNext();

    await enforce(reqWithState(null), {} as never, next);

    const err = next.mock.calls[0][0];
    expect(err.code).toBe('CLERK_LOGIN_FORBIDDEN');
  });

  it('forbids new-user creation when social registration is disabled', async () => {
    const getAppConfig = jest.fn().mockResolvedValue({ registration: {} });
    const enforce = createEnforceClerkLoginPolicy({
      getAppConfig,
      isSocialRegistrationAllowed: () => false,
    });
    const next = createNext();

    await enforce(reqWithState(null), {} as never, next);

    const err = next.mock.calls[0][0];
    expect(err.code).toBe('CLERK_LOGIN_FORBIDDEN');
  });

  it('allows an already-bound subject through even when registration is disabled', async () => {
    const getAppConfig = jest.fn().mockResolvedValue({ registration: {} });
    const enforce = createEnforceClerkLoginPolicy({
      getAppConfig,
      isSocialRegistrationAllowed: () => false,
    });
    const next = createNext();

    await enforce(reqWithState({ email: 'user@example.com' }), {} as never, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('passes through cleanly when domain allowed and registration enabled', async () => {
    const getAppConfig = jest.fn().mockResolvedValue({ registration: {} });
    const enforce = createEnforceClerkLoginPolicy({
      getAppConfig,
      isSocialRegistrationAllowed: () => true,
    });
    const next = createNext();

    await enforce(reqWithState(null), {} as never, next);

    expect(next).toHaveBeenCalledWith();
  });
});

describe('createCommitClerkLogin', () => {
  function reqWithState() {
    return createReq({
      clerkAuth: {
        clerkIdentity: claims,
        clerkLookups: { userByClerkId: null, userByEmail: null },
        clerkAppConfig: {},
      },
    });
  }

  const deps = { findUser: jest.fn(), linkClerkIdentity: jest.fn(), createSocialUser: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['authenticated', { status: 'authenticated', user: { _id: 'u1' } }],
    ['linked', { status: 'linked', user: { _id: 'u2' } }],
    ['already_linked', { status: 'already_linked', user: { _id: 'u3' } }],
    ['created', { status: 'created', user: { _id: 'u4' } }],
  ])('assigns req.user and calls next() on %s', async (_label, result) => {
    mockResolveClerkIdentity.mockResolvedValue(result);
    const commit = createCommitClerkLogin(deps);
    const req = reqWithState();
    const next = createNext();

    await commit(req, {} as never, next);

    expect((req as { user: unknown }).user).toBe(result.user);
    expect(next).toHaveBeenCalledWith();
  });

  it('maps conflict to CLERK_IDENTITY_CONFLICT (409)', async () => {
    mockResolveClerkIdentity.mockResolvedValue({ status: 'conflict' });
    const commit = createCommitClerkLogin(deps);
    const next = createNext();

    await commit(reqWithState(), {} as never, next);

    const err = next.mock.calls[0][0];
    expect(err.code).toBe('CLERK_IDENTITY_CONFLICT');
    expect(err.status).toBe(409);
  });

  it('maps forbidden to CLERK_LOGIN_FORBIDDEN (403)', async () => {
    mockResolveClerkIdentity.mockResolvedValue({ status: 'forbidden' });
    const commit = createCommitClerkLogin(deps);
    const next = createNext();

    await commit(reqWithState(), {} as never, next);

    const err = next.mock.calls[0][0];
    expect(err.code).toBe('CLERK_LOGIN_FORBIDDEN');
    expect(err.status).toBe(403);
  });

  it('maps not_found to a redacted 500 CLERK_LOGIN_FAILED', async () => {
    mockResolveClerkIdentity.mockResolvedValue({ status: 'not_found' });
    const commit = createCommitClerkLogin(deps);
    const next = createNext();

    await commit(reqWithState(), {} as never, next);

    const err = next.mock.calls[0][0];
    expect(err.code).toBe('CLERK_LOGIN_FAILED');
    expect(err.status).toBe(500);
  });
});

describe('createCompleteClerkLogin', () => {
  const user = { _id: 'u1', email: 'user@example.com' };

  function reqWithFinalUser() {
    return createReq({
      user,
      clerkAuth: {
        clerkIdentity: claims,
        clerkLookups: { userByClerkId: user, userByEmail: undefined, tenantId: 'tenant-a' },
      },
    });
  }

  function createRes() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn() } as never;
  }

  it('delegates to exchangeClerkSession and writes its result as the response', async () => {
    const exchangeClerkSession = jest
      .fn()
      .mockResolvedValue({ token: 'access-token', user: { _id: 'u1' } });
    const complete = createCompleteClerkLogin({ exchangeClerkSession });
    const req = reqWithFinalUser();
    const res = createRes();
    const next = createNext();

    await complete(req, res, next);

    expect(exchangeClerkSession).toHaveBeenCalledWith({
      req,
      res,
      user,
      identity: claims,
      tenantId: 'tenant-a',
    });
    expect((res as { status: jest.Mock }).status).toHaveBeenCalledWith(200);
    expect((res as { json: jest.Mock }).json).toHaveBeenCalledWith({
      token: 'access-token',
      user: { _id: 'u1' },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('writes a 2FA-pending body without treating it as an error', async () => {
    const exchangeClerkSession = jest
      .fn()
      .mockResolvedValue({ twoFAPending: true, tempToken: 'temp-token' });
    const complete = createCompleteClerkLogin({ exchangeClerkSession });
    const res = createRes();

    await complete(reqWithFinalUser(), res, createNext());

    expect((res as { json: jest.Mock }).json).toHaveBeenCalledWith({
      twoFAPending: true,
      tempToken: 'temp-token',
    });
  });

  it('fails closed with CLERK_LOGIN_FAILED when req.user is missing', async () => {
    const exchangeClerkSession = jest.fn();
    const complete = createCompleteClerkLogin({ exchangeClerkSession });
    const req = createReq({
      clerkAuth: {
        clerkIdentity: claims,
        clerkLookups: { userByClerkId: null, userByEmail: null },
      },
    });
    const next = createNext();

    await complete(req, createRes(), next);

    expect(exchangeClerkSession).not.toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.code).toBe('CLERK_LOGIN_FAILED');
    expect(err.status).toBe(500);
  });

  it('propagates an exchangeClerkSession failure via next(error)', async () => {
    const failure = new Error('exchange failed');
    const exchangeClerkSession = jest.fn().mockRejectedValue(failure);
    const complete = createCompleteClerkLogin({ exchangeClerkSession });
    const next = createNext();

    await complete(reqWithFinalUser(), createRes(), next);

    expect(next).toHaveBeenCalledWith(failure);
  });
});

describe('clerkLoginErrorAdapter', () => {
  function createRes() {
    return { headersSent: false, status: jest.fn().mockReturnThis(), json: jest.fn() } as never;
  }

  it('maps a replay ClerkAuthClaimError to 409 CLERK_TOKEN_REPLAYED', () => {
    const res = createRes();
    const next = createNext();

    clerkLoginErrorAdapter(
      new ClerkAuthClaimError('replayed', 'CLERK_TOKEN_REPLAYED'),
      {} as never,
      res,
      next,
    );

    expect((res as { status: jest.Mock }).status).toHaveBeenCalledWith(409);
    expect((res as { json: jest.Mock }).json).toHaveBeenCalledWith({
      code: 'CLERK_TOKEN_REPLAYED',
    });
  });

  it.each(['CLERK_SESSION_REVOKED', 'CLERK_USER_DELETED'] as const)(
    'maps a %s ClerkAuthClaimError to 403 CLERK_LOGIN_FORBIDDEN',
    (code) => {
      const res = createRes();
      const next = createNext();

      clerkLoginErrorAdapter(
        new ClerkAuthClaimError('revoked/deleted', code),
        {} as never,
        res,
        next,
      );

      expect((res as { status: jest.Mock }).status).toHaveBeenCalledWith(403);
      expect((res as { json: jest.Mock }).json).toHaveBeenCalledWith({
        code: 'CLERK_LOGIN_FORBIDDEN',
      });
    },
  );

  it('fails closed to 500 CLERK_LOGIN_FAILED for an unrecognized ClerkAuthClaimError code', () => {
    const res = createRes();
    const next = createNext();

    clerkLoginErrorAdapter(
      new ClerkAuthClaimError('unknown', 'SOME_OTHER_CODE' as never),
      {} as never,
      res,
      next,
    );

    expect((res as { status: jest.Mock }).status).toHaveBeenCalledWith(500);
    expect((res as { json: jest.Mock }).json).toHaveBeenCalledWith({ code: 'CLERK_LOGIN_FAILED' });
  });

  it('responds with the stable {code} body for a ClerkRouteError', () => {
    const res = createRes();
    const next = createNext();

    clerkLoginErrorAdapter(
      new ClerkRouteError('CLERK_IDENTITY_CONFLICT', 409),
      {} as never,
      res,
      next,
    );

    expect((res as { status: jest.Mock }).status).toHaveBeenCalledWith(409);
    expect((res as { json: jest.Mock }).json).toHaveBeenCalledWith({
      code: 'CLERK_IDENTITY_CONFLICT',
    });
  });

  it('responds with the stable {code} body for a raw ClerkAuthError', () => {
    const res = createRes();
    const next = createNext();

    clerkLoginErrorAdapter(new ClerkAuthError('CLERK_UNAVAILABLE', 503), {} as never, res, next);

    expect((res as { status: jest.Mock }).status).toHaveBeenCalledWith(503);
    expect((res as { json: jest.Mock }).json).toHaveBeenCalledWith({ code: 'CLERK_UNAVAILABLE' });
  });

  it('falls back to 500 CLERK_LOGIN_FAILED for an unrecognized error', () => {
    const res = createRes();
    const next = createNext();

    clerkLoginErrorAdapter(new Error('boom'), {} as never, res, next);

    expect((res as { status: jest.Mock }).status).toHaveBeenCalledWith(500);
    expect((res as { json: jest.Mock }).json).toHaveBeenCalledWith({ code: 'CLERK_LOGIN_FAILED' });
  });

  it('never touches the response once headers are already sent', () => {
    const res = { headersSent: true, status: jest.fn(), json: jest.fn() } as never;
    const next = createNext();

    clerkLoginErrorAdapter(new Error('late'), {} as never, res, next);

    expect((res as { status: jest.Mock }).status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('tenant scoping — sanity', () => {
  it('is exercised without an ambient tenant by default', () => {
    expect(tenantStorage.getStore()).toBeUndefined();
  });
});

describe('createClerkAuthHandlers', () => {
  function createHandlerDeps() {
    return {
      getClerkAuthConfig: () => enabledConfig,
      findUser: jest.fn(),
      getAppConfig: jest.fn().mockResolvedValue({ registration: {} }),
      isSocialRegistrationAllowed: () => true,
      linkClerkIdentity: jest.fn(),
      createSocialUser: jest.fn(),
      exchangeClerkSession: jest.fn(),
    };
  }

  it('returns every named step as a callable function', () => {
    const handlers = createClerkAuthHandlers(createHandlerDeps());

    expect(handlers.validateClerkLoginBody).toBe(validateClerkLoginBody);
    expect(handlers.clerkLoginErrorAdapter).toBe(clerkLoginErrorAdapter);
    expect(typeof handlers.prepareClerkLogin).toBe('function');
    expect(typeof handlers.enforceClerkLoginPolicy).toBe('function');
    expect(typeof handlers.commitClerkLogin).toBe('function');
    expect(typeof handlers.completeClerkLogin).toBe('function');
  });

  it('wires prepareClerkLogin to the supplied findUser/config deps end-to-end', async () => {
    const deps = createHandlerDeps();
    mockVerifyClerkSessionToken.mockResolvedValue(claims);
    const existingUser = { _id: 'u1', email: 'user@example.com', clerkId: claims.clerkId };
    deps.findUser.mockResolvedValue(existingUser);
    const handlers = createClerkAuthHandlers(deps);
    const req = createReq();
    const next = createNext();

    await handlers.prepareClerkLogin(req, {} as never, next);

    expect(next).toHaveBeenCalledWith();
    expect((req as { user: unknown }).user).toBe(existingUser);
  });

  it('wires completeClerkLogin to the supplied exchangeClerkSession dep end-to-end', async () => {
    const deps = createHandlerDeps();
    deps.exchangeClerkSession.mockResolvedValue({ token: 'access-token', user: { _id: 'u1' } });
    const handlers = createClerkAuthHandlers(deps);
    const req = createReq({
      user: { _id: 'u1' },
      clerkAuth: {
        clerkIdentity: claims,
        clerkLookups: { userByClerkId: null, userByEmail: null },
      },
    });
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = createNext();

    await handlers.completeClerkLogin(req, res as never, next);

    expect(deps.exchangeClerkSession).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ token: 'access-token', user: { _id: 'u1' } });
  });
});
