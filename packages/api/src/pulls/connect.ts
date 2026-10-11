import express from 'express';
import { EModelEndpoint } from 'librechat-data-provider';
import { logger, getTenantId, tenantStorage } from '@librechat/data-schemas';
import type {
  TAgentsEndpoint,
  PullRequestProvider,
  TPullRequestConnection,
} from 'librechat-data-provider';
import type { Request, Response, Router, RequestHandler } from 'express';
import type { AppConfig } from '@librechat/data-schemas';
import type { PullRequestOAuth, PullRequestOAuthStore } from './oauth';
import type { GetAppConfigOptions } from '~/app/service';
import type { PullRequestOAuthConfig } from './settings';
import type { PullRequestUserToken } from './handler';
import type { PullRequestFetch } from './shared';
import type { ServerRequest } from '~/types';
import {
  setOAuthSession,
  validateOAuthCsrf,
  setOAuthCsrfCookie,
  validateOAuthSession,
} from '~/oauth/csrf';
import { PULL_REQUEST_OAUTH_CALLBACK_PATH, createPullRequestOAuthFromEnv } from './oauth';
import { isPullRequestFeatureActive, resolvePullRequestOAuth } from './settings';
import { readPullRequestSettings } from './handler';
import { getSafeErrorMetadata } from '~/utils';
import { getBasePath } from '~/utils/path';

const PROVIDER_NAMES: Record<PullRequestProvider, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
};

type Env = Readonly<Record<string, string | undefined>>;

/**
 * The routes a user connects and disconnects their own account through. Starting a connection
 * and reading or removing it need the signed-in user; the callback arrives from the provider
 * without one and is trusted only through its signed `state` plus the CSRF or session cookie that
 * binds it to the browser that started the flow. Failures redirect to the shared OAuth error page
 * with one of its known codes, never with provider text; the JSON routes answer with a stable
 * `code` a client can localize.
 */
export function createPullRequestConnectionHandlers(deps: {
  oauth: PullRequestOAuth;
  getAppConfig: (options: GetAppConfigOptions) => Promise<AppConfig>;
  env: Env;
}) {
  /** The signed-in user's connection settings, with the app taken from the operator's YAML. */
  async function configFor(req: ServerRequest): Promise<PullRequestOAuthConfig | null> {
    const settings = await readPullRequestSettings(deps.getAppConfig, req.user);
    if (settings == null || !isPullRequestFeatureActive(settings, deps.env)) return null;
    return resolvePullRequestOAuth(settings, deps.env);
  }

  const redirect = (res: Response, page: string) => res.redirect(`${getBasePath()}${page}`);
  const fail = (res: Response, code: string) =>
    redirect(res, `/oauth/error?error=${encodeURIComponent(code)}`);

  async function finishCallback(
    res: Response,
    claims: NonNullable<ReturnType<PullRequestOAuth['verifyState']>>,
    code: string,
  ): Promise<void> {
    try {
      /** The operator's YAML alone decides the app; a changed app voids flows started before. */
      const base = await deps.getAppConfig({
        baseOnly: true,
        ...(claims.tenantId ? { tenantId: claims.tenantId } : {}),
      });
      const settings = (base.endpoints?.[EModelEndpoint.agents] as TAgentsEndpoint | undefined)
        ?.pullRequests;
      const config = isPullRequestFeatureActive(settings, deps.env)
        ? resolvePullRequestOAuth(settings, deps.env)
        : null;
      if (config == null || config.provider !== claims.provider || config.host !== claims.host) {
        fail(res, 'invalid_state');
        return;
      }
      await deps.oauth.complete(claims, code, config);
      redirect(
        res,
        `/oauth/success?serverName=${encodeURIComponent(PROVIDER_NAMES[config.provider])}`,
      );
    } catch (caught) {
      logger.warn('[PullRequests] Connection callback failed', getSafeErrorMetadata(caught));
      fail(res, 'callback_failed');
    }
  }

  return {
    async connect(req: ServerRequest, res: Response): Promise<void> {
      const user = req.user;
      if (!user?.id) {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
        return;
      }
      try {
        const config = await configFor(req);
        if (config == null) {
          res
            .status(404)
            .json({ error: 'Connecting an account is not available', code: 'NOT_CONFIGURED' });
          return;
        }
        const tenantId = getTenantId() ?? user.tenantId;
        const { url, flowId } = deps.oauth.authorizationUrl(
          { id: user.id, ...(tenantId ? { tenantId } : {}) },
          config,
        );
        setOAuthCsrfCookie(res, flowId, PULL_REQUEST_OAUTH_CALLBACK_PATH);
        res.status(200).json({ url });
      } catch (error) {
        logger.error('[PullRequests] Could not start a connection', getSafeErrorMetadata(error));
        res.status(500).json({ error: 'Failed to start the connection', code: 'CONNECT_FAILED' });
      }
    },

    async callback(req: Request, res: Response): Promise<void> {
      const { code, state, error } = req.query as Record<string, unknown>;
      if (typeof state !== 'string' || state === '') {
        fail(res, 'missing_state');
        return;
      }
      const claims = deps.oauth.verifyState(state);
      if (claims == null) {
        fail(res, 'invalid_state');
        return;
      }
      /** The browser finishing the flow must be the one that started it, for that user. */
      const bound =
        validateOAuthCsrf(req, res, claims.flowId, PULL_REQUEST_OAUTH_CALLBACK_PATH) ||
        validateOAuthSession(req, claims.userId);
      if (!bound) {
        fail(res, 'invalid_state');
        return;
      }
      if (typeof error === 'string' && error !== '') {
        fail(res, 'callback_failed');
        return;
      }
      if (typeof code !== 'string' || code === '') {
        fail(res, 'missing_code');
        return;
      }
      /**
       * The provider's redirect carries no session, so the tenant the flow started in is restored
       * from the signed state before anything is read or stored. A request already placed in
       * another tenant (by host, for example) is refused rather than stored there.
       */
      const current = getTenantId();
      if (current != null && current !== claims.tenantId) {
        fail(res, 'invalid_state');
        return;
      }
      const finish = () => finishCallback(res, claims, code);
      if (claims.tenantId && current == null) {
        await tenantStorage.run({ tenantId: claims.tenantId }, finish);
        return;
      }
      await finish();
    },

    async status(req: ServerRequest, res: Response): Promise<void> {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
        return;
      }
      try {
        const config = await configFor(req);
        const body: TPullRequestConnection =
          config == null
            ? { configured: false, connected: false }
            : {
                configured: true,
                provider: config.provider,
                connected: await deps.oauth.connected(userId, config),
              };
        res.status(200).json(body);
      } catch (error) {
        logger.error('[PullRequests] Could not read the connection', getSafeErrorMetadata(error));
        res.status(500).json({ error: 'Failed to read the connection', code: 'STATUS_FAILED' });
      }
    },

    async disconnect(req: ServerRequest, res: Response): Promise<void> {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
        return;
      }
      try {
        /** Not gated on the current configuration: a grant made under an app or host that has
         *  since changed must still go, or restoring that configuration would revive it. */
        await deps.oauth.disconnect(userId);
        res.status(204).end();
      } catch (error) {
        logger.error('[PullRequests] Could not disconnect', getSafeErrorMetadata(error));
        res.status(500).json({ error: 'Failed to disconnect', code: 'DISCONNECT_FAILED' });
      }
    },
  };
}

