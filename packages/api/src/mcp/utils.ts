import { Constants } from 'librechat-data-provider';

/**
 * Escapes special regex characters in a string so they are treated literally.
 * @param str - The string to escape
 * @returns The escaped string safe for use in a regex pattern
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const mcpToolPattern = new RegExp(escapeRegex(Constants.mcp_delimiter));
/**
 * Normalizes a server name to match the pattern ^[a-zA-Z0-9_.-]+$
 * This is required for Azure OpenAI models with Tool Calling
 */
function isValidServerNameCharacter(charCode: number): boolean {
  const isUppercase = charCode >= 65 && charCode <= 90;
  const isLowercase = charCode >= 97 && charCode <= 122;
  const isDigit = charCode >= 48 && charCode <= 57;
  const isDash = charCode === 45;
  const isDot = charCode === 46;
  const isUnderscore = charCode === 95;

  return isUppercase || isLowercase || isDigit || isDash || isDot || isUnderscore;
}

function isValidServerName(serverName: string): boolean {
  if (serverName.length === 0) {
    return false;
  }

  for (let i = 0; i < serverName.length; i += 1) {
    if (!isValidServerNameCharacter(serverName.charCodeAt(i))) {
      return false;
    }
  }

  return true;
}

export function normalizeServerName(serverName: string): string {
  if (isValidServerName(serverName)) {
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
