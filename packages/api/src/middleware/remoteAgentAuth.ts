import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { logger } from '@librechat/data-schemas';
import type { RequestHandler, Request, Response, NextFunction } from 'express';
import type { JwtPayload } from 'jsonwebtoken';
import type { AppConfig, IUser, UserMethods } from '@librechat/data-schemas';
import type { TAgentsEndpoint } from 'librechat-data-provider';
import { isEnabled, math } from '~/utils';
import { findOpenIDUser } from '../auth/openid';

export interface RemoteAgentAuthDeps {
  apiKeyMiddleware: RequestHandler;
  findUser: UserMethods['findUser'];
  getAppConfig: () => Promise<AppConfig | null>;
}

type OidcConfig = NonNullable<
  NonNullable<NonNullable<TAgentsEndpoint['remoteApi']>['auth']>['oidc']
>;

const jwksClientCache = new Map<string, Promise<jwksRsa.JwksClient>>();

function extractBearer(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

function getEmail(payload: JwtPayload): string | undefined {
  return (
    (payload['email'] as string | undefined) ??
    (payload['preferred_username'] as string | undefined) ??
    (payload['upn'] as string | undefined)
  );
}

async function resolveJwksUri(oidcConfig: OidcConfig): Promise<string> {
  if (oidcConfig.jwksUri) return oidcConfig.jwksUri;
  if (process.env.OPENID_JWKS_URL) return process.env.OPENID_JWKS_URL;

  const issuer = oidcConfig.issuer.replace(/\/$/, '');
  const discoveryUrl = `${issuer}/.well-known/openid-configuration`;

  const res = await fetch(discoveryUrl);
  if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status} ${res.statusText}`);

  const meta = (await res.json()) as { jwks_uri?: string };
  if (!meta.jwks_uri) throw new Error('OIDC discovery response missing jwks_uri');

  return meta.jwks_uri;
}

function buildJwksClient(uri: string): jwksRsa.JwksClient {
  const options: jwksRsa.Options = {
    cache: isEnabled(process.env.OPENID_JWKS_URL_CACHE_ENABLED) || true,
    cacheMaxAge: math(process.env.OPENID_JWKS_URL_CACHE_TIME, 60000),
    jwksUri: uri,
  };

  if (process.env.PROXY) {
    options.requestAgent = new HttpsProxyAgent(process.env.PROXY);
  }

  return jwksRsa(options);
}

async function getJwksClient(oidcConfig: OidcConfig): Promise<jwksRsa.JwksClient> {
  const cacheKey = oidcConfig.jwksUri ?? oidcConfig.issuer;

  const cached = jwksClientCache.get(cacheKey);
  if (cached != null) return cached;

  const promise = resolveJwksUri(oidcConfig)
    .then((uri) => {
      return buildJwksClient(uri);
    })
    .catch((err) => {
      jwksClientCache.delete(cacheKey); // не кэшируем ошибку
      throw err;
    });

  jwksClientCache.set(cacheKey, promise);
  return promise;
}

function verifyOidcBearer(token: string, oidcConfig: OidcConfig): Promise<JwtPayload> {
  return new Promise((resolve, reject) => {
    const decoded = jwt.decode(token, { complete: true });
    if (decoded == null) return reject(new Error('Invalid JWT: cannot decode'));

    const kid = decoded.header?.kid as string | undefined;

    getJwksClient(oidcConfig)
      .then((client) => {
        const fetchKey = (callback: (key: jwksRsa.SigningKey) => void) => {
          if (kid != null) {
            client.getSigningKey(kid, (err, key) => {
              if (err != null || key == null)
                return reject(err ?? new Error('No signing key for kid'));
              callback(key);
            });
          } else {
            client
              .getKeys()
              .then((keys: unknown) => {
                const jwkKeys = keys as Array<{ kid: string }>;
                if (jwkKeys.length === 0) return reject(new Error('No keys in JWKS'));
                client.getSigningKey(jwkKeys[0].kid, (keyErr, key) => {
                  if (keyErr != null || key == null)
                    return reject(keyErr ?? new Error('No signing key'));
                  callback(key);
                });
              })
              .catch((err: unknown) => reject(err));
          }
        };

        fetchKey((signingKey) => {
          jwt.verify(
            token,
            signingKey.getPublicKey(),
            {
              algorithms: ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512'],
              ...(oidcConfig.issuer ? { issuer: oidcConfig.issuer } : {}),
              ...(oidcConfig.audience ? { audience: oidcConfig.audience } : {}),
            },
            (err, payload) => {
              if (err != null || payload == null) {
                return reject(err ?? new Error('Empty payload'));
              }
              resolve(payload as JwtPayload);
            },
          );
        });
      })
      .catch(reject);
  });
}

async function resolveUser(
  token: string,
  payload: JwtPayload,
  findUser: UserMethods['findUser'],
): Promise<IUser | null> {
  const { user, error } = await findOpenIDUser({
    findUser,
    email: getEmail(payload),
    openidId: payload.sub ?? '',
    idOnTheSource: payload['oid'] as string | undefined,
    strategyName: 'remoteAgentAuth',
  });

  if (error != null || user == null) return null;

  user.id = String(user._id);
  user.federatedTokens = { access_token: token, expires_at: payload.exp };
  return user;
}

/**
 * Factory for Remote Agent API auth middleware.
 *
 * Validates Bearer tokens against configured OIDC issuer via JWKS,
 * falling back to API key auth when enabled. Stateless — no session dependency.
 *
 * ```yaml
 * endpoints:
 *   agents:
 *     remoteApi:
 *       auth:
 *         apiKey:
 *           enabled: false
 *         oidc:
 *           enabled: true
 *           issuer: <issuer>
 *           jwksUri: <jwksUri>
 *           audience: <audience>
 * ```
 */
export function createRemoteAgentAuth({
  apiKeyMiddleware,
  findUser,
  getAppConfig,
}: RemoteAgentAuthDeps): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const config = await getAppConfig();
      const authConfig = config?.endpoints?.agents?.remoteApi?.auth;

      if (authConfig?.oidc?.enabled !== true) {
        return apiKeyMiddleware(req, res, next);
      }

      const token = extractBearer(req.headers.authorization);
      const apiKeyEnabled = authConfig.apiKey?.enabled !== false;

      if (token == null) {
        if (apiKeyEnabled) return apiKeyMiddleware(req, res, next);
        res.status(401).json({ error: 'Bearer token required' });
        return;
      }

      try {
        const payload = await verifyOidcBearer(token, authConfig.oidc);
        const user = await resolveUser(token, payload, findUser);

        if (user == null) {
          logger.warn('[remoteAgentAuth] OIDC token valid but no matching LibreChat user');
          if (apiKeyEnabled) return apiKeyMiddleware(req, res, next);
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }

        req.user = user;
        return next();
      } catch (oidcErr) {
        logger.error('[remoteAgentAuth] OIDC verification failed:', oidcErr);
        if (apiKeyEnabled) return apiKeyMiddleware(req, res, next);
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    } catch (err) {
      logger.error('[remoteAgentAuth] Unexpected error', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
  };
}
