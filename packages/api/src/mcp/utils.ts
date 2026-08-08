import {
  Constants,
  MCPOptionsSchema,
  normalizeServerName,
  normalizeMCPToolKey,
  buildServerNameAliases,
} from 'librechat-data-provider';
import type { AgentToolOptions } from 'librechat-data-provider';
import type { ParsedServerConfig } from '~/mcp/types';
import type { RequestBody } from '~/types';

export const mcpToolPattern: RegExp = new RegExp(`^.+${Constants.mcp_delimiter}.+$`);

function isMCPServerConfig(config: unknown): config is ParsedServerConfig {
  return MCPOptionsSchema.safeParse(config).success;
}

/** Validates an effective MCP config without stripping its server-managed metadata. */
export function validateMCPServerConfig(config: unknown): ParsedServerConfig {
  if (!isMCPServerConfig(config)) {
    throw new Error('Invalid effective MCP server configuration');
  }
  return config;
}

/**
 * Prefix of the lazily-expanded MCP placeholder `mcp_all<delim><server>`,
 * pushed into an agent's `tools` for overlay/user-connection servers whose
 * tool names are not known until the definitions loader expands them.
 *
 * The name is reserved by that convention: the definitions loader treats ANY
 * matching entry as "expand every tool on this server", so a remote tool
 * literally named `mcp_all` cannot be addressed individually anywhere in the
 * pipeline. Kept here as the one definition of the prefix.
 */
export const MCP_ALL_PLACEHOLDER_PREFIX: string = `${Constants.mcp_all}${Constants.mcp_delimiter}`;

/** Whether a tool entry is the lazily-expanded `mcp_all` placeholder. */
export function isMCPAllPlaceholder(toolName: string): boolean {
  return toolName.startsWith(MCP_ALL_PLACEHOLDER_PREFIX);
}

/** Server-pin token (`sys__server__sys<delim><server>`) that keeps a server
 *  attached to an agent independent of its tool selection. */
const MCP_SERVER_TOKEN_PREFIX: string = `${Constants.mcp_server}${Constants.mcp_delimiter}`;

/**
 * Later-configured server names whose normalized form is already claimed by an
 * earlier different name. Such a pair produces IDENTICAL model-facing tool
 * keys, so tool selection and execution cannot tell the servers apart —
 * `buildServerNameAliases` deterministically routes to the first name, and
 * the shadowed later server must be EXCLUDED from tool exposure entirely:
 * offering its tools would let a user select a tool that silently executes
 * against the first server's configuration.
 */
/**
 * Whether a resolved server name is normalization-sensitive — its own name
 * needs normalizing, or it EQUALS the normalized form of some configured
 * special-character name. Under an incomplete collision audit these are the
 * references whose routing cannot be proven unambiguous, so they fail closed.
 */
export function isNormalizationSensitiveName(
  serverName: string,
  rawServerNames: readonly string[],
): boolean {
  if (normalizeServerName(serverName) !== serverName) {
    return true;
  }
  return rawServerNames.some(
    (raw) => raw !== serverName && normalizeServerName(raw) === serverName,
  );
}

export function findShadowedServerNames(rawServerNames: readonly string[]): Set<string> {
  /** Derived from `buildServerNameAliases` so shadow detection can never
   *  diverge from the tie-break routing actually uses (identity entries
   *  first, then configuration order). */
  const aliases = buildServerNameAliases(rawServerNames);
  const shadowed = new Set<string>();
  for (const raw of rawServerNames) {
    if (raw && aliases.get(normalizeServerName(raw)) !== raw) {
      shadowed.add(raw);
    }
  }
  return shadowed;
}

/**
 * Heals legacy persisted agent data whose MCP tool keys embed a RAW server
 * name: model-facing keys carry `normalizeServerName(server)` (matching cache
 * keys, definition names, and runtime instance names), so an agent document
 * saved before that convention — or through the old raw-keyed cache — would
 * neither load its tools nor have its `tool_options` (defer / programmatic /
 * background / intent) honored for a server whose name needs normalizing.
 *
 * Placeholder and server-pin tokens are left untouched: they are
 * config-identity references consumed against raw config names (the client's
 * selectors, the definitions loader's expansion), never model-facing names.
 * Returns the same references when nothing needs rewriting, so the common
 * path (every server name already normalized) allocates nothing.
 */
