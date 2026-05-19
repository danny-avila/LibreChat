import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import jwksRsa from 'jwks-rsa';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { getTenantId, logger, tenantStorage } from '@librechat/data-schemas';
import { isRemoteOidcUrlAllowed } from 'librechat-data-provider';
import type { RequestHandler, Request, Response, NextFunction } from 'express';
import type { AppConfig, IUser, UserGroupMethods, UserMethods } from '@librechat/data-schemas';
import type { Algorithm, JwtPayload, VerifyOptions } from 'jsonwebtoken';
import type { TAgentsEndpoint } from 'librechat-data-provider';
import type { GetAppConfigOptions } from '../app/service';
import { normalizeOpenIdIssuer } from '../auth/openid';
import {
  type EntraGroupSyncResult,
  syncUserEntraGroupMemberships,
  type EntraGroupSyncOptions,
  type EntraGraphConfig,
} from '../auth/entraGroupSync';
import {
  resolveOpenIdAccount,
  type OpenIdAccountMethods,
  type OpenIdAccountOptions,
  type OpenIdAccountProfile,
} from '../auth/openidAccount';
import { enrichOpenIdProfile } from '../auth/openidUserInfo';
import {
  readFederatedAuthCache,
  writeFederatedAuthCache,
  type FederatedAuthCacheEntry,
  type FederatedAuthCacheKeyInput,
  type FederatedAuthCacheOptions,
} from '../auth/federatedAuthCache';
import { fetchRemoteAuth } from '../auth/fetch';
import { isEnabled, math } from '~/utils';

export interface RemoteAgentAuthDeps {
  apiKeyMiddleware: RequestHandler;
  findUser: UserMethods['findUser'];
  createUser: UserMethods['createUser'];
  updateUser: UserMethods['updateUser'];
  bulkUpdateGroups: UserGroupMethods['bulkUpdateGroups'];
  findGroupsByExternalIds: UserGroupMethods['findGroupsByExternalIds'];
  upsertGroupByExternalId: UserGroupMethods['upsertGroupByExternalId'];
  getAppConfig: (options?: GetAppConfigOptions) => Promise<AppConfig>;
}

type OidcConfig = NonNullable<
  NonNullable<NonNullable<TAgentsEndpoint['remoteApi']>['auth']>['oidc']
>;

type AgentAuthConfig = NonNullable<NonNullable<TAgentsEndpoint['remoteApi']>['auth']>;
type EnabledOidcConfig = OidcConfig & { audience: string; issuer: string };
type JwksCacheOptions = {
  enabled: boolean;
  maxAge: number;
};
type CacheEntry<T> = {
  expiresAt: number;
  promise: Promise<T>;
};
type ScopeClaim = string | string[] | undefined;
type ProvisioningConfig = NonNullable<EnabledOidcConfig['provisioning']>;
type UserInfoConfig = NonNullable<EnabledOidcConfig['userInfo']>;
type ProfileSyncConfig = NonNullable<EnabledOidcConfig['profileSync']>;
type GroupSyncConfig = NonNullable<EnabledOidcConfig['groupSync']>;
type FederatedAuthCacheConfig = NonNullable<EnabledOidcConfig['federatedAuthCache']>;
type RemoteUserInfoOptions = {
  fetchUserInfo: boolean;
  requireUserInfo: boolean;
};
type TenantPolicyResult =
  | { ok: false }
  | { ok: true; config?: AppConfig; oidcConfig?: EnabledOidcConfig };
type TenantPolicySuccess = Extract<TenantPolicyResult, { ok: true }>;
type RemoteAuthContext = {
  user: IUser;
  lifecycle: 'created' | 'existing';
  accountOptions: OpenIdAccountOptions;
  groupSyncOptions: EntraGroupSyncOptions;
  oidcConfig: EnabledOidcConfig;
  config: AppConfig;
};
type RemoteAccountResolution =
  | { ok: true; context: RemoteAuthContext }
  | { ok: false; status: 401 | 500 };
type GroupSyncMethods = Pick<
  RemoteAgentAuthDeps,
  'bulkUpdateGroups' | 'findGroupsByExternalIds' | 'upsertGroupByExternalId'
>;
type RemoteAuthLogContext = {
  tenantId?: string;
  userId?: string;
  issuer?: string;
  subjectHash?: string;
  lifecycle?: 'created' | 'existing';
  reason?: string;
};

const DEFAULT_PROVISIONING_CONFIG: ProvisioningConfig = {
  enabled: false,
};

const DEFAULT_USER_INFO_CONFIG: UserInfoConfig = {
  fetch: false,
  require: false,
};

const DEFAULT_PROFILE_SYNC_CONFIG: ProfileSyncConfig = {
  onCreate: true,
  forExisting: false,
};

const DEFAULT_GROUP_SYNC_CONFIG: GroupSyncConfig = {
  onCreate: false,
  forExisting: false,
};

