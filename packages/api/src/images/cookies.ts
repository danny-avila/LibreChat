import jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';
import { SystemRoles } from 'librechat-data-provider';
import type { Request, RequestHandler } from 'express';
import type { JwtPayload } from 'jsonwebtoken';

export type CookieAuthResult =
  | { status: 'missing' | 'invalid' }
  | { status: 'authenticated'; userId: string };

export interface CookieAuthenticationDeps {
  parseCookies(header: string): Record<string, string | undefined>;
  isOpenIdReuseEnabled(): boolean;
  getSecret(): string | undefined;
  findSession(query: { userId: string; refreshToken: string }): Promise<unknown | null>;
  asSystem<T>(work: () => Promise<T>): Promise<T>;
}

type CookieRequest = Pick<Request, 'headers'> & {
  session?: { openidTokens?: { refreshToken?: string } };
};
type VerifiedCookieIdentity = {
  status: 'verified';
  userId: string;
  /** Omitted only when the legacy OpenID cookie is bound to the active Express session. */
  refreshToken?: string;
};
type CookieIdentity =
  | Exclude<CookieAuthResult, { status: 'authenticated' }>
  | VerifiedCookieIdentity;

/** Local verification completes before any session or user database access. */
function verifyCookieIdentity(req: CookieRequest, deps: CookieAuthenticationDeps): CookieIdentity {
  if (!req.headers.cookie) return { status: 'missing' };
  let cookies: Record<string, string | undefined>;
  try {
    cookies = deps.parseCookies(req.headers.cookie);
  } catch {
    return { status: 'invalid' };
  }
  const refreshToken = cookies.refreshToken;
  if (!refreshToken) return { status: 'missing' };
  const openId = cookies.token_provider === 'openid' && deps.isOpenIdReuseEnabled();
  const token = openId ? cookies.openid_user_id : refreshToken;
  const secret = deps.getSecret();
  if (!token || !secret) return { status: 'invalid' };
  let payload: JwtPayload;
  try {
    const verified = jwt.verify(token, secret);
    if (typeof verified === 'string') return { status: 'invalid' };
    payload = verified;
  } catch {
    return { status: 'invalid' };
  }
  const userId = payload.id;
  if (typeof userId !== 'string' || !/^[0-9a-f]{24}$/i.test(userId)) {
    return { status: 'invalid' };
  }
  if (openId) {
    if (typeof payload.refreshTokenHash !== 'string') {
      return refreshToken === req.session?.openidTokens?.refreshToken
        ? { status: 'verified', userId }
        : { status: 'invalid' };
    }
    const hash = createHash('sha256').update(refreshToken).digest('base64url');
    if (payload.refreshTokenHash !== hash) return { status: 'invalid' };
  }
  return { status: 'verified', userId, refreshToken };
}

async function hasCookieSession(
  identity: VerifiedCookieIdentity,
  deps: CookieAuthenticationDeps,
): Promise<boolean> {
  if (!identity.refreshToken) return true;
  const { userId, refreshToken } = identity;
  return !!(await deps.asSystem(() => deps.findSession({ userId, refreshToken })));
}

/** Shared authentication for browser image, video and file requests without bearer headers. */
export async function authenticateCookieRequest(
  req: CookieRequest,
  deps: CookieAuthenticationDeps,
): Promise<CookieAuthResult> {
  const identity = verifyCookieIdentity(req, deps);
  if (identity.status !== 'verified') return identity;
  return (await hasCookieSession(identity, deps))
    ? { status: 'authenticated', userId: identity.userId }
    : { status: 'invalid' };
}

type CookieUser = {
  id?: string;
  role?: string;
  tenantId?: string;
  idOnTheSource?: string | null;
  agentTriggerDeletionStartedAt?: Date | null;
};

/** Leaves authorization to the consuming route and reuses an already loaded bearer user. */
export function createOptionalCookieAuth(
  deps: CookieAuthenticationDeps & {
    getUserById(id: string, select: string): Promise<CookieUser | null>;
    log(error: Error): void;
  },
): RequestHandler {
  return async (req, _res, next) => {
    if (req.user) return next();
    try {
      const identity = verifyCookieIdentity(req as CookieRequest, deps);
      if (identity.status === 'verified') {
        const [activeSession, user] = await Promise.all([
          hasCookieSession(identity, deps),
          deps.asSystem(() =>
            deps.getUserById(
              identity.userId,
              '-password -__v -totpSecret -backupCodes +agentTriggerDeletionStartedAt',
            ),
          ),
        ]);
        if (activeSession && user && !user.agentTriggerDeletionStartedAt) {
          req.user = {
            ...user,
            id: identity.userId,
            role: user.role || SystemRoles.USER,
            idOnTheSource: user.idOnTheSource ?? null,
          };
        }
      }
    } catch (error) {
      deps.log(error instanceof Error ? error : new Error('Cookie authentication failed.'));
    }
    next();
  };
}
