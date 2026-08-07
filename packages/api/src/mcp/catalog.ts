import { createHash, createHmac } from 'crypto';
import { logger } from '@librechat/data-schemas';
import type { IToken, TokenMethods } from '@librechat/data-schemas';
import type { LCAvailableTools, MCPServerSource, ParsedServerConfig } from './types';

export const MCP_TOOL_CATALOG_VERSION = 1 as const;
export const MCP_TOOL_CATALOG_TTL_MS = 12 * 60 * 60 * 1000;

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
}: MCPToolCatalogScopeInput): MCPToolCatalogScope {
  return {
    tenant: digest(tenantId ?? '__default_tenant__'),
    principal: digest(userId),
    server: digest(serverName),
    policy: securityPolicyIdentity,
    config: fingerprint(declarativeConfig(serverConfig)),
    credentials: fingerprint({
      customUserVars: customUserVars ?? {},
      authorizationIdentity: authorizationIdentity ?? 'none',
    }),
  };
}

export function getMCPToolCatalogRevision(serverConfig: ParsedServerConfig): string {
  return fingerprint(declarativeConfig(serverConfig));
}

function getCredentialSetId(token: IToken | null): string | undefined {
  const metadata =
    token?.metadata instanceof Map ? Object.fromEntries(token.metadata) : token?.metadata;
  const value = metadata?.credential_set_id;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function getRecordIdentity(token: IToken | null): string | undefined {
  if (!token) {
    return undefined;
  }
  const recordIdentity = token._id ?? token.createdAt?.getTime();
  return getCredentialSetId(token) ?? (recordIdentity != null ? String(recordIdentity) : undefined);
}

export async function getMCPAuthorizationIdentity({
  userId,
  serverName,
  findToken,
}: {
  userId: string;
  serverName: string;
  findToken: TokenMethods['findToken'];
}): Promise<string | null> {
  const identifier = `mcp:${serverName}`;
  try {
    const [access, refresh, client] = await Promise.all([
      findToken({ userId, type: 'mcp_oauth', identifier }),
      findToken({ userId, type: 'mcp_oauth_refresh', identifier: `${identifier}:refresh` }),
      findToken({ userId, type: 'mcp_oauth_client', identifier: `${identifier}:client` }),
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
  now = Date.now(),
): MCPToolCatalogEnvelope {
  return {
    metadata: {
      version: MCP_TOOL_CATALOG_VERSION,
      source: input.serverConfig.source ?? 'unknown',
      revision: getMCPToolCatalogRevision(input.serverConfig),
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
  now = Date.now(),
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
