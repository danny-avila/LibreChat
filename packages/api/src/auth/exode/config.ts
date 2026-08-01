const DEFAULT_EMBED_JWT_TTL_MS = 5 * 60 * 1000;
const MIN_EMBED_JWT_TTL_MS = 60 * 1000;
const MAX_EMBED_JWT_TTL_MS = 15 * 60 * 1000;

export const EXODE_BRIDGE_PROTOCOL = 1 as const;
export const EXODE_MCP_AUTH_FIELD = 'EXODE_AI_TOKEN';

export interface ExodeAuthConfig {
  mainUrl: string;
  serviceId: string;
  serviceSecret: string;
  issuer: string;
  allowedOrigins: string[];
  embedJwtTtlMs: number;
  mcpServerName: string;
}

export interface ExodeEmbedConfig {
  enabled: boolean;
  protocol: typeof EXODE_BRIDGE_PROTOCOL;
  allowedOrigins: string[];
}

function normalizeOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Exode embed origins must use HTTP or HTTPS');
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Exode embed origins must contain only scheme, host, and port');
  }
  return url.origin;
}

function readAllowedOrigins(): string[] {
  const configured = process.env.EXODE_EMBED_ORIGINS?.split(',') ?? [];
  const origins = configured
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map(normalizeOrigin);
  return [...new Set(origins)];
}

function readTtl(): number {
  const configured = Number(process.env.EXODE_EMBED_JWT_TTL_MS ?? DEFAULT_EMBED_JWT_TTL_MS);
  if (!Number.isInteger(configured)) {
    throw new Error('EXODE_EMBED_JWT_TTL_MS must be an integer');
  }
  if (configured < MIN_EMBED_JWT_TTL_MS || configured > MAX_EMBED_JWT_TTL_MS) {
    throw new Error('EXODE_EMBED_JWT_TTL_MS must be between 60000 and 900000');
  }
  return configured;
}

function requireValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required when Exode embed authentication is enabled`);
  }
  return value;
}

export function getExodeEmbedConfig(): ExodeEmbedConfig {
  const allowedOrigins = readAllowedOrigins();
  const enabled =
    allowedOrigins.length > 0 &&
    Boolean(process.env.EXODE_MAIN_URL?.trim()) &&
    Boolean(process.env.EXODE_MAIN_SERVICE_ID?.trim()) &&
    Boolean(process.env.EXODE_MAIN_SERVICE_SECRET?.trim()) &&
    Boolean(process.env.EXODE_MAIN_ISSUER?.trim());

  return {
    enabled,
    protocol: EXODE_BRIDGE_PROTOCOL,
    allowedOrigins,
  };
}

export function getExodeAuthConfig(): ExodeAuthConfig {
  const mainUrl = new URL(requireValue('EXODE_MAIN_URL'));
  if (mainUrl.protocol !== 'https:' && mainUrl.protocol !== 'http:') {
    throw new Error('EXODE_MAIN_URL must use HTTP or HTTPS');
  }

  const allowedOrigins = readAllowedOrigins();
  if (allowedOrigins.length === 0) {
    throw new Error('EXODE_EMBED_ORIGINS must contain at least one origin');
  }

  return {
    mainUrl: mainUrl.toString(),
    serviceId: requireValue('EXODE_MAIN_SERVICE_ID'),
    serviceSecret: requireValue('EXODE_MAIN_SERVICE_SECRET'),
    issuer: requireValue('EXODE_MAIN_ISSUER'),
    allowedOrigins,
    embedJwtTtlMs: readTtl(),
    mcpServerName: process.env.EXODE_MCP_SERVER_NAME?.trim() || 'exode',
  };
}

export function getExodeFrameAncestors(): string {
  const { allowedOrigins } = getExodeEmbedConfig();
  return allowedOrigins.length > 0 ? allowedOrigins.join(' ') : "'none'";
}

/**
 * Whether this request should be served with the embed CSP.
 *
 * `embedQuery` is widened to Express's real type: a repeated parameter (`?embed=exode&embed=x`)
 * arrives as an array, and a strict `=== 'exode'` on it is false — which dropped the
 * `frame-ancestors` header while the client, reading the same URL with
 * `URLSearchParams.get('embed')`, still saw `'exode'` and activated the bridge. That is the wrong
 * way round to fail, so any occurrence of `exode` counts here: the check errs towards *setting*
 * the restriction.
 */
export function isExodeEmbedRequest(path: string, embedQuery?: unknown): boolean {
  if (path === '/embed/exode') {
    return true;
  }

  if (Array.isArray(embedQuery)) {
    return embedQuery.some((value) => value === 'exode');
  }

  return embedQuery === 'exode';
}