export function normalizeAgentToolKeys(params: {
  tools: string[] | undefined;
  toolOptions: AgentToolOptions | undefined;
  rawServerNames: readonly string[];
}): { tools: string[] | undefined; toolOptions: AgentToolOptions | undefined } {
  const { tools, toolOptions, rawServerNames } = params;
  /**
   * A SHADOWED server (its normalized form claimed by an earlier different
   * name) must NOT be healed: rewriting its raw key would produce the first
   * server's key exactly, silently executing the wrong server's action. Left
   * raw, the key fails to match the (normalized-keyed) tool map and the tool
   * errors visibly — broken beats misrouted.
   */
  const shadowed = findShadowedServerNames(rawServerNames);
  const rewritableNames = rawServerNames.filter(
    (name) => normalizeServerName(name) !== name && !shadowed.has(name),
  );
  if (rewritableNames.length === 0) {
    return { tools, toolOptions };
  }

  const rewriteKey = (key: string): string => {
    if (
      !key.includes(Constants.mcp_delimiter) ||
      isMCPAllPlaceholder(key) ||
      key.startsWith(MCP_SERVER_TOKEN_PREFIX)
    ) {
      return key;
    }
    return normalizeMCPToolKey(key, rewritableNames);
  };

  let toolsChanged = false;
  let nextTools = tools?.map((key) => {
    const rewritten = rewriteKey(key);
    if (rewritten !== key) {
      toolsChanged = true;
    }
    return rewritten;
  });
  /** A document carrying BOTH spellings converges on one key after healing —
   *  collapse duplicates (order-preserving) so the loaders never build two
   *  instances with the same function name. */
  if (toolsChanged && nextTools) {
    const seen = new Set<string>();
    nextTools = nextTools.filter((key) => {
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  let optionsChanged = false;
  let nextOptions: AgentToolOptions | undefined;
  if (toolOptions) {
    nextOptions = {};
    for (const [key, options] of Object.entries(toolOptions)) {
      const rewritten = rewriteKey(key);
      if (rewritten !== key) {
        optionsChanged = true;
      }
      /** When both spellings carry options, the CURRENT (normalized) entry
       *  wins regardless of object insertion order — a legacy entry must not
       *  clobber settings a client already wrote under the new spelling. */
      nextOptions[rewritten] =
        rewritten !== key
          ? { ...options, ...nextOptions[rewritten] }
          : { ...nextOptions[key], ...options };
    }
  }

  return {
    tools: toolsChanged ? nextTools : tools,
    toolOptions: optionsChanged ? nextOptions : toolOptions,
  };
}

const RUNTIME_CONTEXT_PLACEHOLDER_PATTERN = /\{\{LIBRECHAT_(?:USER|OPENID|GRAPH|BODY)_[^}]+\}\}/;
const RUNTIME_BODY_PLACEHOLDER_PATTERN = /\{\{LIBRECHAT_BODY_[^}]+\}\}/;
const RUNTIME_BODY_PLACEHOLDER_CAPTURE_PATTERN = /\{\{LIBRECHAT_BODY_([^}]+)\}\}/g;

const BODY_PLACEHOLDER_FIELDS: Record<string, keyof RequestBody> = {
  CONVERSATIONID: 'conversationId',
  PARENTMESSAGEID: 'parentMessageId',
  MESSAGEID: 'messageId',
};

type PlaceholderValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly PlaceholderValue[]
  | { readonly [key: string]: PlaceholderValue };

type UserScopedConnectionConfig = Pick<
  ParsedServerConfig,
  'requiresOAuth' | 'source' | 'dbId' | 'startup'
> & {
  args?: string[];
  /** Loosened from the parsed shapes so raw (pre-inspection) configs qualify;
   *  scoping predicates only check key presence */
  obo?: { scopes?: string } | null;
  customUserVars?: Record<
    string,
    { description?: string; title?: string; sensitive?: boolean } | undefined
  >;
  env?: Record<string, string | undefined>;
  headers?: Record<string, string | undefined>;
  oauth?: PlaceholderValue;
  oauth_headers?: Record<string, string | undefined>;
  url?: string;
};

function placeholderBearingFields(config: UserScopedConnectionConfig): PlaceholderValue[] {
  return [config.args, config.env, config.headers, config.oauth, config.oauth_headers, config.url];
}

