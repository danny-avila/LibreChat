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

/**
 * SSRF Protection: Checks if a hostname/IP is a potentially dangerous internal target.
 * Blocks private IPs, localhost, cloud metadata IPs, and common internal hostnames.
 * @param hostname - The hostname or IP to check
 * @returns true if the target is blocked (SSRF risk), false if safe
 */
export function isSSRFTarget(hostname: string): boolean {
  const normalizedHost = hostname.toLowerCase().trim();

  // Block localhost variations
  if (
    normalizedHost === 'localhost' ||
    normalizedHost === 'localhost.localdomain' ||
    normalizedHost.endsWith('.localhost')
  ) {
    return true;
  }

  // Check if it's an IP address and block private/internal ranges
  const ipv4Match = normalizedHost.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b, c] = ipv4Match.map(Number);

    // 127.0.0.0/8 - Loopback
    if (a === 127) {
      return true;
    }

    // 10.0.0.0/8 - Private
    if (a === 10) {
      return true;
    }

    // 172.16.0.0/12 - Private (172.16.x.x - 172.31.x.x)
    if (a === 172 && b >= 16 && b <= 31) {
      return true;
    }

    // 192.168.0.0/16 - Private
    if (a === 192 && b === 168) {
      return true;
    }

    // 169.254.0.0/16 - Link-local (includes cloud metadata 169.254.169.254)
    if (a === 169 && b === 254) {
      return true;
    }

    // 0.0.0.0 - Special
    if (a === 0 && b === 0 && c === 0) {
      return true;
    }
  }

  // IPv6 loopback and private ranges
  const ipv6Normalized = normalizedHost.replace(/^\[|\]$/g, ''); // Remove brackets if present
  if (
    ipv6Normalized === '::1' ||
    ipv6Normalized === '::' ||
    ipv6Normalized.startsWith('fc') || // fc00::/7 - Unique local
    ipv6Normalized.startsWith('fd') || // fd00::/8 - Unique local
    ipv6Normalized.startsWith('fe80') // fe80::/10 - Link-local
  ) {
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

/**
 * Parsed domain specification including protocol and port constraints.
 */
interface ParsedDomainSpec {
  hostname: string;
  protocol?: 'http:' | 'https:' | null; // null means any protocol
  port?: string | null; // null means any port
  explicitPort: boolean; // true if port was explicitly specified in original string
  isWildcard: boolean;
}

/**
 * Parses a domain specification into its components.
 * Supports formats:
 *   - `example.com` (any protocol, any port)
 *   - `https://example.com` (https only, any port)
 *   - `https://example.com:443` (https only, port 443)
 *   - `*.example.com` (wildcard subdomain)
 * @param domain - Domain specification string
 * @returns ParsedDomainSpec or null if invalid
 */
function parseDomainSpec(domain: string): ParsedDomainSpec | null {
  try {
    let normalizedDomain = domain.toLowerCase().trim();

    // Early return for obviously invalid formats
    if (normalizedDomain === 'http://' || normalizedDomain === 'https://') {
      return null;
    }

    // Check for wildcard prefix before parsing
    const isWildcard = normalizedDomain.startsWith('*.');

    // Check if it has a protocol
    const hasProtocol =
      normalizedDomain.startsWith('http://') || normalizedDomain.startsWith('https://');

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
    if (!url.hostname || url.hostname === 'http:' || url.hostname === 'https:') {
      return null;
    }

    const hostname = url.hostname.replace(/^www\./i, '');

    return {
      hostname,
      protocol: hasProtocol ? (url.protocol as 'http:' | 'https:') : null,
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

/**
 * Checks if the given domain is allowed.
 * SECURITY: When no allowedDomains is configured, blocks SSRF-prone targets
 * (private IPs, localhost, metadata services) to prevent attacks.
 * When allowedDomains IS configured, admins can explicitly allow internal targets if needed.
 *
 * Supports protocol and port restrictions in allowedDomains:
 *   - `example.com` - allows any protocol/port
 *   - `https://example.com` - allows only HTTPS on default port
 *   - `https://example.com:8443` - allows only HTTPS on port 8443
 *
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

  const inputSpec = parseDomainSpec(domain);
  if (!inputSpec) {
    return false;
  }

  /** If no domain restrictions configured, block SSRF targets but allow all else */
  if (!Array.isArray(allowedDomains) || !allowedDomains.length) {
    /** SECURITY: Block SSRF-prone targets when no allowlist is configured */
    if (isSSRFTarget(inputSpec.hostname)) {
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
 * Extracts domain from MCP server config URL.
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
    return parsedUrl.hostname.replace(/^www\./i, '');
  } catch {
    return null;
  }
}

/**
 * Validates MCP server domain against allowedDomains.
 * Reuses isActionDomainAllowed for consistent validation logic.
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

  // Reuse existing validation logic (includes wildcard support)
  return isActionDomainAllowed(domain, allowedDomains);
}
