/**
 * URL parsing and auto-fill utilities for MCP Server Dialog
 */

/**
 * Extracts a readable server name from a URL
 * Examples:
 *   "https://api.example.com/mcp" → "Example API"
 *   "https://mcp.github.com" → "Github"
 *   "https://tools.anthropic.com" → "Anthropic Tools"
 */
export function extractServerNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;

    // Remove common prefixes and suffixes
    let name = hostname
      .replace(/^(www\.|api\.|mcp\.|tools\.)/, '')
      .replace(/\.(com|org|io|net|dev|ai|app)$/, '');

    // Split by dots and take the main domain part
    const parts = name.split('.');
    name = parts[0] || name;

    // Convert to title case and add context based on subdomain
    const titleCase = name
      .split(/[-_]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

    // Add suffix based on original subdomain (but not for mcp. prefix)
    if (hostname.startsWith('api.')) {
      return `${titleCase} API`;
    }
    if (hostname.startsWith('tools.')) {
      return `${titleCase} Tools`;
    }

    return titleCase;
  } catch {
    return '';
  }
}

/**
 * Validates a URL format
 */
export function isValidUrl(url: string): boolean {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Checks if URL uses HTTPS
 */
export function isHttps(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Normalizes a URL (adds https:// if missing protocol)
 */
export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return '';
  }

  // If no protocol, assume https
  if (!trimmed.includes('://')) {
    return `https://${trimmed}`;
  }

  return trimmed;
}

/**
 * Extracts transport type hint from URL patterns
 * Some MCP servers use specific URL patterns for SSE vs HTTP
 */
export function detectTransportFromUrl(url: string): 'streamable-http' | 'sse' | null {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();

    // Common SSE patterns
    if (pathname.includes('/sse') || pathname.includes('/events') || pathname.includes('/stream')) {
      return 'sse';
    }

    // Default to null (let user choose or use default)
    return null;
  } catch {
    return null;
  }
}