/** Whether a server should use MCP OAuth handling. */
export function isOAuthServer(
  config: Pick<ParsedServerConfig, 'requiresOAuth' | 'oauth'>,
): boolean {
  if (config.requiresOAuth === false) {
    return false;
  }
  return config.requiresOAuth === true || config.oauth != null;
}

/**
 * Whether a server needs the OAuth-style connection wiring (flow manager,
 * token methods, OBO/OAuth resolvers). Distinct from `isOAuthServer`: OBO
 * servers reuse the same wiring even though they don't run an OAuth handshake,
 * because the runtime needs `oboTokenResolver`/`oboTrustChecker` plumbed through.
 *
 * Without this, an OBO server with `requiresOAuth: false` would land in the
 * non-OAuth branch of MCPManager.discoverServerTools / UserConnectionManager,
 * which omits the OBO resolver — `usesObo` then evaluates to false in the
 * factory and the connection sends a bare request that the upstream rejects.
 */
export function requiresOAuthMachinery(
  config: Pick<ParsedServerConfig, 'requiresOAuth' | 'oauth' | 'obo'>,
): boolean {
  return isOAuthServer(config) || config.obo != null;
}

/** Checks that `customUserVars` is present AND non-empty (guards against truthy `{}`) */
export function hasCustomUserVars(
  config: Pick<UserScopedConnectionConfig, 'customUserVars'>,
): boolean {
  return !!config.customUserVars && Object.keys(config.customUserVars).length > 0;
}

function hasRuntimeContextPlaceholder(value: PlaceholderValue): boolean {
  return hasPlaceholder(value, RUNTIME_CONTEXT_PLACEHOLDER_PATTERN);
}

function hasPlaceholder(value: PlaceholderValue, pattern: RegExp): boolean {
  if (typeof value === 'string') {
    return pattern.test(value);
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasPlaceholder(item, pattern));
  }

  if (value == null || typeof value !== 'object') {
    return false;
  }

  return Object.values(value).some((item) => hasPlaceholder(item, pattern));
}

