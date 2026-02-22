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

/** Checks if IPv4 octets fall within private, reserved, or link-local ranges */
function isPrivateIPv4(a: number, b: number, c: number): boolean {
  if (a === 127) {
    return true;
  }
  if (a === 10) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 0 && b === 0 && c === 0) {
    return true;
  }
  return false;
}

/**
 * Checks if an IP address belongs to a private, reserved, or link-local range.
 * Handles IPv4, IPv6, and IPv4-mapped IPv6 addresses (::ffff:A.B.C.D).
 */
export function isPrivateIP(ip: string): boolean {
  const normalized = ip.toLowerCase().trim();

  const mappedMatch = normalized.match(/^::ffff:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (mappedMatch) {
    const [, a, b, c] = mappedMatch.map(Number);
    return isPrivateIPv4(a, b, c);
  }

  const ipv4Match = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b, c] = ipv4Match.map(Number);
    return isPrivateIPv4(a, b, c);
  }

  const ipv6 = normalized.replace(/^\[|\]$/g, '');
  if (
    ipv6 === '::1' ||
    ipv6 === '::' ||
    ipv6.startsWith('fc') ||
    ipv6.startsWith('fd') ||
    ipv6.startsWith('fe80')
  ) {
    return true;
  }

  return false;
}

/**
 * Resolves a hostname via DNS and checks if any resolved address is a private/reserved IP.
 * Detects DNS-based SSRF bypasses (e.g., nip.io wildcard DNS, attacker-controlled nameservers).
 * Fails open: returns false if DNS resolution fails, since hostname-only checks still apply
 * and the actual HTTP request would also fail.
 */
export async function resolveHostnameSSRF(hostname: string): Promise<boolean> {
  const normalizedHost = hostname.toLowerCase().trim();

  if (/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(normalizedHost)) {
    return false;
  }

  const ipv6Check = normalizedHost.replace(/^\[|\]$/g, '');
  if (ipv6Check.includes(':')) {
    return false;
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
 * Returns null for stdio transports (no URL) or invalid URLs.
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
 * @param config - MCP server configuration with optional url field
 * @param allowedDomains - List of allowed domains (with wildcard support)
 */
export async function isMCPDomainAllowed(
  config: Record<string, unknown>,
  allowedDomains?: string[] | null,
): Promise<boolean> {
  const domain = extractMCPServerDomain(config);

  // Stdio transports don't have domains - always allowed
  if (!domain) {
    return true;
  }

  // Use MCP_PROTOCOLS (HTTP/HTTPS/WS/WSS) for MCP server validation
  return isDomainAllowedCore(domain, allowedDomains, MCP_PROTOCOLS);
}
