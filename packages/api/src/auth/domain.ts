import { lookup } from 'node:dns/promises';

/**
 * @param email
 * @param allowedDomains
 */
export function isEmailDomainAllowed(email: string, allowedDomains?: string[] | null): boolean {
  /** If no domain restrictions are configured, allow all */
  if (!allowedDomains || !Array.isArray(allowedDomains) || !allowedDomains.length) {
    return true;
  }

  /** If restrictions exist, validate email format */
  if (!email) {
    return false;
  }

  const domain = email.split('@')[1]?.toLowerCase();

  if (!domain) {
    return false;
  }

  return allowedDomains.some((allowedDomain) => allowedDomain?.toLowerCase() === domain);
}

/** Checks if IPv4 octets fall within private, reserved, or non-routable ranges */
function isPrivateIPv4(a: number, b: number, c: number): boolean {
  if (a === 0) {
    return true;
  }
  if (a === 10) {
    return true;
  }
  if (a === 127) {
    return true;
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 192 && b === 0 && c === 0) {
    return true;
  }
  if (a === 198 && (b === 18 || b === 19)) {
    return true;
  }
  if (a >= 224) {
    return true;
  }
  return false;
}

/** Checks if a pre-normalized (lowercase, bracket-stripped) IPv6 address falls within fe80::/10 */
function isIPv6LinkLocal(ipv6: string): boolean {
  if (!ipv6.includes(':')) {
    return false;
  }
  const firstHextet = ipv6.split(':', 1)[0];
  if (!firstHextet || !/^[0-9a-f]{1,4}$/.test(firstHextet)) {
    return false;
  }
  const hextet = parseInt(firstHextet, 16);
  // /10 mask (0xffc0) preserves top 10 bits: fe80 = 1111_1110_10xx_xxxx
  return (hextet & 0xffc0) === 0xfe80;
}