const DEFAULT_FEDERATED_AUTH_CACHE_CONFIG: FederatedAuthCacheConfig = {
  enabled: true,
  ttlSeconds: 300,
};

const MAX_JWKS_CACHE_ENTRIES = 100;
const JWT_ALGORITHMS: Algorithm[] = [
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'ES256',
  'ES384',
  'ES512',
];
const jwksUriCache = new Map<string, CacheEntry<string>>();
const jwksClientCache = new Map<string, CacheEntry<jwksRsa.JwksClient>>();

export function clearRemoteAgentAuthCache(): void {
  jwksUriCache.clear();
  jwksClientCache.clear();
}

function pruneExpiredEntries<T>(cache: Map<string, CacheEntry<T>>): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}

function setCacheEntry<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  entry: CacheEntry<T>,
): void {
  pruneExpiredEntries(cache);

  while (cache.size >= MAX_JWKS_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey == null) break;
    cache.delete(oldestKey);
  }

  cache.set(key, entry);
}

function extractBearer(authHeader: string | undefined): string | null {
  const match = authHeader?.match(/^Bearer\s+(\S+)\s*$/i);
  return match?.[1] ?? null;
}

function splitScopes(scopes: string): string[] {
  return scopes.trim().split(/\s+/).filter(Boolean);
}

function getTokenScopes(scopeClaim: ScopeClaim): string[] {
  if (Array.isArray(scopeClaim)) return scopeClaim.flatMap(splitScopes);
  return scopeClaim ? splitScopes(scopeClaim) : [];
}

function hasRequiredScopes(requiredScope: string | undefined, payload: JwtPayload): boolean {
  if (!requiredScope) return true;

  const requiredScopes = splitScopes(requiredScope);
  if (requiredScopes.length === 0) return true;

  const rawScope = (payload['scp'] ?? payload['scope']) as ScopeClaim;
  const tokenScopes = getTokenScopes(rawScope);
  return requiredScopes.every((scope) => tokenScopes.includes(scope));
}

function getJwksCacheOptions(): JwksCacheOptions {
  return {
    enabled: process.env.OPENID_JWKS_URL_CACHE_ENABLED
      ? isEnabled(process.env.OPENID_JWKS_URL_CACHE_ENABLED)
      : true,
    maxAge: Math.max(math(process.env.OPENID_JWKS_URL_CACHE_TIME, 60000), 0),
  };
}

function ensureRemoteOidcUrlAllowed(value: string, label: string): string {
  if (isRemoteOidcUrlAllowed(value)) return value;
  throw new Error(`${label} must use https:// unless targeting localhost`);
}

