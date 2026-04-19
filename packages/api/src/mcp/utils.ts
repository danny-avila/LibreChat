import { Constants } from 'librechat-data-provider';
import type { ParsedServerConfig } from '~/mcp/types';

export const mcpToolPattern = new RegExp(`^.+${Constants.mcp_delimiter}.+$`);

/** Checks that `customUserVars` is present AND non-empty (guards against truthy `{}`) */
export function hasCustomUserVars(config: Pick<ParsedServerConfig, 'customUserVars'>): boolean {
  return !!config.customUserVars && Object.keys(config.customUserVars).length > 0;
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
 * URLs are returned as-is: DB-stored configs reject ${VAR} patterns at validation time
 * (MCPServerUserInputSchema), and YAML configs are admin-managed. Env variable resolution
 * is handled at the schema/input boundary, not the output boundary.
 */
export function redactServerSecrets(config: ParsedServerConfig): Partial<ParsedServerConfig> {
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

  return Object.fromEntries(
    Object.entries(safe).filter(([, v]) => v !== undefined),
  ) as Partial<ParsedServerConfig>;
}

/** Applies allowlist-based sanitization to a map of server configs. */
export function redactAllServerSecrets(
  configs: Record<string, ParsedServerConfig>,
): Record<string, Partial<ParsedServerConfig>> {
  const result: Record<string, Partial<ParsedServerConfig>> = {};
  for (const [key, config] of Object.entries(configs)) {
    result[key] = redactServerSecrets(config);
  }
  return result;
}

/**
 * Normalizes a server name to match the pattern ^[a-zA-Z0-9_.-]+$
 * This is required for Azure OpenAI models with Tool Calling
 */
export function normalizeServerName(serverName: string): string {
  // Check if the server name already matches the pattern
  if (/^[a-zA-Z0-9_.-]+$/.test(serverName)) {
    return serverName;
  }

  /** Replace non-matching characters with underscores.
    This preserves the general structure while ensuring compatibility.
    Trims leading/trailing underscores
    */
  const normalized = serverName.replace(/[^a-zA-Z0-9_.-]/g, '_').replace(/^_+|_+$/g, '');

  // If the result is empty (e.g., all characters were non-ASCII and got trimmed),
  // generate a fallback name to ensure we always have a valid function name
  if (!normalized) {
    /** Hash of the original name to ensure uniqueness */
    let hash = 0;
    for (let i = 0; i < serverName.length; i++) {
      hash = (hash << 5) - hash + serverName.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    return `server_${Math.abs(hash)}`;
  }

  return normalized;
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
