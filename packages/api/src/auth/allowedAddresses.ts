/**
 * Shared normalization for `allowedAddresses` entries used by both the
 * preflight SSRF helpers in `domain.ts` and the connect-time DNS lookup in
 * `agent.ts`. Keeping this in one module avoids subtle divergence between
 * the two paths (e.g. one rejecting tabs but not the other), which would
 * weaken defense-in-depth.
 *
 * SECURITY — scoped to private IP space:
 *  - Reject URLs (`://`), paths/CIDR (`/`), all whitespace (`\s`), and
 *    `host:port` shapes. These are admin misconfigurations that the schema
 *    refinement also rejects at config-load time; the runtime guard exists
 *    so a list assembled programmatically never silently grants exemption.
 *  - Drop public IP literals — public IPs are never SSRF targets, so an
 *    exemption there has no defensive purpose and must not grant "trusted"
 *    status. Hostnames pass through; their resolved IP is checked
 *    separately by callers (e.g. `resolveHostnameSSRF`).
 */
import { isPrivateIP } from './ip';

/** Returns true when the (already-normalized) string looks like an IPv4 or IPv6 literal. */
export function isIPLiteral(normalized: string): boolean {
  if (/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(normalized)) {
    return true;
  }
  return normalized.includes(':');
}

/**
 * Detects `host:port` and `[ipv6]:port` shapes, which are admin-input
 * mistakes. Bare `::1`, `[::1]`, and IPv6 literals with no port are not
 * matched.
 */
export function looksLikeHostPort(entry: string): boolean {
  if (/^\[[^\]]+\]:\d+$/.test(entry)) return true;
  const colonCount = (entry.match(/:/g) ?? []).length;
  if (colonCount !== 1) return false;
  return /^[^:]+:\d+$/.test(entry);
}

/**
 * Normalizes a single `allowedAddresses` entry. Returns the canonical form
 * (lowercased, trimmed, IPv6 brackets stripped) when the entry is acceptable,
 * or `''` when it must be ignored (URL, path, whitespace, host:port, public
 * IP literal, or empty after trimming).
 */
export function normalizeAddressEntry(entry: unknown): string {
  if (typeof entry !== 'string') return '';
  if (entry.includes('://') || entry.includes('/') || /\s/.test(entry)) return '';
  if (looksLikeHostPort(entry)) return '';
  const normalized = entry
    .toLowerCase()
    .trim()
    .replace(/^\[|\]$/g, '');
  if (!normalized) return '';
  if (isIPLiteral(normalized) && !isPrivateIP(normalized)) return '';
  return normalized;
}

/**
 * Pre-normalizes an admin list into a `Set<string>` for O(1) membership
 * checks on the connect-time hot path. Entries that fail validation are
 * silently dropped here; the Zod schema reports them at config load.
 */
export function normalizeAllowedAddressesSet(
  allowedAddresses?: string[] | null,
): Set<string> | null {
  if (!Array.isArray(allowedAddresses) || allowedAddresses.length === 0) {
    return null;
  }
  const set = new Set<string>();
  for (const entry of allowedAddresses) {
    const normalized = normalizeAddressEntry(entry);
    if (normalized) set.add(normalized);
  }
  return set.size > 0 ? set : null;
}

/**
 * Checks whether a hostname or IP literal should be exempted from the SSRF
 * block. Mirrors the scoping rules of `normalizeAddressEntry`: an IP
 * candidate must itself be private to be exemptable.
 */
export function isAddressInAllowedSet(candidate: string, set: Set<string> | null): boolean {
  if (!set) return false;
  const normalized = candidate
    .toLowerCase()
    .trim()
    .replace(/^\[|\]$/g, '');
  if (!normalized) return false;
  if (isIPLiteral(normalized) && !isPrivateIP(normalized)) return false;
  return set.has(normalized);
}
