import type { IUser } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import type { ClerkSessionCompletionDependencies, PersistedClerkSession } from './session';
import type { VerifiedClerkIdentity } from './verify';
import {
  MAX_CLERK_SESSION_AGE_MS,
  createExchangeClerkSession,
  createFinalizeClerkTwoFactorSession,
  getClerkAbsoluteExpiresAt,
} from './session';
import { ClerkRouteError } from './handler';

const now = new Date('2026-08-13T12:00:00.000Z');
const tokenExpiresAt = new Date(now.getTime() + 10 * 60_000);
const user = {
  _id: 'user-id',
  id: 'user-id',
  email: 'user@example.com',
  provider: 'local',
  clerkId: 'user_clerk',
  password: 'secret',
} as unknown as IUser;
const identity: VerifiedClerkIdentity = {
  clerkId: 'user_clerk',
  clerkSessionId: 'sess_clerk',
  clerkTokenId: 'token_clerk',
  authorizedParty: 'https://app.example.com',
  tokenIssuedAt: now,
  tokenExpiresAt,
  email: 'user@example.com',
  emailVerified: true,
};
const persistedSession: PersistedClerkSession = {
  _id: 'session-id',
  expiration: new Date(now.getTime() + MAX_CLERK_SESSION_AGE_MS),
};

function response(headersSent = false): Response {
  return {
    headersSent,
    clearCookie: jest.fn(),
  } as unknown as Response;
}

function dependencies(
  overrides: Partial<ClerkSessionCompletionDependencies> = {},
): ClerkSessionCompletionDependencies {
  return {
    now: () => now,
    getSessionExpiryMs: () => 60 * 60_000,
    toTenantScope: (tenantId) => tenantId ?? '__tenantless__',
    signTwoFactorTempToken: jest.fn().mockReturnValue('temporary-token'),
    persistClerkSession: jest.fn().mockResolvedValue(persistedSession),
    confirmClerkSession: jest.fn().mockResolvedValue(true),
    setAuthTokens: jest.fn().mockResolvedValue('access-token'),
    deleteSession: jest.fn().mockResolvedValue(undefined),
    serializeUser: jest.fn().mockReturnValue({ id: 'user-id', email: 'user@example.com' }),
    beforeResponse: jest.fn().mockResolvedValue(undefined),
    recordOutcome: jest.fn(),
    logPostCommitFailure: jest.fn(),
    ...overrides,
  };
}

function completionInput(overrides: Partial<{ user: IUser; tenantId: string }> = {}) {
  return {
    req: {} as Request,
    res: response(),
    user: overrides.user ?? user,
    identity,
    tenantId: overrides.tenantId,
  };
}

function signedTwoFactorCapability(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-id',
    twoFAPending: true,
    authProvider: 'clerk',
    tenantScope: 'tenant-a',
    clerkSessionId: 'sess_clerk',
    clerkTokenId: 'token_clerk',
    clerkUserId: 'user_clerk',
    tokenExpiresAt: tokenExpiresAt.toISOString(),
    absoluteExpiresAt: new Date(now.getTime() + MAX_CLERK_SESSION_AGE_MS).toISOString(),
    exp: Math.floor((now.getTime() + 5 * 60_000) / 1_000),
    iat: Math.floor(now.getTime() / 1_000),
    ...overrides,
  };
}

describe('getClerkAbsoluteExpiresAt', () => {
  it('caps a long configured Session at fifteen minutes', () => {
    expect(getClerkAbsoluteExpiresAt(now, 24 * 60 * 60_000)).toEqual(
      new Date(now.getTime() + MAX_CLERK_SESSION_AGE_MS),
    );
  });

  it('preserves a shorter configured Session lifetime', () => {
    expect(getClerkAbsoluteExpiresAt(now, 2 * 60_000)).toEqual(
      new Date(now.getTime() + 2 * 60_000),
    );
  });
});