/** Checks if an IPv6 address embeds a private IPv4 via 6to4, NAT64, or Teredo */
function hasPrivateEmbeddedIPv4(ipv6: string): boolean {
  if (!ipv6.startsWith('2002:') && !ipv6.startsWith('64:ff9b::') && !ipv6.startsWith('2001::')) {
    return false;
  }
  const segments = ipv6.split(':').filter((s) => s !== '');

  if (ipv6.startsWith('2002:') && segments.length >= 3) {
    const hi = parseInt(segments[1], 16);
    const lo = parseInt(segments[2], 16);
    if (!isNaN(hi) && !isNaN(lo)) {
      return isPrivateIPv4((hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff);
    }
  }

  if (ipv6.startsWith('64:ff9b::')) {
    const lastTwo = segments.slice(-2);
    if (lastTwo.length === 2) {
      const hi = parseInt(lastTwo[0], 16);
      const lo = parseInt(lastTwo[1], 16);
      if (!isNaN(hi) && !isNaN(lo)) {
        return isPrivateIPv4((hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff);
      }
    }
  }

  // RFC 4380: Teredo stores external IPv4 as bitwise complement in last 32 bits
  if (ipv6.startsWith('2001::')) {
    const lastTwo = segments.slice(-2);
    if (lastTwo.length === 2) {
      const hi = parseInt(lastTwo[0], 16);
      const lo = parseInt(lastTwo[1], 16);
      if (!isNaN(hi) && !isNaN(lo)) {
        return isPrivateIPv4((~hi >> 8) & 0xff, ~hi & 0xff, (~lo >> 8) & 0xff);
      }
    }
  }

  return false;
}

/**
 * Checks if an IP address belongs to a private, reserved, or link-local range.
 * Handles IPv4, IPv6, and IPv4-mapped IPv6 addresses (::ffff:A.B.C.D).
 */
export function isPrivateIP(ip: string): boolean {
  const normalized = ip
    .toLowerCase()
    .trim()
    .replace(/^\[|\]$/g, '');

  const mappedMatch = normalized.match(/^::ffff:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (mappedMatch) {
    const [, a, b, c] = mappedMatch.map(Number);
    return isPrivateIPv4(a, b, c);
  }

  const hexMappedMatch = normalized.match(/^(?:::ffff:|::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMappedMatch) {
    const hi = parseInt(hexMappedMatch[1], 16);
    const lo = parseInt(hexMappedMatch[2], 16);
    return isPrivateIPv4((hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff);
  }

  const ipv4Match = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b, c] = ipv4Match.map(Number);
    return isPrivateIPv4(a, b, c);
  }

  if (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fc') || // fc00::/7 — exactly prefixes 'fc' and 'fd'
    normalized.startsWith('fd') ||
    isIPv6LinkLocal(normalized) // fe80::/10 — spans 0xfe80–0xfebf; bitwise check required
  ) {
    return true;
  }

  if (hasPrivateEmbeddedIPv4(normalized)) {
    return true;
  }

  return false;
}

/**
 * Checks if a hostname resolves to a private/reserved IP address.
 * Directly validates literal IPv4 and IPv6 addresses without DNS lookup.
 * For hostnames, resolves via DNS and checks all returned addresses.
 * Fails open on DNS errors (returns false), since the HTTP request would also fail.
 */
export async function resolveHostnameSSRF(hostname: string): Promise<boolean> {
  const normalizedHost = hostname.toLowerCase().trim();

  if (/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(normalizedHost)) {
    return isPrivateIP(normalizedHost);
  }

  const ipv6Check = normalizedHost.replace(/^\[|\]$/g, '');
  if (ipv6Check.includes(':')) {
    return isPrivateIP(ipv6Check);
  }

  try {
    const addresses = await lookup(hostname, { all: true });
    return addresses.some((entry) => isPrivateIP(entry.address));
  } catch {
    return false;
  }
}

/**
 * SSRF Protection: Checks if a hostname/IP is a potentially dangerous internal target.
 * Blocks private IPs, localhost, cloud metadata IPs, and common internal hostnames.
 * @param hostname - The hostname or IP to check
 * @returns true if the target is blocked (SSRF risk), false if safe
 */
export function isSSRFTarget(hostname: string): boolean {
  const normalizedHost = hostname.toLowerCase().trim();

  if (
    normalizedHost === 'localhost' ||
    normalizedHost === 'localhost.localdomain' ||
    normalizedHost.endsWith('.localhost')
  ) {
    return true;
  }

  if (isPrivateIP(normalizedHost)) {
    return true;
  }

  // Block common internal Docker/Kubernetes service names
  const internalHostnames = [
    'rag_api',
    'rag-api',
    'api',
    'redis',
    'mongodb',
    'mongo',
    'postgres',
    'postgresql',
    'mysql',
    'database',
    'db',
    'elasticsearch',
    'kibana',
    'grafana',
    'prometheus',
    'rabbitmq',
    'kafka',
    'zookeeper',
    'consul',
    'vault',
    'etcd',
    'minio',
    'internal',
    'backend',
    'metadata', // Common metadata service name
  ];

  if (internalHostnames.includes(normalizedHost)) {
    return true;
  }

  // Block .internal and .local TLDs (common in internal networks)
  if (normalizedHost.endsWith('.internal') || normalizedHost.endsWith('.local')) {
    return true;
  }

  return false;
}

/** Supported protocols for domain validation (HTTP, HTTPS, WebSocket) */
type SupportedProtocol = 'http:' | 'https:' | 'ws:' | 'wss:';

/**
 * Parsed domain specification including protocol and port constraints.
 */
interface ParsedDomainSpec {
  hostname: string;
  protocol: SupportedProtocol | null; // null means any protocol allowed
  port: string | null; // null means any port allowed
  explicitPort: boolean; // true if port was explicitly specified in original string
  isWildcard: boolean;
}

/** Checks if a string starts with a recognized protocol prefix */
function hasRecognizedProtocol(domain: string): boolean {
  return (
    domain.startsWith('http://') ||
    domain.startsWith('https://') ||
    domain.startsWith('ws://') ||
    domain.startsWith('wss://')
  );
}

/**
 * Parses a domain specification into its components.
 * Supports formats:
 *   - `example.com` (any protocol, any port)
 *   - `https://example.com` (https only, any port)
 *   - `https://example.com:443` (https only, port 443)
 *   - `wss://ws.example.com` (secure WebSocket only)
 *   - `*.example.com` (wildcard subdomain)
 * @param domain - Domain specification string
 * @returns ParsedDomainSpec or null if invalid
 */
function parseDomainSpec(domain: string): ParsedDomainSpec | null {
  try {
    let normalizedDomain = domain.toLowerCase().trim();

    // Early return for obviously invalid formats (protocol-only strings)
    const emptyProtocols = ['http://', 'https://', 'ws://', 'wss://'];
    if (emptyProtocols.includes(normalizedDomain)) {
      return null;
    }

    // Check for wildcard prefix before parsing
    const isWildcard = normalizedDomain.startsWith('*.');

    // Check if it has a recognized protocol (http, https, ws, wss)
    const hasProtocol = hasRecognizedProtocol(normalizedDomain);

    // Check if port was explicitly specified (e.g., :443, :8080)
    // Need to check before URL parsing because URL normalizes default ports
    const portMatch = normalizedDomain.match(/:(\d+)(\/|$|\?)/);
    const explicitPort = portMatch !== null;
    const explicitPortValue = portMatch ? portMatch[1] : null;

    // If no protocol, add one temporarily for URL parsing
    if (!hasProtocol) {
      normalizedDomain = `https://${normalizedDomain}`;
    }

    const url = new URL(normalizedDomain);

    // Additional validation that hostname isn't just protocol
    if (!url.hostname || emptyProtocols.some((p) => url.hostname === p.replace('://', ''))) {
      return null;
    }

    const hostname = url.hostname.replace(/^www\./i, '');

    return {
      hostname,
      protocol: hasProtocol ? (url.protocol as SupportedProtocol) : null,
      // Use the explicitly specified port, or null if no port was specified
      port: explicitPort ? explicitPortValue : null,
      explicitPort,
      isWildcard,
    };
  } catch {
    return null;
  }
}

/**
 * Checks if hostname matches an allowed pattern (supports wildcards).
 */
function hostnameMatches(inputHostname: string, allowedSpec: ParsedDomainSpec): boolean {
  if (allowedSpec.isWildcard) {
    // Extract base domain from wildcard (e.g., "*.example.com" -> "example.com")
    const baseDomain = allowedSpec.hostname.replace(/^\*\./, '');
    return inputHostname === baseDomain || inputHostname.endsWith(`.${baseDomain}`);
  }
  return inputHostname === allowedSpec.hostname;
}

/** Protocol sets for different use cases */
const HTTP_PROTOCOLS: SupportedProtocol[] = ['http:', 'https:'];
const MCP_PROTOCOLS: SupportedProtocol[] = ['http:', 'https:', 'ws:', 'wss:'];

/**
 * Core domain validation logic with configurable protocol support.
 * SECURITY: When no allowedDomains is configured, blocks SSRF-prone targets.
 * @param domain - The domain to check (can include protocol/port)
 * @param allowedDomains - List of allowed domain patterns
 * @param supportedProtocols - Protocols to accept (others are rejected)
 */
async function isDomainAllowedCore(
  domain: string,
  allowedDomains: string[] | null | undefined,
  supportedProtocols: SupportedProtocol[],
): Promise<boolean> {
  const inputSpec = parseDomainSpec(domain);
  if (!inputSpec) {
    return false;
  }

  // SECURITY: Reject unsupported protocols (e.g., WebSocket for OpenAPI Actions)
  if (inputSpec.protocol !== null && !supportedProtocols.includes(inputSpec.protocol)) {
    return false;
  }

  /** If no domain restrictions configured, block SSRF targets but allow all else */
  if (!Array.isArray(allowedDomains) || !allowedDomains.length) {
    /** SECURITY: Block SSRF-prone targets when no allowlist is configured */
    if (isSSRFTarget(inputSpec.hostname)) {
      return false;
    }
    /** SECURITY: Resolve hostname and block if it points to a private/reserved IP */
    if (await resolveHostnameSSRF(inputSpec.hostname)) {
      return false;
    }
    return true;
  }

  /** When allowedDomains is configured, check against the list with protocol/port matching */
  for (const allowedDomain of allowedDomains) {
    const allowedSpec = parseDomainSpec(allowedDomain);
    if (!allowedSpec) {
      continue;
    }

    // Skip allowedDomains with unsupported protocols for this context
    if (allowedSpec.protocol !== null && !supportedProtocols.includes(allowedSpec.protocol)) {
      continue;
    }

    // Check hostname match (with wildcard support)
    if (!hostnameMatches(inputSpec.hostname, allowedSpec)) {
      continue;
    }

    // If allowedSpec has protocol restriction, input must match
    if (allowedSpec.protocol !== null) {
      // Input must have protocol specified to match a protocol-restricted rule
      if (inputSpec.protocol === null || inputSpec.protocol !== allowedSpec.protocol) {
        continue;
      }
    }

    // If allowedSpec has explicit port restriction, input must have matching explicit port
    if (allowedSpec.explicitPort) {
      // Input must also have an explicit port that matches
      if (!inputSpec.explicitPort || inputSpec.port !== allowedSpec.port) {
        continue;
      }
    }

    // All specified constraints matched
    return true;
  }

  return false;
}

/**
 * Validates domain for OpenAPI Agent Actions (HTTP/HTTPS only).
 * SECURITY: WebSocket protocols are NOT allowed per OpenAPI specification.
 * @param domain - The domain to check (can include protocol/port)
 * @param allowedDomains - List of allowed domain patterns
 */
export async function isActionDomainAllowed(
  domain?: string | null,
  allowedDomains?: string[] | null,
): Promise<boolean> {
  if (!domain || typeof domain !== 'string') {
    return false;
  }
  return isDomainAllowedCore(domain, allowedDomains, HTTP_PROTOCOLS);
}

/**
 * Extracts full domain spec (protocol://hostname:port) from MCP server config URL.
 * Returns the full origin for proper protocol/port matching against allowedDomains.
 * @returns The full origin string, or null when:
 *   - No `url` property, non-string, or empty (stdio transport — always allowed upstream)
 *   - URL string present but cannot be parsed (rejected fail-closed upstream when allowlist active)
 *   Callers must distinguish these two null cases; see {@link isMCPDomainAllowed}.
 * @param config - MCP server configuration (accepts any config with optional url field)
 */
export function extractMCPServerDomain(config: Record<string, unknown>): string | null {
  const url = config.url;
  // Stdio transports don't have URLs - always allowed
  if (!url || typeof url !== 'string') {
    return null;
  }

  try {
    const parsedUrl = new URL(url);
    // Return full origin (protocol://hostname:port) for proper domain validation
    // This allows admins to restrict by protocol/port in allowedDomains
    return parsedUrl.origin;
  } catch {
    return null;
  }
}

/**
 * Validates MCP server domain against allowedDomains.
 * Supports HTTP, HTTPS, WS, and WSS protocols (per MCP specification).
 * Stdio transports (no URL) are always allowed.
 * Configs with a non-empty URL that cannot be parsed are rejected fail-closed when an
 * allowlist is active, preventing template placeholders (e.g. `{{HOST}}`) from bypassing
 * domain validation after `processMCPEnv` resolves them at connection time.
 * When no allowlist is configured, unparseable URLs fall through to connection-level
 * SSRF protection (`createSSRFSafeUndiciConnect`).
 * @param config - MCP server configuration with optional url field
 * @param allowedDomains - List of allowed domains (with wildcard support)
 */
export async function isMCPDomainAllowed(
  config: Record<string, unknown>,
  allowedDomains?: string[] | null,
): Promise<boolean> {
  const domain = extractMCPServerDomain(config);
  const hasAllowlist = Array.isArray(allowedDomains) && allowedDomains.length > 0;

  const hasExplicitUrl =
    Object.prototype.hasOwnProperty.call(config, 'url') &&
    typeof config.url === 'string' &&
    config.url.trim().length > 0;

  if (!domain && hasExplicitUrl && hasAllowlist) {
    return false;
  }

  // Stdio transports (no URL) are always allowed
  if (!domain) {
    return true;
  }

  // Use MCP_PROTOCOLS (HTTP/HTTPS/WS/WSS) for MCP server validation
  return isDomainAllowedCore(domain, allowedDomains, MCP_PROTOCOLS);
}

/**
 * Checks whether an OAuth URL matches any entry in the MCP allowedDomains list,
 * honoring protocol and port constraints when specified by the admin.
 *
 * Mirrors the allowlist-matching logic of {@link isDomainAllowedCore} (hostname,
 * protocol, and explicit-port checks) but is synchronous — no DNS resolution is
 * needed because the caller is deciding whether to *skip* the subsequent
 * SSRF/DNS checks, not replace them.
 *
 * @remarks `parseDomainSpec` normalizes `www.` prefixes, so both the input URL
 * and allowedDomains entries starting with `www.` are matched without that prefix.
 */
export function isOAuthUrlAllowed(url: string, allowedDomains?: string[] | null): boolean {
  if (!Array.isArray(allowedDomains) || allowedDomains.length === 0) {
    return false;
  }

  const inputSpec = parseDomainSpec(url);
  if (!inputSpec) {
    return false;
  }

  for (const allowedDomain of allowedDomains) {
    const allowedSpec = parseDomainSpec(allowedDomain);
    if (!allowedSpec) {
      continue;
    }
    if (!hostnameMatches(inputSpec.hostname, allowedSpec)) {
      continue;
    }
    if (allowedSpec.protocol !== null) {
      if (inputSpec.protocol === null || inputSpec.protocol !== allowedSpec.protocol) {
        continue;
      }
    }
    if (allowedSpec.explicitPort) {
      if (!inputSpec.explicitPort || inputSpec.port !== allowedSpec.port) {
        continue;
      }
    }
    return true;
  }

  return false;
}

/** Matches ErrorTypes.INVALID_BASE_URL — string literal avoids build-time dependency on data-provider */
const INVALID_BASE_URL_TYPE = 'invalid_base_url';

function throwInvalidBaseURL(message: string): never {
  throw new Error(JSON.stringify({ type: INVALID_BASE_URL_TYPE, message }));
}

/**
 * Validates that a user-provided endpoint URL does not target private/internal addresses.
 * Throws if the URL is unparseable, uses a non-HTTP(S) scheme, targets a known SSRF hostname,
 * or DNS-resolves to a private IP.
 *
 * @note DNS rebinding: validation performs a single DNS lookup. An adversary controlling
 *   DNS with TTL=0 could respond with a public IP at validation time and a private IP
 *   at request time. This is an accepted limitation of point-in-time DNS checks.
 * @note Fail-open on DNS errors: a resolution failure here implies a failure at request
 *   time as well, matching {@link resolveHostnameSSRF} semantics.
 */
export async function validateEndpointURL(url: string, endpoint: string): Promise<void> {
  let hostname: string;
  let protocol: string;
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname;
    protocol = parsed.protocol;
  } catch {
    throwInvalidBaseURL(`Invalid base URL for ${endpoint}: unable to parse URL.`);
  }

  if (protocol !== 'http:' && protocol !== 'https:') {
    throwInvalidBaseURL(`Invalid base URL for ${endpoint}: only HTTP and HTTPS are permitted.`);
  }

  if (isSSRFTarget(hostname)) {
    throwInvalidBaseURL(`Base URL for ${endpoint} targets a restricted address.`);
  }

  if (await resolveHostnameSSRF(hostname)) {
    throwInvalidBaseURL(`Base URL for ${endpoint} resolves to a restricted address.`);
  }
}