/** The lookups' view of a connection: the user's token, or none. */
export function createPullRequestUserToken(
  oauth: PullRequestOAuth,
  env: Env,
): (
  userId: string,
  settings: Parameters<typeof resolvePullRequestOAuth>[0],
) => Promise<string | null> {
  return async (userId, settings) => {
    const config = resolvePullRequestOAuth(settings, env);
    return config == null ? null : oauth.token(userId, config);
  };
}

type ConnectionDeps = {
  store: PullRequestOAuthStore;
  fetchFn: PullRequestFetch;
  env: Env;
};

/** The lookups' user tokens for this deployment, or none when users cannot connect at all. */
export function createPullRequestUserTokenFromEnv(
  deps: ConnectionDeps,
): PullRequestUserToken | undefined {
  const oauth = createPullRequestOAuthFromEnv(deps);
  return oauth && createPullRequestUserToken(oauth, deps.env);
}

/**
 * The connection routes, mounted under `/api/pull-requests`. Without a signing secret no route is
 * registered. The callback is unauthenticated by design (see the handlers); the others need the
 * caller's `requireJwtAuth`.
 */
export function createPullRequestConnectionRouter(
  deps: ConnectionDeps & {
    getAppConfig: (options: GetAppConfigOptions) => Promise<AppConfig>;
    requireJwtAuth: RequestHandler;
  },
): Router {
  const router = express.Router();
  const oauth = createPullRequestOAuthFromEnv(deps);
  if (oauth == null) return router;
  const handlers = createPullRequestConnectionHandlers({
    oauth,
    getAppConfig: deps.getAppConfig,
    env: deps.env,
  });
  /** Behind `requireJwtAuth`, which puts the signed-in user on the request. */
  const authed = (handler: (req: ServerRequest, res: Response) => Promise<void>) =>
    handler as unknown as RequestHandler;
  router.get('/oauth/callback', handlers.callback);
  router.get('/oauth/connect', deps.requireJwtAuth, setOAuthSession, authed(handlers.connect));
  router.get('/oauth/status', deps.requireJwtAuth, authed(handlers.status));
  router.delete('/oauth', deps.requireJwtAuth, authed(handlers.disconnect));
  return router;
}