describe('createExchangeClerkSession', () => {
  it('returns a tenant-bound 2FA capability without Session, claim, or cookie writes', async () => {
    const signTwoFactorTempToken = jest.fn().mockReturnValue('temporary-token');
    const deps = dependencies({ signTwoFactorTempToken });
    const exchange = createExchangeClerkSession(deps);
    const twoFactorUser = { ...user, twoFactorEnabled: true } as unknown as IUser;

    await expect(
      exchange(completionInput({ user: twoFactorUser, tenantId: 'tenant-a' })),
    ).resolves.toEqual({
      twoFAPending: true,
      tempToken: 'temporary-token',
    });

    expect(signTwoFactorTempToken).toHaveBeenCalledWith(
      {
        userId: 'user-id',
        twoFAPending: true,
        authProvider: 'clerk',
        tenantScope: 'tenant-a',
        clerkSessionId: 'sess_clerk',
        clerkTokenId: 'token_clerk',
        clerkUserId: 'user_clerk',
        tokenExpiresAt: tokenExpiresAt.toISOString(),
        absoluteExpiresAt: new Date(now.getTime() + MAX_CLERK_SESSION_AGE_MS).toISOString(),
      },
      5 * 60,
    );
    expect(deps.persistClerkSession).not.toHaveBeenCalled();
    expect(deps.setAuthTokens).not.toHaveBeenCalled();
  });

  it('persists, confirms, issues, and serializes in order for a non-2FA login', async () => {
    const order: string[] = [];
    const deps = dependencies({
      persistClerkSession: jest.fn().mockImplementation(async () => {
        order.push('persist');
        return persistedSession;
      }),
      confirmClerkSession: jest.fn().mockImplementation(async () => {
        order.push('confirm');
        return true;
      }),
      setAuthTokens: jest.fn().mockImplementation(async () => {
        order.push('tokens');
        return 'access-token';
      }),
      serializeUser: jest.fn().mockImplementation(() => {
        order.push('serialize');
        return { id: 'user-id', email: 'user@example.com' };
      }),
      beforeResponse: jest.fn().mockImplementation(async () => {
        order.push('before-response');
      }),
    });
    const exchange = createExchangeClerkSession(deps);

    await expect(exchange(completionInput({ tenantId: 'tenant-a' }))).resolves.toEqual({
      token: 'access-token',
      user: { id: 'user-id', email: 'user@example.com' },
    });

    expect(order).toEqual(['persist', 'confirm', 'tokens', 'serialize', 'before-response']);
    expect(deps.persistClerkSession).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-id',
        tenantId: 'tenant-a',
        claimExpiresAt: new Date(tokenExpiresAt.getTime() + 5_000),
        clerk: expect.objectContaining({
          authProvider: 'clerk',
          tenantScope: 'tenant-a',
          clerkSessionId: 'sess_clerk',
          clerkTokenId: 'token_clerk',
          clerkUserId: 'user_clerk',
        }),
      }),
    );
    expect(deps.setAuthTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        session: persistedSession,
        clerk: expect.objectContaining({ tenantScope: 'tenant-a' }),
      }),
    );
  });

  it.each([
    ['CLERK_TOKEN_REPLAYED', 409, 'CLERK_TOKEN_REPLAYED'],
    ['CLERK_SESSION_REVOKED', 403, 'CLERK_LOGIN_FORBIDDEN'],
    ['CLERK_USER_DELETED', 403, 'CLERK_LOGIN_FORBIDDEN'],
  ] as const)(
    'maps data error %s to stable HTTP status/code',
    async (dataCode, status, routeCode) => {
      const error = Object.assign(new Error('internal data detail'), { code: dataCode });
      const deps = dependencies({ persistClerkSession: jest.fn().mockRejectedValue(error) });
      const exchange = createExchangeClerkSession(deps);

      await expect(exchange(completionInput())).rejects.toMatchObject<Partial<ClerkRouteError>>({
        status,
        code: routeCode,
      });
      expect(deps.deleteSession).not.toHaveBeenCalled();
    },
  );

  it('rolls back only the exact Session and clears pending cookies on a pre-flush failure', async () => {
    const res = response(false);
    const deps = dependencies({
      setAuthTokens: jest.fn().mockRejectedValue(new Error('jwt failed')),
    });
    const exchange = createExchangeClerkSession(deps);

    await expect(exchange({ ...completionInput(), res })).rejects.toMatchObject({
      code: 'CLERK_LOGIN_FAILED',
      status: 500,
    });

    expect(deps.deleteSession).toHaveBeenCalledWith('session-id');
    expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
    expect(res.clearCookie).toHaveBeenCalledWith('token_provider');
    expect(deps.recordOutcome).toHaveBeenCalledWith('rollback');
  });

  it('treats post-commit failure as retain-and-log once headers were sent', async () => {
    const res = response(true);
    const deps = dependencies({
      setAuthTokens: jest.fn().mockRejectedValue(new Error('socket failed')),
    });
    const exchange = createExchangeClerkSession(deps);

    await expect(exchange({ ...completionInput(), res })).rejects.toThrow(ClerkRouteError);

    expect(deps.deleteSession).not.toHaveBeenCalled();
    expect(res.clearCookie).not.toHaveBeenCalled();
    expect(deps.logPostCommitFailure).toHaveBeenCalledWith(
      '[Clerk session] response failed after headers were committed',
    );
    expect(deps.recordOutcome).toHaveBeenCalledWith('post_commit_failure');
  });

  it('rolls back if the committed Session cannot be confirmed immediately before issuance', async () => {
    const deps = dependencies({ confirmClerkSession: jest.fn().mockResolvedValue(false) });
    const exchange = createExchangeClerkSession(deps);

    await expect(exchange(completionInput())).rejects.toMatchObject({
      code: 'CLERK_LOGIN_FORBIDDEN',
      status: 403,
    });

    expect(deps.setAuthTokens).not.toHaveBeenCalled();
    expect(deps.deleteSession).toHaveBeenCalledWith('session-id');
  });
});