async function discoverJwksUri(issuer: string): Promise<string> {
  const normalizedIssuer = normalizeOpenIdIssuer(ensureRemoteOidcUrlAllowed(issuer, 'OIDC issuer'));
  if (!normalizedIssuer) throw new Error('OIDC issuer is required');

  const discoveryUrl = `${normalizedIssuer}/.well-known/openid-configuration`;
  const res = await fetchRemoteAuth(discoveryUrl);

  try {
    if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status} ${res.statusText}`);

    const meta = await res.json<{ jwks_uri?: string }>();
    if (!meta.jwks_uri) throw new Error('OIDC discovery response missing jwks_uri');

    return ensureRemoteOidcUrlAllowed(meta.jwks_uri, 'OIDC JWKS URI');
  } finally {
    res.release?.();
  }
}

async function resolveJwksUri(
  oidcConfig: EnabledOidcConfig,
  cacheOptions: JwksCacheOptions,
): Promise<string> {
  if (oidcConfig.jwksUri) return ensureRemoteOidcUrlAllowed(oidcConfig.jwksUri, 'OIDC JWKS URI');
  if (process.env.OPENID_JWKS_URL) {
    return ensureRemoteOidcUrlAllowed(process.env.OPENID_JWKS_URL, 'OIDC JWKS URI');
  }

  if (!cacheOptions.enabled) return discoverJwksUri(oidcConfig.issuer);

  const cacheKey = oidcConfig.issuer;
  const cached = jwksUriCache.get(cacheKey);
  if (cached != null && cached.expiresAt > Date.now()) return cached.promise;
  if (cached != null) jwksUriCache.delete(cacheKey);

  const promise = discoverJwksUri(oidcConfig.issuer).catch((err) => {
    jwksUriCache.delete(cacheKey);
    throw err;
  });

  setCacheEntry(jwksUriCache, cacheKey, {
    promise,
    expiresAt: Date.now() + cacheOptions.maxAge,
  });
  return promise;
}

function buildJwksClient(uri: string, cacheOptions: JwksCacheOptions): jwksRsa.JwksClient {
  const options: jwksRsa.Options = {
    cache: cacheOptions.enabled,
    cacheMaxAge: cacheOptions.maxAge,
    jwksUri: uri,
  };

  if (process.env.PROXY) {
    options.requestAgent = new HttpsProxyAgent(process.env.PROXY);
  }

  return jwksRsa(options);
}

async function getJwksClient(oidcConfig: EnabledOidcConfig): Promise<jwksRsa.JwksClient> {
  const cacheOptions = getJwksCacheOptions();
  const uri = await resolveJwksUri(oidcConfig, cacheOptions);

  if (!cacheOptions.enabled) return buildJwksClient(uri, cacheOptions);

  const cacheKey = uri;
  const cached = jwksClientCache.get(cacheKey);
  if (cached != null && cached.expiresAt > Date.now()) return cached.promise;
  if (cached != null) jwksClientCache.delete(cacheKey);

  let client: jwksRsa.JwksClient;
  try {
    client = buildJwksClient(uri, cacheOptions);
  } catch (err) {
    jwksClientCache.delete(cacheKey);
    throw err;
  }

  const promise = Promise.resolve(client);

  setCacheEntry(jwksClientCache, cacheKey, {
    promise,
    expiresAt: Date.now() + cacheOptions.maxAge,
  });
  return promise;
}

function getVerifyOptions(oidcConfig: EnabledOidcConfig): VerifyOptions {
  const normalizedIssuer = normalizeOpenIdIssuer(oidcConfig.issuer);
  const issuer =
    normalizedIssuer && normalizedIssuer !== oidcConfig.issuer
      ? [oidcConfig.issuer, normalizedIssuer]
      : oidcConfig.issuer;

  return {
    algorithms: JWT_ALGORITHMS,
    audience: oidcConfig.audience,
    issuer,
  };
}

function getConfigOptions(req: Request): GetAppConfigOptions {
  const user = req.user as { tenantId?: string } | undefined;
  const tenantId = user?.tenantId ?? getTenantId();

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

function getEnabledOidcConfig(
  authConfig: AgentAuthConfig | undefined,
): EnabledOidcConfig | undefined {
  if (authConfig?.oidc?.enabled !== true) return undefined;
  if (!authConfig.oidc.issuer) throw new Error('OIDC issuer is required when OIDC auth is enabled');
  if (!authConfig.oidc.audience) {
    throw new Error('OIDC audience is required when OIDC auth is enabled');
  }
  return {
    ...authConfig.oidc,
    audience: authConfig.oidc.audience,
    issuer: authConfig.oidc.issuer,
  };
}

function isApiKeyEnabled(config: AppConfig): boolean {
  return getRemoteAuthConfig(config)?.apiKey?.enabled !== false;
}

function isTenantStrict(): boolean {
  return process.env.TENANT_ISOLATION_STRICT === 'true';
}

function getAccountOptions(oidcConfig: EnabledOidcConfig): OpenIdAccountOptions {
  const provisioning = oidcConfig.provisioning ?? DEFAULT_PROVISIONING_CONFIG;
  const profileSync = oidcConfig.profileSync ?? DEFAULT_PROFILE_SYNC_CONFIG;
  return {
    allowUserCreation: provisioning.enabled === true,
    syncProfileOnCreate: profileSync.onCreate === true,
    syncProfileForExisting: profileSync.forExisting === true,
  };
}

function getGroupSyncOptions(oidcConfig: EnabledOidcConfig): EntraGroupSyncOptions {
  const groupSync = oidcConfig.groupSync ?? DEFAULT_GROUP_SYNC_CONFIG;
  return {
    syncGroupsOnCreate: groupSync.onCreate === true,
    syncGroupsForExisting: groupSync.forExisting === true,
  };
}

function getUserInfoOptions(userInfo?: UserInfoConfig): RemoteUserInfoOptions {
  const config = userInfo ?? DEFAULT_USER_INFO_CONFIG;
  return {
    fetchUserInfo: config.fetch === true,
    requireUserInfo: config.require === true,
  };
}

function getFederatedCacheOptions(
  federatedAuthCache?: FederatedAuthCacheConfig,
): FederatedAuthCacheOptions {
  const cacheConfig = federatedAuthCache ?? DEFAULT_FEDERATED_AUTH_CACHE_CONFIG;
  return {
    enabled: cacheConfig.enabled === true,
    ttlMs: Math.max(cacheConfig.ttlSeconds, 0) * 1000,
  };
}

function getEntraGraphConfig(oidcConfig: EnabledOidcConfig): EntraGraphConfig {
  return {
    issuer: oidcConfig.issuer,
    clientId: process.env.OPENID_CLIENT_ID,
    clientSecret: process.env.OPENID_CLIENT_SECRET,
    enabled: true,
  };
}

function shouldSyncRemoteGroups(
  options: EntraGroupSyncOptions,
  lifecycle: 'created' | 'existing',
): boolean {
  return lifecycle === 'created' ? options.syncGroupsOnCreate : options.syncGroupsForExisting;
}

async function runTenantScoped<T>(user: IUser, fn: () => Promise<T>): Promise<T> {
  if (!user.tenantId) {
    return fn();
  }

  return tenantStorage.run({ tenantId: user.tenantId }, fn);
}

function hashLogValue(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function getUserId(user: IUser): string | undefined {
  return user._id?.toString() ?? user.id;
}

function getCacheLogContext(input: FederatedAuthCacheKeyInput): RemoteAuthLogContext {
  return {
    tenantId: input.tenantId ?? 'base',
    issuer: normalizeOpenIdIssuer(input.issuer) ?? input.issuer,
    subjectHash: hashLogValue(input.subject),
  };
}

function getUserLogContext({
  user,
  input,
  lifecycle,
  reason,
}: {
  user: IUser;
  input?: FederatedAuthCacheKeyInput | null;
  lifecycle?: 'created' | 'existing';
  reason?: string;
}): RemoteAuthLogContext {
  return {
    tenantId: user.tenantId ?? input?.tenantId ?? 'base',
    userId: getUserId(user),
    issuer: input
      ? (normalizeOpenIdIssuer(input.issuer) ?? input.issuer)
      : normalizeOpenIdIssuer(user.openidIssuer),
    subjectHash: hashLogValue(input?.subject ?? user.openidId),
    lifecycle,
    reason,
  };
}

function getCacheSubject(payload: JwtPayload): string | undefined {
  return typeof payload.sub === 'string' && payload.sub.trim() ? payload.sub.trim() : undefined;
}

function getCacheInput(
  payload: JwtPayload,
  issuer: string,
  tenantId?: string,
): FederatedAuthCacheKeyInput | null {
  const subject = getCacheSubject(payload);
  if (!subject) {
    return null;
  }

  return {
    tenantId,
    issuer,
    subject,
  };
}

function hydrateCachedOpenIdUser(
  entry: FederatedAuthCacheEntry,
  token: string,
  payload: JwtPayload,
): IUser {
  return attachFederatedTokens(
    {
      _id: entry.userId,
      id: entry.userId,
      email: entry.email,
      provider: 'openid',
      openidId: entry.subject,
      ...(entry.issuer ? { openidIssuer: entry.issuer } : {}),
      ...(entry.tenantId ? { tenantId: entry.tenantId } : {}),
      ...(entry.username ? { username: entry.username } : {}),
      ...(entry.name ? { name: entry.name } : {}),
      ...(entry.role ? { role: entry.role } : {}),
      ...(entry.idOnTheSource ? { idOnTheSource: entry.idOnTheSource } : {}),
    } as unknown as IUser,
    token,
    payload,
  );
}

function isSameScopeCacheEligible(initialOptions: GetAppConfigOptions, user: IUser): boolean {
  const requestTenantId = initialOptions.tenantId;
  if (requestTenantId) {
    return user.tenantId === requestTenantId;
  }

  return !user.tenantId;
}

function buildFederatedCacheEntry({
  user,
  input,
  lifecycle,
  options,
  groupsSyncedAt,
}: {
  user: IUser;
  input: FederatedAuthCacheKeyInput;
  lifecycle: 'created' | 'existing';
  options: OpenIdAccountOptions;
  groupsSyncedAt?: number;
}): FederatedAuthCacheEntry | null {
  const now = Date.now();
  const userId = getUserId(user);
  if (!userId) {
    return null;
  }

  const profileSynced =
    lifecycle === 'created' ? options.syncProfileOnCreate : options.syncProfileForExisting;

  return {
    userId,
    ...(user.tenantId ? { tenantId: user.tenantId } : {}),
    subject: input.subject,
    ...(input.issuer ? { issuer: normalizeOpenIdIssuer(input.issuer) ?? input.issuer } : {}),
    email: user.email,
    ...(user.username ? { username: user.username } : {}),
    ...(user.name ? { name: user.name } : {}),
    ...(user.role ? { role: user.role } : {}),
    ...(user.idOnTheSource ? { idOnTheSource: user.idOnTheSource } : {}),
    accountSyncedAt: now,
    ...(profileSynced ? { profileSyncedAt: now } : {}),
    ...(groupsSyncedAt ? { groupsSyncedAt } : {}),
  };
}

function shouldWriteFederatedAuthCache({
  cacheInput,
  initialOptions,
  user,
  groupSyncResult,
}: {
  cacheInput: FederatedAuthCacheKeyInput | null;
  initialOptions: GetAppConfigOptions;
  user: IUser;
  groupSyncResult: EntraGroupSyncResult;
}): boolean {
  return Boolean(
    cacheInput &&
      isSameScopeCacheEligible(initialOptions, user) &&
      (!groupSyncResult.attempted || groupSyncResult.synced),
  );
}

async function readRemoteFederatedAuthCache(
  input: FederatedAuthCacheKeyInput,
  options: FederatedAuthCacheOptions,
): Promise<{ entry: FederatedAuthCacheEntry | null; failed: boolean }> {
  try {
    return { entry: await readFederatedAuthCache(input, options), failed: false };
  } catch (err) {
    logger.warn('[remoteAgentAuth] Federated auth cache read failed:', err);
    return { entry: null, failed: true };
  }
}

async function writeRemoteFederatedAuthCache(
  input: FederatedAuthCacheKeyInput,
  entry: FederatedAuthCacheEntry,
  options: FederatedAuthCacheOptions,
): Promise<boolean> {
  try {
    await writeFederatedAuthCache(input, entry, options);
    return true;
  } catch (err) {
    logger.warn('[remoteAgentAuth] Federated auth cache write failed:', err);
    return false;
  }
}

async function enforceApiKeyTenantPolicy(
  req: Request,
  res: Response,
  next: NextFunction,
  getAppConfig: RemoteAgentAuthDeps['getAppConfig'],
): Promise<void> {
  const config = await getAppConfig(getConfigOptions(req));

  if (!isApiKeyEnabled(config)) {
    logger.warn('[remoteAgentAuth] API key rejected by resolved tenant auth policy');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}

async function runApiKeyAuth(
  req: Request,
  res: Response,
  next: NextFunction,
  apiKeyMiddleware: RequestHandler,
  getAppConfig: RemoteAgentAuthDeps['getAppConfig'],
): Promise<void> {
  let postAuth: Promise<void> | undefined;

  const wrappedNext: NextFunction = (err?: unknown) => {
    if (err != null) {
      next(err);
      return;
    }

    postAuth = enforceApiKeyTenantPolicy(req, res, next, getAppConfig);
  };

  await Promise.resolve(apiKeyMiddleware(req, res, wrappedNext));
  if (postAuth) await postAuth;
}

async function enforceOidcTenantPolicy(
  token: string,
  user: IUser,
  initialOptions: GetAppConfigOptions,
  getAppConfig: RemoteAgentAuthDeps['getAppConfig'],
): Promise<TenantPolicyResult> {
  if (isResolvedUserConfigScope(initialOptions, user)) return { ok: true };

  const config = await getAppConfig(getUserConfigOptions(user));
  const oidcConfig = getEnabledOidcConfig(getRemoteAuthConfig(config));
  if (!oidcConfig) {
    logger.warn('[remoteAgentAuth] OIDC rejected by resolved tenant auth policy');
    return { ok: false };
  }

  try {
    const payload = await verifyOidcBearer(token, oidcConfig);
    if (hasRequiredScopes(oidcConfig.scope, payload)) return { ok: true, config, oidcConfig };
    logger.warn(
      `[remoteAgentAuth] Token missing resolved tenant required scope: ${oidcConfig.scope}`,
    );
  } catch (err) {
    logger.warn('[remoteAgentAuth] OIDC token rejected by resolved tenant auth policy:', err);
  }

  return { ok: false };
}

function verifyJwt(
  token: string,
  signingKey: jwksRsa.SigningKey,
  oidcConfig: EnabledOidcConfig,
): Promise<JwtPayload> {
  return new Promise((resolve, reject) => {
    jwt.verify(token, signingKey.getPublicKey(), getVerifyOptions(oidcConfig), (err, payload) => {
      if (err != null || payload == null) return reject(err ?? new Error('Empty payload'));
      if (typeof payload === 'string') return reject(new Error('Invalid JWT payload'));
      resolve(payload);
    });
  });
}

async function verifyWithSigningKeys(
  token: string,
  signingKeys: jwksRsa.SigningKey[],
  oidcConfig: EnabledOidcConfig,
): Promise<JwtPayload> {
  let lastError: Error | null = null;

  for (const signingKey of signingKeys) {
    try {
      return await verifyJwt(token, signingKey, oidcConfig);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error('No signing keys in JWKS');
}

async function verifyOidcBearer(token: string, oidcConfig: EnabledOidcConfig): Promise<JwtPayload> {
  ensureRemoteOidcUrlAllowed(oidcConfig.issuer, 'OIDC issuer');

  const decoded = jwt.decode(token, { complete: true });
  if (decoded == null || typeof decoded === 'string') throw new Error('Invalid JWT: cannot decode');

  const kid = typeof decoded.header?.kid === 'string' ? decoded.header.kid : undefined;
  const client = await getJwksClient(oidcConfig);

  if (kid != null) {
    const signingKey = await client.getSigningKey(kid);
    return verifyJwt(token, signingKey, oidcConfig);
  }

  return verifyWithSigningKeys(token, await client.getSigningKeys(), oidcConfig);
}

function attachFederatedTokens(user: IUser, token: string, payload: JwtPayload): IUser {
  user.federatedTokens = {
    access_token: token,
    ...(payload.exp != null ? { expires_at: payload.exp } : {}),
  };
  return user;
}

function shouldResumeDeferredTenantMutation(
  initialOptions: GetAppConfigOptions,
  user: IUser,
  created: boolean,
): boolean {
  return !created && !initialOptions.tenantId && Boolean(user.tenantId);
}

async function resolveRemoteOpenIdAccount({
  payload,
  profile,
  issuer,
  tenantId,
  config,
  oidcConfig,
  accountOptions,
  groupSyncOptions,
  methods,
}: {
  payload: JwtPayload;
  profile?: OpenIdAccountProfile;
  issuer: string;
  tenantId?: string;
  config: AppConfig;
  oidcConfig: EnabledOidcConfig;
  accountOptions: OpenIdAccountOptions;
  groupSyncOptions: EntraGroupSyncOptions;
  methods: OpenIdAccountMethods;
}): Promise<RemoteAccountResolution> {
  const accountResult = await resolveOpenIdAccount({
    claims: payload,
    profile,
    issuer,
    tenantId,
    appConfig: config,
    options: accountOptions,
    methods,
  });

  if (accountResult.status === 'unauthorized') {
    logger.warn(`[remoteAgentAuth] OpenID user rejected: ${accountResult.reason}`);
    return { ok: false, status: 401 };
  }

  if (accountResult.status === 'failed') {
    logger.error('[remoteAgentAuth] OpenID account resolution failed:', accountResult);
    return { ok: false, status: 500 };
  }

  return {
    ok: true,
    context: {
      user: accountResult.user,
      lifecycle: accountResult.created ? 'created' : 'existing',
      accountOptions,
      groupSyncOptions,
      oidcConfig,
      config,
    },
  };
}

async function resolveTenantScopedAccountIfNeeded({
  context,
  payload,
  profile,
  issuer,
  initialOptions,
  tenantPolicy,
  methods,
}: {
  context: RemoteAuthContext;
  payload: JwtPayload;
  profile?: OpenIdAccountProfile;
  issuer: string;
  initialOptions: GetAppConfigOptions;
  tenantPolicy: TenantPolicySuccess;
  methods: OpenIdAccountMethods;
}): Promise<RemoteAccountResolution> {
  if (
    !shouldResumeDeferredTenantMutation(
      initialOptions,
      context.user,
      context.lifecycle === 'created',
    )
  ) {
    return { ok: true, context };
  }

  const oidcConfig = tenantPolicy.oidcConfig ?? context.oidcConfig;
  return resolveRemoteOpenIdAccount({
    payload,
    profile,
    issuer,
    tenantId: context.user.tenantId,
    config: tenantPolicy.config ?? context.config,
    oidcConfig,
    accountOptions: getAccountOptions(oidcConfig),
    groupSyncOptions: getGroupSyncOptions(oidcConfig),
    methods,
  });
}

async function syncRemoteGroups({
  context,
  token,
  methods,
  cacheInput,
}: {
  context: RemoteAuthContext;
  token: string;
  methods: GroupSyncMethods;
  cacheInput: FederatedAuthCacheKeyInput | null;
}): Promise<EntraGroupSyncResult> {
  const { user, lifecycle, groupSyncOptions, oidcConfig } = context;
  if (!shouldSyncRemoteGroups(groupSyncOptions, lifecycle)) {
    return { attempted: false, synced: false, reason: 'disabled' };
  }

  const groupContext = getUserLogContext({
    user,
    input: cacheInput,
    lifecycle,
  });
  logger.info('[remoteAgentAuth] Remote Entra group sync started', groupContext);

  const result = await runTenantScoped(user, () =>
    syncUserEntraGroupMemberships({
      lifecycle,
      user,
      accessToken: token,
      graphConfig: getEntraGraphConfig(oidcConfig),
      options: groupSyncOptions,
      methods,
    }),
  );
  const resultContext = getUserLogContext({
    user,
    input: cacheInput,
    lifecycle,
    reason: result.reason,
  });

  if (result.synced) {
    logger.info('[remoteAgentAuth] Remote Entra group sync completed', resultContext);
  } else if (result.attempted) {
    logger.warn('[remoteAgentAuth] Remote Entra group sync failed', resultContext);
  } else {
    logger.info('[remoteAgentAuth] Remote Entra group sync completed', resultContext);
  }

  return result;
}

async function writeFederatedAuthCacheIfEligible({
  context,
  cacheInput,
  initialOptions,
  groupSyncResult,
}: {
  context: RemoteAuthContext;
  cacheInput: FederatedAuthCacheKeyInput | null;
  initialOptions: GetAppConfigOptions;
  groupSyncResult: EntraGroupSyncResult;
}): Promise<void> {
  const federatedCacheOptions = getFederatedCacheOptions(context.oidcConfig.federatedAuthCache);
  if (!cacheInput || !federatedCacheOptions.enabled || federatedCacheOptions.ttlMs <= 0) {
    return;
  }

  if (
    !shouldWriteFederatedAuthCache({
      cacheInput,
      initialOptions,
      user: context.user,
      groupSyncResult,
    })
  ) {
    return;
  }

  const cacheEntry = buildFederatedCacheEntry({
    user: context.user,
    input: cacheInput,
    lifecycle: context.lifecycle,
    options: context.accountOptions,
    groupsSyncedAt: groupSyncResult.synced ? groupSyncResult.syncedAt : undefined,
  });
  if (!cacheEntry) {
    return;
  }

  const cacheContext = {
    ...getCacheLogContext(cacheInput),
    userId: cacheEntry.userId,
  };
  logger.debug('[remoteAgentAuth] Federated auth cache write started', cacheContext);
  const written = await writeRemoteFederatedAuthCache(
    cacheInput,
    cacheEntry,
    federatedCacheOptions,
  );
  if (written) {
    logger.debug('[remoteAgentAuth] Federated auth cache write completed', cacheContext);
  }
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
 *           scope: <scope>
 * ```
 */
export function createRemoteAgentAuth({
  apiKeyMiddleware,
  findUser,
  createUser,
  updateUser,
  bulkUpdateGroups,
  findGroupsByExternalIds,
  upsertGroupByExternalId,
  getAppConfig,
}: RemoteAgentAuthDeps): RequestHandler {
  /**
   * Annotated as `express.Request` (and helpers below take the same type)
   * so the local `Request.user` augmentation in `src/types/express.d.ts`
   * applies inside the closure. The closure is then cast to
   * `RequestHandler` at the return — `RequestHandler`'s internal
   * `Request` resolves through `express-serve-static-core` and lacks the
   * augmentation, so a direct return would mismatch on `user`.
   */
  const handler = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const initialConfigOptions = getConfigOptions(req);
      const config = await getAppConfig(initialConfigOptions);
      const authConfig = getRemoteAuthConfig(config);
      const apiKeyEnabled = isApiKeyEnabled(config);

      if (authConfig?.oidc?.enabled !== true) {
        if (apiKeyEnabled) {
          await runApiKeyAuth(req, res, next, apiKeyMiddleware, getAppConfig);
          return;
        }
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      if (!authConfig.oidc.issuer) {
        logger.error('[remoteAgentAuth] OIDC issuer is required when OIDC auth is enabled');
        res.status(500).json({ error: 'Internal server error' });
        return;
      }
      if (!authConfig.oidc.audience) {
        logger.error('[remoteAgentAuth] OIDC audience is required when OIDC auth is enabled');
        res.status(500).json({ error: 'Internal server error' });
        return;
      }

      const oidcConfig = getEnabledOidcConfig(authConfig);
      if (!oidcConfig) throw new Error('OIDC configuration is required when OIDC auth is enabled');

      const token = extractBearer(req.headers.authorization);
      if (token == null) {
        if (apiKeyEnabled) {
          await runApiKeyAuth(req, res, next, apiKeyMiddleware, getAppConfig);
          return;
        }
        res.status(401).json({ error: 'Bearer token required' });
        return;
      }

      let payload: JwtPayload;

      try {
        payload = await verifyOidcBearer(token, oidcConfig);
        if (!hasRequiredScopes(oidcConfig.scope, payload)) {
          logger.warn(`[remoteAgentAuth] Token missing required scope: ${oidcConfig.scope}`);
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }
      } catch (oidcErr) {
        if (apiKeyEnabled) {
          logger.debug('[remoteAgentAuth] OIDC verification failed; trying API key auth:', oidcErr);
          await runApiKeyAuth(req, res, next, apiKeyMiddleware, getAppConfig);
          return;
        }
        logger.error('[remoteAgentAuth] OIDC verification failed:', oidcErr);
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const requestTenantId = initialConfigOptions.tenantId;
      if (!requestTenantId && isTenantStrict()) {
        logger.warn('[remoteAgentAuth] OpenID user rejected: tenant_context_required', {
          tenantId: 'missing',
          reason: 'tenant_context_required',
        });
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const accountOptions = getAccountOptions(oidcConfig);
      const groupSyncOptions = getGroupSyncOptions(oidcConfig);
      const userInfoOptions = getUserInfoOptions(oidcConfig.userInfo);
      const federatedCacheOptions = getFederatedCacheOptions(oidcConfig.federatedAuthCache);
      const initialCacheInput = getCacheInput(payload, oidcConfig.issuer, requestTenantId);
      if (!initialCacheInput) {
        logger.warn('[remoteAgentAuth] OpenID user rejected: missing_sub');
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const cacheReadContext = getCacheLogContext(initialCacheInput);
      if (federatedCacheOptions.enabled) {
        logger.debug('[remoteAgentAuth] Federated auth cache read started', cacheReadContext);
      }
      const cacheReadResult = federatedCacheOptions.enabled
        ? await readRemoteFederatedAuthCache(initialCacheInput, federatedCacheOptions)
        : { entry: null, failed: false };
      const cachedEntry = cacheReadResult.entry;
      if (cachedEntry) {
        logger.debug('[remoteAgentAuth] Federated auth cache read completed', {
          ...cacheReadContext,
          outcome: 'hit',
          userId: cachedEntry.userId,
        });
        const cachedUser = hydrateCachedOpenIdUser(cachedEntry, token, payload);
        const tenantPolicy = await enforceOidcTenantPolicy(
          token,
          cachedUser,
          initialConfigOptions,
          getAppConfig,
        );
        if (!tenantPolicy.ok) {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }

        req.user = cachedUser;
        return next();
      }
      if (federatedCacheOptions.enabled && !cacheReadResult.failed) {
        logger.debug('[remoteAgentAuth] Federated auth cache read completed', {
          ...cacheReadContext,
          outcome: 'miss',
        });
      }

      if (userInfoOptions.fetchUserInfo) {
        logger.info(
          '[remoteAgentAuth] OpenID userinfo fetch started',
          getCacheLogContext(initialCacheInput),
        );
      }
      const userInfoResult = await enrichOpenIdProfile({
        claims: payload,
        accessToken: token,
        subject: initialCacheInput.subject,
        config: getEntraGraphConfig(oidcConfig),
        fetchUserInfo: userInfoOptions.fetchUserInfo,
      });
      if (userInfoOptions.fetchUserInfo && userInfoResult.status === 'fetched') {
        logger.info(
          '[remoteAgentAuth] OpenID userinfo fetch completed',
          getCacheLogContext(initialCacheInput),
        );
      } else if (userInfoResult.status === 'failed') {
        logger.warn('[remoteAgentAuth] OpenID userinfo fetch failed', {
          ...getCacheLogContext(initialCacheInput),
          reason: userInfoResult.reason,
        });
        if (userInfoOptions.requireUserInfo) {
          logger.warn('[remoteAgentAuth] Required OpenID userinfo rejected remote auth', {
            ...(initialCacheInput ? getCacheLogContext(initialCacheInput) : {}),
            reason: userInfoResult.reason,
          });
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }
      }

      const accountMethods = {
        findUser,
        createUser,
        updateUser,
      };
      const accountResolution = await resolveRemoteOpenIdAccount({
        payload,
        profile: userInfoResult.profile,
        issuer: oidcConfig.issuer,
        tenantId: requestTenantId,
        config,
        oidcConfig,
        accountOptions,
        groupSyncOptions,
        methods: accountMethods,
      });

      if (accountResolution.ok === false) {
        res
          .status(accountResolution.status)
          .json(
            accountResolution.status === 401
              ? { error: 'Unauthorized' }
              : { error: 'Internal server error' },
          );
        return;
      }

      let authContext = accountResolution.context;

      const tenantPolicy = await enforceOidcTenantPolicy(
        token,
        authContext.user,
        initialConfigOptions,
        getAppConfig,
      );
      if (!tenantPolicy.ok) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const tenantScopedResolution = await resolveTenantScopedAccountIfNeeded({
        context: authContext,
        payload,
        profile: userInfoResult.profile,
        issuer: oidcConfig.issuer,
        initialOptions: initialConfigOptions,
        tenantPolicy,
        methods: accountMethods,
      });
      if (tenantScopedResolution.ok === false) {
        res
          .status(tenantScopedResolution.status)
          .json(
            tenantScopedResolution.status === 401
              ? { error: 'Unauthorized' }
              : { error: 'Internal server error' },
          );
        return;
      }
      authContext = tenantScopedResolution.context;

      const finalCacheInput = getCacheInput(
        payload,
        authContext.oidcConfig.issuer,
        requestTenantId,
      );
      logger.info(
        authContext.lifecycle === 'created'
          ? '[remoteAgentAuth] OpenID remote user provisioned'
          : '[remoteAgentAuth] OpenID remote user resolved',
        getUserLogContext({
          user: authContext.user,
          input: finalCacheInput,
          lifecycle: authContext.lifecycle,
        }),
      );

      attachFederatedTokens(authContext.user, token, payload);
      const groupSyncResult = await syncRemoteGroups({
        context: authContext,
        token,
        cacheInput: finalCacheInput,
        methods: {
          bulkUpdateGroups,
          findGroupsByExternalIds,
          upsertGroupByExternalId,
        },
      });

      await writeFederatedAuthCacheIfEligible({
        context: authContext,
        cacheInput: finalCacheInput,
        initialOptions: initialConfigOptions,
        groupSyncResult,
      });

      req.user = authContext.user;
      return next();
    } catch (err) {
      logger.error('[remoteAgentAuth] Unexpected error', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
  };
  return handler as RequestHandler;
}
