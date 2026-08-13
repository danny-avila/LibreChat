import type { IUser } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import { ClerkRouteError } from './handler';
import {
  MAX_CLERK_SESSION_AGE_MS,
  createExchangeClerkSession,
  getClerkAbsoluteExpiresAt,
} from './session';
import type { ClerkSessionCompletionDependencies, PersistedClerkSession } from './session';
import type { VerifiedClerkIdentity } from './verify';

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
    generateTwoFactorTempToken: jest.fn().mockReturnValue('temporary-token'),
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
    const generateTwoFactorTempToken = jest.fn().mockReturnValue('temporary-token');
    const deps = dependencies({ generateTwoFactorTempToken });
    const exchange = createExchangeClerkSession(deps);
    const twoFactorUser = { ...user, twoFactorEnabled: true } as unknown as IUser;

    await expect(
      exchange(completionInput({ user: twoFactorUser, tenantId: 'tenant-a' })),
    ).resolves.toEqual({
      twoFAPending: true,
      tempToken: 'temporary-token',
    });

    expect(generateTwoFactorTempToken).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-id',
        authProvider: 'clerk',
        tenantScope: 'tenant-a',
        clerkSessionId: 'sess_clerk',
        clerkTokenId: 'token_clerk',
        clerkUserId: 'user_clerk',
        tokenExpiresAt,
        absoluteExpiresAt: new Date(now.getTime() + MAX_CLERK_SESSION_AGE_MS),
        capabilityExpiresAt: new Date(now.getTime() + 5 * 60_000),
      }),
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
