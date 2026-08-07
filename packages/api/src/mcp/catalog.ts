import { createHash, createHmac } from 'crypto';
import { logger } from '@librechat/data-schemas';
import type { IToken, TokenMethods } from '@librechat/data-schemas';
import type {
  LCAvailableTools,
  MCPConnectionProvenance,
  MCPOptions,
  MCPServerSource,
  ParsedServerConfig,
} from './types';
export type { MCPConnectionProvenance } from './types';
import { isOAuthServer, isUserSourced } from './utils';
import { processMCPEnv } from '~/utils/env';

export const MCP_TOOL_CATALOG_VERSION = 1 as const;
export const MCP_TOOL_CATALOG_TTL_MS: number = 12 * 60 * 60 * 1000;
export const MCP_OBO_CONNECTION_AUTHORIZATION_IDENTITY = 'obo_lifecycle';

export type MCPToolCatalogPendingReason =
  | 'cold'
  | 'expired'
  | 'scope_changed'
  | 'config_changed'
  | 'credentials_changed'
  | 'authorization_unavailable'
  | 'missing_credentials'
  | 'schema_mismatch'
  | 'user_scoped'
  | 'request_scoped';

export interface MCPToolCatalogScope {
  tenant: string;
  principal: string;
  server: string;
  policy: string;
  config: string;
  credentials: string;
}

export interface MCPToolCatalogMetadata {
  version: typeof MCP_TOOL_CATALOG_VERSION;
  source: MCPServerSource | 'unknown';
  revision: string;
  authorizationKind: MCPConnectionProvenance['authorizationKind'];
  cachedAt: number;
  freshUntil: number;
  scope: MCPToolCatalogScope;
}

export interface MCPToolCatalogEnvelope {
  metadata: MCPToolCatalogMetadata;
  tools: LCAvailableTools;
}

export type MCPToolCatalogResult =
  | {
      status: 'ready';
      tools: LCAvailableTools;
      metadata: MCPToolCatalogMetadata;
    }
  | {
      status: 'pending_activation';
      reason: MCPToolCatalogPendingReason;
    };

export interface MCPToolCatalogScopeInput {
  tenantId: string | null;
  userId: string;
  serverName: string;
  serverConfig: ParsedServerConfig;
  securityPolicyIdentity: string;
  customUserVars?: Record<string, string>;
  authorizationIdentity: string;
  /** Fresh principal/Config document proof for the merged MCP authority. */
  authorityIdentity?: string;
  /** Authorization mode proven by the connection that discovered these schemas. */
  authorizationKind?: MCPConnectionProvenance['authorizationKind'];
  /** Exact post-placeholder config used to construct the discovering connection. */
  effectiveServerConfig?: MCPOptions;
}

const RUNTIME_CONFIG_FIELDS = new Set([
  'requiresOAuth',
  'oauthMetadata',
  'capabilities',
  'tools',
  'toolFunctions',
  'initDuration',
  'updatedAt',
  'inspectionFailed',
  'serverInstructions',
  'catalogConfiguredRequiresOAuth',
  'catalogConfiguredServerInstructions',
]);

function digest(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

function protectedDigest(value: string): string {
  const key = process.env.CREDS_KEY || process.env.JWT_SECRET;
  if (!key) {
    throw new Error('MCP tool catalog fingerprint key is unavailable');
  }
  return createHmac('sha256', key)
    .update('mcp-tool-catalog:fingerprint:v1\0')
    .update(value)
    .digest('base64url');
}

export function isMCPToolCatalogFingerprintAvailable(): boolean {
  return Boolean(process.env.CREDS_KEY || process.env.JWT_SECRET);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value == null || typeof value !== 'object') {
    return value;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, canonicalize(entry)]);
  return Object.fromEntries(entries);
}

function fingerprint(value: unknown): string {
  return protectedDigest(JSON.stringify(canonicalize(value)));
}

function hasOwn(config: ParsedServerConfig, key: keyof ParsedServerConfig): boolean {
  return Object.prototype.hasOwnProperty.call(config, key);
}

