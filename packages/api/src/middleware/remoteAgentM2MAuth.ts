import { getTenantId, logger } from '@librechat/data-schemas';
import type { RequestHandler, Request, Response, NextFunction } from 'express';
import type { AppConfig, IUser, UserMethods } from '@librechat/data-schemas';
import type { JwtPayload } from 'jsonwebtoken';
import type { TAgentsEndpoint } from 'librechat-data-provider';
import type { OAuthJwtIssuerConfig } from '../auth/oauthJwt';
import type { GetAppConfigOptions } from '../app/service';
import { extractBearer, hasRequiredScopes, verifyOAuthJwtBearer } from '../auth/oauthJwt';

export type RemoteAgentM2MAction = 'read' | 'create' | 'update' | 'delete';

export type RemoteAgentM2MAuthInfo = {
  type: 'm2m';
  issuer: string;
  clientId: string;
  action: RemoteAgentM2MAction;
  scopes: string[];
};

export interface RemoteAgentM2MAuthDeps {
  findUser: UserMethods['findUser'];
  getAppConfig: (options?: GetAppConfigOptions) => Promise<AppConfig>;
  verifyBearer?: (token: string, issuerConfig: OAuthJwtIssuerConfig) => Promise<JwtPayload>;
}

type AgentAuthConfig = NonNullable<NonNullable<TAgentsEndpoint['remoteApi']>['auth']>;
type M2MConfig = NonNullable<AgentAuthConfig['m2m']>;
type M2MClientConfig = NonNullable<M2MConfig['clients']>[number];
type EnabledM2MConfig = M2MConfig & { issuer: string; clients: M2MClientConfig[] };
type M2MRequest = Request & {
  user?: IUser;
  authInfo?: RemoteAgentM2MAuthInfo;
};
type ScopeClaim = string | string[] | undefined;
type M2MTokenValidation = {
  payload: JwtPayload;
  clientMapping: { clientId: string; mapping: M2MClientConfig };
};
type M2MPolicy = {
  m2mConfig: EnabledM2MConfig;
  validation: M2MTokenValidation;
};

const DEFAULT_ACTION_SCOPES: Record<RemoteAgentM2MAction, string> = {
  read: 'librechat.agents:read',
  create: 'librechat.agents:create',
  update: 'librechat.agents:update',
  delete: 'librechat.agents:delete',
};

function getConfigOptions(): GetAppConfigOptions {
  const tenantId = getTenantId();
  if (tenantId) return { tenantId };
  return { baseOnly: true };
}

function getUserConfigOptions(user: IUser): GetAppConfigOptions {
  if (user.tenantId) return { role: user.role, userId: user.id, tenantId: user.tenantId };
  return { baseOnly: true };
}

function isResolvedUserConfigScope(initialOptions: GetAppConfigOptions, user: IUser): boolean {
  const userOptions = getUserConfigOptions(user);
  return (
    initialOptions.tenantId === userOptions.tenantId &&
    initialOptions.userId === userOptions.userId &&
    initialOptions.role === userOptions.role &&
    initialOptions.baseOnly === userOptions.baseOnly
  );
}

function getRemoteAuthConfig(config: AppConfig): AgentAuthConfig | undefined {
  return config.endpoints?.agents?.remoteApi?.auth;
}

function getEnabledM2MConfig(
  authConfig: AgentAuthConfig | undefined,
): EnabledM2MConfig | undefined {
  if (authConfig?.m2m?.enabled !== true) return undefined;
  if (!authConfig.m2m.issuer) throw new Error('M2M issuer is required when M2M auth is enabled');
  if (!authConfig.m2m.clients || authConfig.m2m.clients.length === 0) {
    throw new Error('M2M clients are required when M2M auth is enabled');
  }
  return {
    ...authConfig.m2m,
    issuer: authConfig.m2m.issuer,
    clients: authConfig.m2m.clients,
  };
}

function getRequiredScope(config: EnabledM2MConfig, action: RemoteAgentM2MAction): string {
  return config.scopes?.[action] ?? DEFAULT_ACTION_SCOPES[action];
}

function getStringClaim(payload: JwtPayload, claimName: string): string | undefined {
  const value = payload[claimName];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getTokenScopes(payload: JwtPayload): string[] {
  const scopeClaim = (payload['scp'] ?? payload['scope']) as ScopeClaim;
  if (Array.isArray(scopeClaim)) {
    return scopeClaim.flatMap((scope) => scope.trim().split(/\s+/).filter(Boolean));
  }
  return typeof scopeClaim === 'string' ? scopeClaim.trim().split(/\s+/).filter(Boolean) : [];
}

function getIssuerConfig(config: EnabledM2MConfig): OAuthJwtIssuerConfig {
  return {
    issuer: config.issuer,
    ...(config.audience ? { audience: config.audience } : {}),
    ...(config.jwksUri ? { jwksUri: config.jwksUri } : {}),
  };
}

function hasExpectedTokenUse(config: EnabledM2MConfig, payload: JwtPayload): boolean {
  const tokenUseClaim = config.tokenUseClaim ?? 'token_use';
  const tokenUseValue = config.tokenUseValue ?? 'access';
  return getStringClaim(payload, tokenUseClaim) === tokenUseValue;
}

function getClientMapping(
  config: EnabledM2MConfig,
  payload: JwtPayload,
): { clientId: string; mapping: M2MClientConfig } | null {
  const clientIdClaim = config.clientIdClaim ?? 'client_id';
  const clientId = getStringClaim(payload, clientIdClaim);
  if (!clientId) return null;

  const mapping = config.clients.find((client) => client.clientId === clientId);
  if (!mapping) return null;

  return { clientId, mapping };
}

function normalizeId(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'toString' in value) {
    return String(value);
  }
  return undefined;
}

