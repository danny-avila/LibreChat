import type { SessionData } from 'express-session';
import type { RequestHandler } from 'express';
import type { OpenIDSessionRefreshService } from '~/auth/openid/session';
import type { OpenIDRequest, OpenIDSession } from '~/auth/openid/types';
import type { ServerRequest } from '~/types/http';
import { createAuthIdentityContext, isOpenIDSessionIdentityMatch } from '~/utils/identity';

interface Dependencies {
  reuseOpenIDTokens: boolean;
  createOpenIDSessionTokenProvider: OpenIDSessionRefreshService['createOpenIDSessionTokenProvider'];
}

/** Read the linked session on each turn. Logout or session expiry requires a new sign-in. */
export function createChannelContext(deps: Dependencies): RequestHandler {
  return async (baseReq, res, next) => {
    const req = baseReq as ServerRequest & OpenIDRequest & { channelSessionId?: string };
    try {
      if (deps.reuseOpenIDTokens && (req.user?.provider === 'openid' || req.user?.openidId)) {
        const id = req.channelSessionId;
        const session =
          id && req.sessionStore
            ? await new Promise<(SessionData & Pick<OpenIDSession, 'openidTokens'>) | null>(
                (resolve, reject) => {
                  req.sessionStore.get(id, (error, value) =>
                    error ? reject(error) : resolve(value ?? null),
                  );
                },
              )
            : null;
        if (!id || !session) {
          res.status(401).json({ error: 'account_reconnect_required' });
          return;
        }
        if (
          !isOpenIDSessionIdentityMatch(
            session.openidTokens,
            createAuthIdentityContext({ user: req.user }),
          )
        ) {
          res.status(401).json({ error: 'account_reconnect_required' });
          return;
        }
        // Use the original session so refresh rotation and logout remain authoritative.
        req.sessionID = id;
        req.sessionStore.createSession(baseReq, session);
        delete req.headers.authorization;
        delete req.headers.cookie;
        req.cookies = {};
        const tokens = await deps.createOpenIDSessionTokenProvider({
          req,
          res,
          user: req.user,
          tokenPreference: 'access_token',
        })();
        if (!tokens?.access_token) {
          res.status(401).json({ error: 'account_reconnect_required' });
          return;
        }
        req.user.federatedTokens = tokens;
      }
      next();
    } catch {
      res.status(503).json({ error: 'channel_context_unavailable' });
    }
  };
}