function declarativeConfig(serverConfig: ParsedServerConfig): Record<string, unknown> {
  const configuredRequiresOAuth = hasOwn(serverConfig, 'catalogConfiguredRequiresOAuth')
    ? serverConfig.catalogConfiguredRequiresOAuth
    : serverConfig.requiresOAuth;
  const configuredServerInstructions = hasOwn(serverConfig, 'catalogConfiguredServerInstructions')
    ? serverConfig.catalogConfiguredServerInstructions
    : serverConfig.serverInstructions;
  const config = Object.fromEntries(
    Object.entries(serverConfig).filter(([key]) => !RUNTIME_CONFIG_FIELDS.has(key)),
  );
  if (configuredRequiresOAuth != null) {
    config.requiresOAuth = configuredRequiresOAuth;
  }
  if (configuredServerInstructions != null) {
    config.serverInstructions = configuredServerInstructions;
  }
  return config;
}

function effectiveConfig(input: MCPToolCatalogScopeInput): MCPOptions {
  if (input.effectiveServerConfig) {
    return input.effectiveServerConfig;
  }
  return processMCPEnv({
    options: input.serverConfig,
    dbSourced: isUserSourced(input.serverConfig),
    customUserVars: input.customUserVars,
  });
}

function normalizePolicyValues(values?: string[] | null): string[] | null {
  return values == null ? null : [...new Set(values)].sort();
}

export function withMCPToolCatalogConfigContext(
  serverConfig: ParsedServerConfig,
): ParsedServerConfig {
  const configuredRequiresOAuth = hasOwn(serverConfig, 'catalogConfiguredRequiresOAuth')
    ? serverConfig.catalogConfiguredRequiresOAuth
    : (serverConfig.requiresOAuth ?? null);
  const configuredServerInstructions = hasOwn(serverConfig, 'catalogConfiguredServerInstructions')
    ? serverConfig.catalogConfiguredServerInstructions
    : (serverConfig.serverInstructions ?? null);
  const config = { ...serverConfig };
  Object.defineProperties(config, {
    catalogConfiguredRequiresOAuth: {
      configurable: true,
      value: configuredRequiresOAuth,
    },
    catalogConfiguredServerInstructions: {
      configurable: true,
      value: configuredServerInstructions,
    },
  });
  return config;
}

/** Preserves pre-inspection catalog context across registry serialization boundaries. */
export function serializeMCPToolCatalogConfigContext(
  serverConfig: ParsedServerConfig,
): ParsedServerConfig {
  return {
    ...serverConfig,
    catalogConfiguredRequiresOAuth: serverConfig.catalogConfiguredRequiresOAuth ?? null,
    catalogConfiguredServerInstructions: serverConfig.catalogConfiguredServerInstructions ?? null,
  };
}

export function createMCPToolCatalogSecurityPolicyIdentity(policy: {
  allowedDomains?: string[] | null;
  allowedAddresses?: string[] | null;
}): string {
  return fingerprint({
    allowedDomains: normalizePolicyValues(policy.allowedDomains),
    allowedAddresses: normalizePolicyValues(policy.allowedAddresses),
  });
}

export function createMCPToolCatalogScope({
  tenantId,
  userId,
  serverName,
  serverConfig,
  securityPolicyIdentity,
  customUserVars,
  authorizationIdentity,
  authorityIdentity,
  authorizationKind,
  effectiveServerConfig,
}: MCPToolCatalogScopeInput): MCPToolCatalogScope {
  return {
    tenant: digest(tenantId ?? '__default_tenant__'),
    principal: digest(userId),
    server: digest(serverName),
    policy: securityPolicyIdentity,
    config: fingerprint({
      authorityIdentity: authorityIdentity ?? null,
      serverConfig: declarativeConfig(serverConfig),
    }),
    credentials: fingerprint({
      customUserVars: customUserVars ?? {},
      authorizationIdentity: authorizationIdentity ?? 'none',
      authorizationKind:
        authorizationKind ?? getMCPAuthorizationKind(authorizationIdentity, serverConfig),
      effectiveServerConfig: declarativeConfig(
        effectiveConfig({
          tenantId,
          userId,
          serverName,
          serverConfig,
          securityPolicyIdentity,
          customUserVars,
          authorizationIdentity,
          authorizationKind,
          effectiveServerConfig,
        }) as ParsedServerConfig,
      ),
    }),
  };
}

