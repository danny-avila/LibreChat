import { HttpsProxyAgent } from 'https-proxy-agent';

/**
 * Parses and normalizes a URL to extract hostname and port for matching.
 */
function parseUrl(url: string): { hostname: string; port: string } | null {
  try {
    const parsed = new URL(url);
    const defaultPort = parsed.protocol === 'https:' ? '443' : '80';
    return {
      hostname: parsed.hostname.toLowerCase(),
      port: parsed.port || defaultPort,
    };
  } catch {
    return null;
  }
}

/**
 * Checks if a URL should bypass the proxy based on NO_PROXY patterns.
 * Follows the same semantics as undici's EnvHttpProxyAgent.
 *
 * Supported patterns:
 * - Exact hostname match: "example.com" matches "example.com" only
 * - Wildcard (*): Matches all hosts
 * - Suffix patterns (.example.com): Matches any subdomain of example.com
 * - Port-specific patterns: "example.com:8080" matches only that port
 * - IP addresses: "192.168.1.1" matches that IP exactly
 *
 * @param targetUrl - The URL to check against NO_PROXY patterns
 * @param noProxyEnv - The NO_PROXY value (comma-separated patterns), defaults to env
 * @returns true if the URL should bypass the proxy
 */
export function shouldBypassProxy(targetUrl: string, noProxyEnv?: string): boolean {
  const noProxy = noProxyEnv ?? process.env.NO_PROXY ?? process.env.no_proxy;

  if (!noProxy) {
    return false;
  }

  const parsed = parseUrl(targetUrl);
  if (!parsed) {
    return false;
  }

  const { hostname, port } = parsed;
  const patterns = noProxy
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  for (const pattern of patterns) {
    // Wildcard matches everything
    if (pattern === '*') {
      return true;
    }

    // Parse pattern for optional port
    let patternHost = pattern;
    let patternPort: string | null = null;

    const portMatch = pattern.match(/^(.+):(\d+)$/);
    if (portMatch) {
      patternHost = portMatch[1];
      patternPort = portMatch[2];
    }

    // If pattern specifies a port, it must match
    if (patternPort && patternPort !== port) {
      continue;
    }

    // Exact match
    if (hostname === patternHost) {
      return true;
    }

    // Suffix match (pattern starts with .)
    if (patternHost.startsWith('.')) {
      if (hostname.endsWith(patternHost) || hostname === patternHost.slice(1)) {
        return true;
      }
    }

    // Also check if hostname ends with the pattern (implicit suffix)
    // e.g., pattern "example.com" should match "sub.example.com"
    if (hostname.endsWith(`.${patternHost}`)) {
      return true;
    }
  }

  return false;
}

/**
 * Creates an HttpsProxyAgent if PROXY is set and the targetUrl is not in NO_PROXY.
 * Returns undefined if no proxy should be used.
 *
 * @param targetUrl - The URL that will be accessed (for NO_PROXY matching)
 * @returns HttpsProxyAgent instance or undefined
 */
export function getProxyAgent(targetUrl?: string): HttpsProxyAgent | undefined {
  const proxy = process.env.PROXY;

  if (!proxy) {
    return undefined;
  }

  // If target URL is provided, check NO_PROXY
  if (targetUrl && shouldBypassProxy(targetUrl)) {
    return undefined;
  }

  return new HttpsProxyAgent(proxy);
}

/**
 * Returns axios config with httpsAgent if proxy should be used.
 * Convenience function for axios request configurations.
 *
 * @param targetUrl - The URL that will be accessed (for NO_PROXY matching)
 * @returns Object with httpsAgent property if proxy should be used, empty object otherwise
 */
export function getAxiosProxyConfig(targetUrl?: string): { httpsAgent?: HttpsProxyAgent } {
  const agent = getProxyAgent(targetUrl);
  return agent ? { httpsAgent: agent } : {};
}