function tenantMatches(user: IUser, mapping: M2MClientConfig): boolean {
  if (!mapping.tenantId) return true;
  return user.tenantId === mapping.tenantId;
}

async function resolveMappedUser(
  mapping: M2MClientConfig,
  findUser: UserMethods['findUser'],
): Promise<IUser | null> {
  const user = await findUser({ _id: mapping.userId });
  if (!user) return null;

  const id = normalizeId(user._id) ?? user.id ?? mapping.userId;
  user.id = id;
  return user;
}

async function validateTokenAgainstConfig(
  token: string,
  config: EnabledM2MConfig,
  action: RemoteAgentM2MAction,
  verifyBearer: NonNullable<RemoteAgentM2MAuthDeps['verifyBearer']>,
): Promise<M2MTokenValidation> {
  const payload = await verifyBearer(token, getIssuerConfig(config));

  if (!hasExpectedTokenUse(config, payload)) {
    logger.warn('[remoteAgentM2MAuth] Token rejected: invalid token use');
    throw new Error('invalid_token_use');
  }

  const requiredScope = getRequiredScope(config, action);
  if (!hasRequiredScopes(requiredScope, payload)) {
    logger.warn(`[remoteAgentM2MAuth] Token missing required scope: ${requiredScope}`);
    throw new Error('missing_scope');
  }

  const clientMapping = getClientMapping(config, payload);
  if (!clientMapping) {
    logger.warn('[remoteAgentM2MAuth] Token rejected: unmapped client');
    throw new Error('unmapped_client');
  }

  return { payload, clientMapping };
}

function mappingTargetsUser(mapping: M2MClientConfig, user: IUser): boolean {
  return mapping.userId === user.id;
}

async function enforceResolvedTenantPolicy({
  token,
  user,
  action,
  initialOptions,
  initialPolicy,
  getAppConfig,
  verifyBearer,
}: {
  token: string;
  user: IUser;
  action: RemoteAgentM2MAction;
  initialOptions: GetAppConfigOptions;
  initialPolicy: M2MPolicy;
  getAppConfig: RemoteAgentM2MAuthDeps['getAppConfig'];
  verifyBearer: NonNullable<RemoteAgentM2MAuthDeps['verifyBearer']>;
}): Promise<M2MPolicy | null> {
  if (isResolvedUserConfigScope(initialOptions, user)) return initialPolicy;

  const config = await getAppConfig(getUserConfigOptions(user));
  const m2mConfig = getEnabledM2MConfig(getRemoteAuthConfig(config));
  if (!m2mConfig) {
    logger.warn('[remoteAgentM2MAuth] Token rejected by resolved tenant auth policy');
    return null;
  }

  try {
    const validation = await validateTokenAgainstConfig(token, m2mConfig, action, verifyBearer);
    if (
      mappingTargetsUser(validation.clientMapping.mapping, user) &&
      tenantMatches(user, validation.clientMapping.mapping)
    ) {
      return { m2mConfig, validation };
    }
    logger.warn('[remoteAgentM2MAuth] Token rejected by resolved tenant client mapping');
  } catch (err) {
    logger.warn('[remoteAgentM2MAuth] Token rejected by resolved tenant auth policy:', err);
  }

  return null;
}

export function createRemoteAgentM2MAuth({
  findUser,
  getAppConfig,
  verifyBearer = verifyOAuthJwtBearer,
}: RemoteAgentM2MAuthDeps): (options: { action: RemoteAgentM2MAction }) => RequestHandler {
  return ({ action }) => {
    const handler = async (req: M2MRequest, res: Response, next: NextFunction) => {
      try {
        const initialOptions = getConfigOptions();
        const config = await getAppConfig(initialOptions);
        const m2mConfig = getEnabledM2MConfig(getRemoteAuthConfig(config));

        if (!m2mConfig) {
          res.status(401).json({ error: 'M2M authentication required' });
          return;
        }

        const token = extractBearer(req.headers.authorization);
        if (!token) {
          res.status(401).json({ error: 'Bearer token required' });
          return;
        }

        let validation: M2MTokenValidation;
        try {
          validation = await validateTokenAgainstConfig(token, m2mConfig, action, verifyBearer);
        } catch (err) {
          logger.warn('[remoteAgentM2MAuth] Token verification failed:', err);
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }

        const user = await resolveMappedUser(validation.clientMapping.mapping, findUser);
        if (!user || !user.role || !tenantMatches(user, validation.clientMapping.mapping)) {
          logger.warn('[remoteAgentM2MAuth] Token rejected: mapped user unavailable');
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }

        const policy = await enforceResolvedTenantPolicy({
          token,
          user,
          action,
          initialOptions,
          initialPolicy: { m2mConfig, validation },
          getAppConfig,
          verifyBearer,
        });
        if (!policy) {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }

        req.user = user;
        req.authInfo = {
          type: 'm2m',
          issuer: policy.m2mConfig.issuer,
          clientId: policy.validation.clientMapping.clientId,
          action,
          scopes: getTokenScopes(policy.validation.payload),
        };

        return next();
      } catch (err) {
        logger.error('[remoteAgentM2MAuth] Unexpected error', err);
        res.status(500).json({ error: 'Internal server error' });
        return;
      }
    };

    return handler as RequestHandler;
  };
}