function getMCPAuthorizationKind(
  authorizationIdentity: string,
  serverConfig?: ParsedServerConfig,
): MCPConnectionProvenance['authorizationKind'] {
  if (authorizationIdentity === MCP_OBO_CONNECTION_AUTHORIZATION_IDENTITY) {
    return 'obo';
  }
  return authorizationIdentity === 'none' && !(serverConfig && isOAuthServer(serverConfig))
    ? 'none'
    : 'oauth';
}

export function createMCPConnectionProvenance(
  input: MCPToolCatalogScopeInput,
  principalKind: MCPConnectionProvenance['principalKind'],
  authorizationKind: MCPConnectionProvenance['authorizationKind'] = getMCPAuthorizationKind(
    input.authorizationIdentity,
    input.serverConfig,
  ),
): MCPConnectionProvenance | null {
  if (!isMCPToolCatalogFingerprintAvailable()) {
    return null;
  }
  return {
    version: MCP_TOOL_CATALOG_VERSION,
    scope: createMCPToolCatalogScope({ ...input, authorizationKind }),
    principalKind,
    authorizationKind,
  };
}

export function matchesMCPConnectionProvenance(
  provenance: MCPConnectionProvenance | null | undefined,
  input: MCPToolCatalogScopeInput,
): boolean {
  if (!provenance || provenance.version !== MCP_TOOL_CATALOG_VERSION) {
    return false;
  }
  const expected = createMCPToolCatalogScope(input);
  const actual = provenance.scope;
  const appShareable =
    provenance.principalKind === 'app' &&
    input.authorizationIdentity === 'none' &&
    Object.keys(input.customUserVars ?? {}).length === 0;
  const principalMatches = actual.principal === expected.principal || appShareable;
  const tenantMatches = actual.tenant === expected.tenant || appShareable;
  return (
    principalMatches &&
    tenantMatches &&
    actual.server === expected.server &&
    actual.policy === expected.policy &&
    actual.config === expected.config &&
    actual.credentials === expected.credentials
  );
}

export function getMCPToolCatalogRevision(serverConfig: ParsedServerConfig): string {
  return fingerprint(declarativeConfig(serverConfig));
}

interface MCPAuthorizationIdentityRecord {
  _id?: IToken['_id'] | string;
  type?: string;
  identifier?: string;
  createdAt?: Date;
  metadata?: IToken['metadata'] | Record<string, unknown>;
}