function addRuntimeBodyPlaceholderFields(value: PlaceholderValue, fields: Set<string>): void {
  if (typeof value === 'string') {
    for (const match of value.matchAll(RUNTIME_BODY_PLACEHOLDER_CAPTURE_PATTERN)) {
      const placeholderKey = match[1];
      if (placeholderKey) {
        fields.add(BODY_PLACEHOLDER_FIELDS[placeholderKey] ?? placeholderKey);
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      addRuntimeBodyPlaceholderFields(item, fields);
    }
    return;
  }

  if (value == null || typeof value !== 'object') {
    return;
  }

  for (const item of Object.values(value)) {
    addRuntimeBodyPlaceholderFields(item, fields);
  }
}

/**
 * Trusted YAML/config servers may use per-user/request placeholders that can
 * only be resolved once a real request context exists. User-sourced DB servers
 * deliberately stay sandboxed and only resolve customUserVars.
 */
export function hasRuntimeContextPlaceholders(config: UserScopedConnectionConfig): boolean {
  if (isUserSourced(config)) {
    return false;
  }

  return placeholderBearingFields(config).some(hasRuntimeContextPlaceholder);
}

export function hasRuntimeUrlPlaceholders(config: UserScopedConnectionConfig): boolean {
  if (isUserSourced(config)) {
    return false;
  }

  return hasRuntimeContextPlaceholder(config.url);
}

export function hasRuntimeBodyPlaceholders(config: UserScopedConnectionConfig): boolean {
  if (isUserSourced(config)) {
    return false;
  }

  return placeholderBearingFields(config).some((value) =>
    hasPlaceholder(value, RUNTIME_BODY_PLACEHOLDER_PATTERN),
  );
}

export function getRuntimeBodyPlaceholderFields(config: UserScopedConnectionConfig): string[] {
  if (isUserSourced(config)) {
    return [];
  }

  const fields = new Set<string>();
  for (const value of placeholderBearingFields(config)) {
    addRuntimeBodyPlaceholderFields(value, fields);
  }
  return Array.from(fields);
}

export function getMissingRuntimeBodyPlaceholderFields(
  config: UserScopedConnectionConfig,
  requestBody?: RequestBody,
): string[] {
  return getRuntimeBodyPlaceholderFields(config).filter((field) => {
    const value = requestBody?.[field as keyof RequestBody];
    return value == null || (typeof value === 'string' && value.trim() === '');
  });
}

/**
 * `BODY` placeholders vary by chat request, so the normal userId:serverName
 * cache would reuse a connection built with stale request context.
 *
 * Ephemeral connections are created and torn down per tool call — configs using
 * these placeholders pay a full connect + initialize on every invocation.
 *
 * User/OpenID/Graph placeholders still require user-scoped connections, but they
 * are not request-scoped by themselves. HTTP transports refresh resolved headers
 * before each tool call, so token/user headers can remain on the cached user
 * connection without forcing a reconnect for every invocation.
 */
export function requiresEphemeralUserConnection(config: UserScopedConnectionConfig): boolean {
  if (isUserSourced(config)) {
    return false;
  }

  return placeholderBearingFields(config).some((value) =>
    hasPlaceholder(value, RUNTIME_BODY_PLACEHOLDER_PATTERN),
  );
}

/**
 * Returns true when a server requires a per-user connection instead of an
 * app-shared connection.
 */
export function requiresUserScopedConnection(config: UserScopedConnectionConfig): boolean {
  return (
    config.requiresOAuth === true ||
    config.obo != null ||
    hasCustomUserVars(config) ||
    hasRuntimeContextPlaceholders(config)
  );
}

/** Whether a server can share one operator-owned connection across all users. */
export function canUseAppConnection(config: UserScopedConnectionConfig): boolean {
  return (
    config.startup !== false && !isUserSourced(config) && !requiresUserScopedConnection(config)
  );
}

/**
 * Returns the names of `customUserVars` declared on the server config for which
 * the user has not supplied a non-blank value (unset, empty, or whitespace-only
 * values count as missing, since they still fail auth). An empty array means
 * every declared variable is satisfied (or the server declares none).
 *
 * Used to gate tool exposure: a server that requires user-provided credentials
 * should not surface its tools to the model until those values are set,
 * otherwise every tool call fails authentication. See issue #10969.
 */
export function getMissingCustomUserVars(
  config: Pick<ParsedServerConfig, 'customUserVars'>,
  providedVars?: Record<string, string> | null,
): string[] {
  if (!hasCustomUserVars(config)) {
    return [];
  }
  return Object.keys(config.customUserVars ?? {}).filter((key) => {
    const value = providedVars?.[key];
    return value == null || (typeof value === 'string' && value.trim() === '');
  });
}

/**
 * Determines whether a server config is user-sourced (sandboxed placeholder resolution).
 * When `source` is set, it is authoritative. When absent (pre-upgrade cached configs),
 * falls back to the legacy `dbId` heuristic for backward compatibility.
 */
export function isUserSourced(config: Pick<ParsedServerConfig, 'source' | 'dbId'>): boolean {
  return config.source != null ? config.source === 'user' : !!config.dbId;
}

/**
 * Allowlist-based sanitization for API responses. Only explicitly listed fields are included;
 * new fields added to ParsedServerConfig are excluded by default until allowlisted here.
 *
 * `url` and the oauth flow URLs (`authorization_url`, `token_url`, `revocation_endpoint`) can
 * encode internal infrastructure, so they are stripped unless `canEdit` is set: the same
 * disclosure threshold the PATCH route enforces. Callers derive `canEdit` per server (operator
 * YAML/config-tier servers from the MANAGE_MCP_SERVERS capability, user-sourced servers from
 * per-resource ACL EDIT), so a user-sourced config shared view-only does not disclose its URL
 * to the viewer.
 * DB-stored configs reject ${VAR} patterns at validation time (MCPServerUserInputSchema);
 * env variable resolution is handled at the schema/input boundary.
 */
export function redactServerSecrets(
  config: ParsedServerConfig,
  options?: { canEdit?: boolean },
): Partial<ParsedServerConfig> {
  const safe: Partial<ParsedServerConfig> = {
    type: config.type,
    url: config.url,
    title: config.title,
    description: config.description,
    iconPath: config.iconPath,
    chatMenu: config.chatMenu,
    requiresOAuth: config.requiresOAuth,
    capabilities: config.capabilities,
    tools: config.tools,
    toolFunctions: config.toolFunctions,
    initDuration: config.initDuration,
    updatedAt: config.updatedAt,
    dbId: config.dbId,
    /** Trust tier (yaml/config/user) — safe to expose; used by the UI for display purposes. */
    source: config.source,
    consumeOnly: config.consumeOnly,
    inspectionFailed: config.inspectionFailed,
    customUserVars: config.customUserVars,
    serverInstructions: config.serverInstructions,
  };

  if (config.apiKey) {
    safe.apiKey = {
      source: config.apiKey.source,
      authorization_type: config.apiKey.authorization_type,
      ...(config.apiKey.custom_header && { custom_header: config.apiKey.custom_header }),
    };
  }

  if (config.oauth) {
    const { client_secret: _secret, ...safeOAuth } = config.oauth;
    safe.oauth = safeOAuth;
  }

  if (config.obo) {
    safe.obo = config.obo;
  }

  if (!options?.canEdit) {
    delete safe.url;
    if (safe.oauth) {
      const {
        authorization_url: _au,
        token_url: _tu,
        revocation_endpoint: _re,
        ...restOAuth
      } = safe.oauth;
      safe.oauth = restOAuth;
    }
  }

  return Object.fromEntries(
    Object.entries(safe).filter(([, v]) => v !== undefined),
  ) as Partial<ParsedServerConfig>;
}

/** Applies allowlist-based sanitization to a map of server configs. */
export function redactAllServerSecrets(
  configs: Record<string, ParsedServerConfig>,
  options?: { canEditByServer?: ReadonlyMap<string, boolean> },
): Record<string, Partial<ParsedServerConfig>> {
  const result: Record<string, Partial<ParsedServerConfig>> = {};
  for (const [key, config] of Object.entries(configs)) {
    const canEdit = options?.canEditByServer?.get(key) ?? false;
    result[key] = redactServerSecrets(config, { canEdit });
  }
  return result;
}

/**
 * Builds the synthetic tool-call name used during MCP OAuth flows.
 * Format: `oauth<mcp_delimiter><normalizedServerName>`
 *
 * Guards against the caller passing a pre-wrapped name (one that already
 * starts with the oauth prefix in its original, un-normalized form) to
 * prevent double-wrapping.
 */
export function buildOAuthToolCallName(serverName: string): string {
  const oauthPrefix = `oauth${Constants.mcp_delimiter}`;
  if (serverName.startsWith(oauthPrefix)) {
    return normalizeServerName(serverName);
  }
  return `${oauthPrefix}${normalizeServerName(serverName)}`;
}

const INVALID_CLIENT_PATTERNS = [
  'invalid_client',
  'client_id mismatch',
  'client not found',
  'unknown client',
] as const;

/** Checks whether a message indicates the stored client registration is invalid/stale. */
export function isInvalidClientMessage(message: string): boolean {
  const msg = message.toLowerCase();
  return INVALID_CLIENT_PATTERNS.some((p) => msg.includes(p));
}

/**
 * Checks whether a message indicates the OAuth client registration was rejected.
 * Superset of `isInvalidClientMessage`: also matches `unauthorized_client`
 * (grant-type refusal), which has different recovery semantics.
 */
export function isClientRejectionMessage(message: string): boolean {
  return isInvalidClientMessage(message) || message.toLowerCase().includes('unauthorized_client');
}

/**
 * Sanitizes a URL by removing query parameters to prevent credential leakage in logs.
 * @param url - The URL to sanitize (string or URL object)
 * @returns The sanitized URL string without query parameters
 */
export function sanitizeUrlForLogging(url: string | URL): string {
  try {
    const urlObj = typeof url === 'string' ? new URL(url) : url;
    return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
  } catch {
    return '[invalid URL]';
  }
}

/**
 * Escapes special regex characters in a string so they are treated literally.
 * @param str - The string to escape
 * @returns The escaped string safe for use in a regex pattern
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generates a URL-friendly server name from a title.
 * Converts to lowercase, replaces spaces with hyphens, removes special characters.
 * @param title - The display title to convert
 * @returns A slug suitable for use as serverName (e.g., "GitHub MCP Tool" → "github-mcp-tool")
 */
export function generateServerNameFromTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Remove consecutive hyphens
    .replace(/^-|-$/g, ''); // Trim leading/trailing hyphens

  return slug || 'mcp-server'; // Fallback if empty
}

export {
  splitMCPToolKey,
  normalizeServerName,
  normalizeMCPToolKey,
  buildServerNameAliases,
} from 'librechat-data-provider';