describe('createFinalizeClerkTwoFactorSession', () => {
  const twoFactorUser = {
    ...user,
    twoFactorEnabled: true,
  } as unknown as IUser;

  function finalizationInput(
    overrides: Partial<{ capability: unknown; tenantId: string | undefined; user: IUser }> = {},
  ) {
    const tenantId = Object.prototype.hasOwnProperty.call(overrides, 'tenantId')
      ? overrides.tenantId
      : 'tenant-a';
    return {
      req: {} as Request,
      res: response(),
      user: overrides.user ?? twoFactorUser,
      capability: overrides.capability ?? signedTwoFactorCapability(),
      tenantId,
    };
  }

  it('parses the signed capability and reuses persistence, confirmation, tokens, and serialization', async () => {
    const deps = dependencies();
    const finalize = createFinalizeClerkTwoFactorSession(deps);

    await expect(finalize(finalizationInput())).resolves.toEqual({
      token: 'access-token',
      user: { id: 'user-id', email: 'user@example.com' },
    });

    expect(deps.persistClerkSession).toHaveBeenCalledWith({
      userId: 'user-id',
      tenantId: 'tenant-a',
      claimExpiresAt: new Date(tokenExpiresAt.getTime() + 5_000),
      clerk: {
        authProvider: 'clerk',
        tenantScope: 'tenant-a',
        clerkSessionId: 'sess_clerk',
        clerkTokenId: 'token_clerk',
        clerkUserId: 'user_clerk',
        tokenExpiresAt,
        absoluteExpiresAt: new Date(now.getTime() + MAX_CLERK_SESSION_AGE_MS),
      },
    });
    expect(deps.confirmClerkSession).toHaveBeenCalledWith({
      sessionId: 'session-id',
      tenantId: 'tenant-a',
    });
    expect(deps.setAuthTokens).toHaveBeenCalledTimes(1);
    expect(deps.signTwoFactorTempToken).not.toHaveBeenCalled();
  });

  it.each([
    ['wrong tenant', { tenantId: 'tenant-b' }],
    ['missing tenant', { tenantId: undefined }],
    [
      'expired capability',
      {
        capability: signedTwoFactorCapability({ exp: Math.floor(now.getTime() / 1_000) }),
      },
    ],
    [
      'different User',
      {
        user: { ...twoFactorUser, _id: 'other-user' } as unknown as IUser,
      },
    ],
  ])('rejects %s before any persistence', async (_label, overrides) => {
    const deps = dependencies();
    const finalize = createFinalizeClerkTwoFactorSession(deps);

    await expect(finalize(finalizationInput(overrides))).rejects.toMatchObject({
      code: 'CLERK_LOGIN_FORBIDDEN',
      status: 403,
    });

    expect(deps.persistClerkSession).not.toHaveBeenCalled();
    expect(deps.setAuthTokens).not.toHaveBeenCalled();
  });

  it('accepts only the explicit tenantless scope for a tenantless final request', async () => {
    const deps = dependencies({
      toTenantScope: (tenantId) => tenantId ?? '__tenantless__',
    });
    const finalize = createFinalizeClerkTwoFactorSession(deps);

    await expect(
      finalize({
        ...finalizationInput(),
        tenantId: undefined,
        capability: signedTwoFactorCapability({ tenantScope: '__tenantless__' }),
      }),
    ).resolves.toMatchObject({ token: 'access-token' });

    expect(deps.persistClerkSession).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: undefined,
        clerk: expect.objectContaining({ tenantScope: '__tenantless__' }),
      }),
    );
  });

  it.each([
    ['CLERK_TOKEN_REPLAYED', 409, 'CLERK_TOKEN_REPLAYED'],
    ['CLERK_SESSION_REVOKED', 403, 'CLERK_LOGIN_FORBIDDEN'],
    ['CLERK_USER_DELETED', 403, 'CLERK_LOGIN_FORBIDDEN'],
  ] as const)(
    'maps final exchange error %s without issuing cookies',
    async (code, status, routeCode) => {
      const deps = dependencies({
        persistClerkSession: jest
          .fn()
          .mockRejectedValue(Object.assign(new Error('data failure'), { code })),
      });
      const finalize = createFinalizeClerkTwoFactorSession(deps);

      await expect(finalize(finalizationInput())).rejects.toMatchObject({
        code: routeCode,
        status,
      });

      expect(deps.setAuthTokens).not.toHaveBeenCalled();
    },
  );
});