function getCredentialSetId(token: MCPAuthorizationIdentityRecord | null): string | undefined {
  const metadata =
    token?.metadata instanceof Map ? Object.fromEntries(token.metadata) : token?.metadata;
  const value = metadata?.credential_set_id;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function getRecordIdentity(token: MCPAuthorizationIdentityRecord | null): string | undefined {
  if (!token) {
    return undefined;
  }
  const recordIdentity = token._id ?? token.createdAt?.getTime();
  return getCredentialSetId(token) ?? (recordIdentity != null ? String(recordIdentity) : undefined);
}

export type MCPAuthorizationTokenBatchFinder = (query: {
  userId: string;
  type: { $in: string[] };
  identifier: { $in: string[] };
}) => Promise<MCPAuthorizationIdentityRecord[]>;

const MCP_AUTHORIZATION_TOKEN_TYPES = [
  'mcp_oauth_client',
  'mcp_oauth_refresh',
  'mcp_oauth',
] as const;

const MCP_AUTHORIZATION_IDENTITY_QUERY_OPTIONS = {
  sort: { createdAt: -1, _id: -1 },
  projection: {
    _id: 1,
    createdAt: 1,
    'metadata.credential_set_id': 1,
  },
} as const;

function authorizationRecordKey(type: string, identifier: string): string {
  return `${type}\0${identifier}`;
}

function authorizationRecordOrder(record: MCPAuthorizationIdentityRecord): [number, string] {
  return [record.createdAt?.getTime() ?? 0, String(record._id ?? '')];
}

function isNewerAuthorizationRecord(
  candidate: MCPAuthorizationIdentityRecord,
  current: MCPAuthorizationIdentityRecord,
): boolean {
  const [candidateTime, candidateId] = authorizationRecordOrder(candidate);
  const [currentTime, currentId] = authorizationRecordOrder(current);
  return candidateTime > currentTime || (candidateTime === currentTime && candidateId > currentId);
}

function resolveAuthorizationIdentity(
  records: ReadonlyMap<string, MCPAuthorizationIdentityRecord>,
  serverName: string,
): string {
  const identifier = `mcp:${serverName}`;
  return (
    getRecordIdentity(
      records.get(authorizationRecordKey('mcp_oauth_client', `${identifier}:client`)) ?? null,
    ) ??
    getRecordIdentity(
      records.get(authorizationRecordKey('mcp_oauth_refresh', `${identifier}:refresh`)) ?? null,
    ) ??
    getRecordIdentity(records.get(authorizationRecordKey('mcp_oauth', identifier)) ?? null) ??
    'none'
  );
}

export async function getMCPAuthorizationIdentities({
  userId,
  serverNames,
  findToken,
  findTokens,
}: {
  userId: string;
  serverNames: string[];
  findToken: TokenMethods['findToken'];
  findTokens?: MCPAuthorizationTokenBatchFinder;
}): Promise<Map<string, string | null>> {
  const uniqueServerNames = [...new Set(serverNames)];
  if (!findTokens) {
    return new Map(
      await Promise.all(
        uniqueServerNames.map(
          async (serverName) =>
            [
              serverName,
              await getMCPAuthorizationIdentity({ userId, serverName, findToken }),
            ] as const,
        ),
      ),
    );
  }

  try {
    const identifiers = uniqueServerNames.flatMap((serverName) => {
      const identifier = `mcp:${serverName}`;
      return [identifier, `${identifier}:refresh`, `${identifier}:client`];
    });
    const records = await findTokens({
      userId,
      type: { $in: [...MCP_AUTHORIZATION_TOKEN_TYPES] },
      identifier: { $in: identifiers },
    });
    const recordsByIdentity = new Map<string, MCPAuthorizationIdentityRecord>();
    for (const record of records) {
      if (!record.type || !record.identifier) {
        continue;
      }
      const key = authorizationRecordKey(record.type, record.identifier);
      const current = recordsByIdentity.get(key);
      if (!current || isNewerAuthorizationRecord(record, current)) {
        recordsByIdentity.set(key, record);
      }
    }
    return new Map(
      uniqueServerNames.map(
        (serverName) =>
          [serverName, resolveAuthorizationIdentity(recordsByIdentity, serverName)] as const,
      ),
    );
  } catch (error) {
    logger.warn(
      `[MCP Catalog] Authorization scope unavailable for ${uniqueServerNames.length} server(s)`,
      error,
    );
    return new Map(uniqueServerNames.map((serverName) => [serverName, null] as const));
  }
}

export async function getMCPAuthorizationIdentity({
  userId,
  serverName,
  findToken,
  findTokens,
}: {
  userId: string;
  serverName: string;
  findToken: TokenMethods['findToken'];
  findTokens?: MCPAuthorizationTokenBatchFinder;
}): Promise<string | null> {
  if (findTokens) {
    const identities = await getMCPAuthorizationIdentities({
      userId,
      serverNames: [serverName],
      findToken,
      findTokens,
    });
    return identities.get(serverName) ?? null;
  }

  const identifier = `mcp:${serverName}`;
  try {
    const [access, refresh, client] = await Promise.all([
      findToken(
        { userId, type: 'mcp_oauth', identifier },
        MCP_AUTHORIZATION_IDENTITY_QUERY_OPTIONS,
      ),
      findToken(
        { userId, type: 'mcp_oauth_refresh', identifier: `${identifier}:refresh` },
        MCP_AUTHORIZATION_IDENTITY_QUERY_OPTIONS,
      ),
      findToken(
        { userId, type: 'mcp_oauth_client', identifier: `${identifier}:client` },
        MCP_AUTHORIZATION_IDENTITY_QUERY_OPTIONS,
      ),
    ]);
    return (
      getRecordIdentity(client) ?? getRecordIdentity(refresh) ?? getRecordIdentity(access) ?? 'none'
    );
  } catch (error) {
    logger.warn(`[MCP Catalog] Authorization scope unavailable for ${serverName}`, error);
    return null;
  }
}

export function createMCPToolCatalogEnvelope(
  tools: LCAvailableTools,
  input: MCPToolCatalogScopeInput,
  now: number = Date.now(),
): MCPToolCatalogEnvelope {
  return {
    metadata: {
      version: MCP_TOOL_CATALOG_VERSION,
      source: input.serverConfig.source ?? 'unknown',
      revision: getMCPToolCatalogRevision(input.serverConfig),
      authorizationKind:
        input.authorizationKind ??
        getMCPAuthorizationKind(input.authorizationIdentity, input.serverConfig),
      cachedAt: now,
      freshUntil: now + MCP_TOOL_CATALOG_TTL_MS,
      scope: createMCPToolCatalogScope(input),
    },
    tools,
  };
}

export function isMCPToolCatalogEnvelope(value: unknown): value is MCPToolCatalogEnvelope {
  if (value == null || typeof value !== 'object') {
    return false;
  }
  const envelope = value as Partial<MCPToolCatalogEnvelope>;
  const metadata = envelope.metadata;
  const scope = metadata?.scope;
  const isScopeIdentity = (identity: unknown): identity is string =>
    typeof identity === 'string' && identity.length > 0;
  return (
    metadata?.version === MCP_TOOL_CATALOG_VERSION &&
    ['yaml', 'config', 'user', 'unknown'].includes(metadata.source ?? '') &&
    isScopeIdentity(metadata.revision) &&
    ['none', 'oauth', 'obo'].includes(metadata.authorizationKind ?? '') &&
    typeof metadata.cachedAt === 'number' &&
    Number.isFinite(metadata.cachedAt) &&
    metadata.cachedAt >= 0 &&
    typeof metadata.freshUntil === 'number' &&
    Number.isFinite(metadata.freshUntil) &&
    metadata.freshUntil >= metadata.cachedAt &&
    scope != null &&
    isScopeIdentity(scope.tenant) &&
    isScopeIdentity(scope.principal) &&
    isScopeIdentity(scope.server) &&
    isScopeIdentity(scope.policy) &&
    isScopeIdentity(scope.config) &&
    isScopeIdentity(scope.credentials) &&
    envelope.tools != null &&
    typeof envelope.tools === 'object' &&
    !Array.isArray(envelope.tools)
  );
}

export function isValidMCPToolCatalogTools(tools: LCAvailableTools): boolean {
  return Object.entries(tools).every(
    ([name, tool]) =>
      tool?.type === 'function' &&
      tool.function?.name === name &&
      tool.function.parameters != null &&
      typeof tool.function.parameters === 'object',
  );
}

export function resolveMCPToolCatalog(
  cached: unknown,
  input: MCPToolCatalogScopeInput,
  now: number = Date.now(),
): MCPToolCatalogResult {
  if (!isMCPToolCatalogFingerprintAvailable()) {
    return { status: 'pending_activation', reason: 'authorization_unavailable' };
  }
  if (!isMCPToolCatalogEnvelope(cached)) {
    if (
      cached != null &&
      typeof cached === 'object' &&
      (cached as { metadata?: { version?: unknown } }).metadata?.version ===
        MCP_TOOL_CATALOG_VERSION
    ) {
      return { status: 'pending_activation', reason: 'schema_mismatch' };
    }
    return { status: 'pending_activation', reason: 'cold' };
  }
  if (cached.metadata.freshUntil <= now) {
    return { status: 'pending_activation', reason: 'expired' };
  }

  const expectedScope = createMCPToolCatalogScope(input);
  if (
    cached.metadata.scope.tenant !== expectedScope.tenant ||
    cached.metadata.scope.principal !== expectedScope.principal ||
    cached.metadata.scope.server !== expectedScope.server
  ) {
    return { status: 'pending_activation', reason: 'scope_changed' };
  }
  if (
    cached.metadata.scope.policy !== expectedScope.policy ||
    cached.metadata.scope.config !== expectedScope.config ||
    cached.metadata.revision !== getMCPToolCatalogRevision(input.serverConfig)
  ) {
    return { status: 'pending_activation', reason: 'config_changed' };
  }
  if (cached.metadata.scope.credentials !== expectedScope.credentials) {
    return { status: 'pending_activation', reason: 'credentials_changed' };
  }
  if (!isValidMCPToolCatalogTools(cached.tools)) {
    return { status: 'pending_activation', reason: 'schema_mismatch' };
  }
  return { status: 'ready', tools: cached.tools, metadata: cached.metadata };
}
