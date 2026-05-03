import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import { isPrivateIP } from './domain';

/**
 * Pre-normalizes an admin `allowedAddresses` list into a Set of canonical
 * entries (lowercased, trimmed, IPv6 brackets stripped) so that the connect-
 * time DNS lookup — which runs once per outbound request — does an O(1)
 * membership check instead of re-iterating and re-normalizing the array on
 * every call.
 *
 * SECURITY: scoped to private IP space. Entries that contain `://`, `/`,
 * whitespace, or that are public IP literals are dropped here. The schema
 * refinement also rejects them at config-load time; this is defense in depth
 * so a misconfigured runtime list never grants a public address an exemption.
 */
function normalizeAllowedAddressesSet(allowedAddresses?: string[] | null): Set<string> | null {
  if (!Array.isArray(allowedAddresses) || allowedAddresses.length === 0) {
    return null;
  }
  const set = new Set<string>();
  for (const entry of allowedAddresses) {
    if (typeof entry !== 'string') continue;
    if (entry.includes('://') || entry.includes('/') || /\s/.test(entry)) continue;
    const normalized = entry
      .toLowerCase()
      .trim()
      .replace(/^\[|\]$/g, '');
    if (!normalized) continue;
    const isIPv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(normalized);
    const isIPv6 = !isIPv4 && normalized.includes(':');
    if ((isIPv4 || isIPv6) && !isPrivateIP(normalized)) continue;
    set.add(normalized);
  }
  return set.size > 0 ? set : null;
}

function isExempt(set: Set<string> | null, candidate: string): boolean {
  if (!set) return false;
  const normalized = candidate
    .toLowerCase()
    .trim()
    .replace(/^\[|\]$/g, '');
  const isIPv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(normalized);
  const isIPv6 = !isIPv4 && normalized.includes(':');
  if ((isIPv4 || isIPv6) && !isPrivateIP(normalized)) return false;
  return set.has(normalized);
}

/**
 * Builds a DNS lookup wrapper that blocks resolution to private/reserved IP
 * addresses. When `allowedAddresses` is provided, hostnames or resolved IPs
 * matching the list bypass the block — admins can permit known-good internal
 * services (self-hosted Ollama, Docker host, etc.) without disabling SSRF
 * protection for everything else.
 */
function buildSSRFSafeLookup(allowedAddresses?: string[] | null): LookupFunction {
  const exemptSet = normalizeAllowedAddressesSet(allowedAddresses);
  return (hostname, options, callback) => {
    const hostnameAllowed = isExempt(exemptSet, hostname);
    dns.lookup(hostname, options, (err, address, family) => {
      if (err) {
        callback(err, '', 0);
        return;
      }
      if (
        !hostnameAllowed &&
        typeof address === 'string' &&
        isPrivateIP(address) &&
        !isExempt(exemptSet, address)
      ) {
        const ssrfError = Object.assign(
          new Error(`SSRF protection: ${hostname} resolved to blocked address ${address}`),
          { code: 'ESSRF' },
        ) as NodeJS.ErrnoException;
        callback(ssrfError, address, family as number);
        return;
      }
      callback(null, address as string, family as number);
    });
  };
}

/** Default lookup with no exemptions. Kept for callers that don't need allowedAddresses. */
const ssrfSafeLookup: LookupFunction = buildSSRFSafeLookup();

/** Internal agent shape exposing createConnection (exists at runtime but not in TS types) */
type AgentInternal = {
  createConnection: (options: Record<string, unknown>, oncreate?: unknown) => unknown;
};

/** Patches an agent instance to inject SSRF-safe DNS lookup at connect time */
function withSSRFProtection<T extends http.Agent>(agent: T, lookup: LookupFunction): T {
  const internal = agent as unknown as AgentInternal;
  const origCreate = internal.createConnection.bind(agent);
  internal.createConnection = (options: Record<string, unknown>, oncreate?: unknown) => {
    options.lookup = lookup;
    return origCreate(options, oncreate);
  };
  return agent;
}

/**
 * Creates HTTP and HTTPS agents that block TCP connections to private/reserved IP addresses.
 * Provides TOCTOU-safe SSRF protection by validating the resolved IP at connect time,
 * preventing DNS rebinding attacks where a hostname resolves to a public IP during
 * pre-validation but to a private IP when the actual connection is made.
 *
 * @param allowedAddresses - Optional admin exemption list of hostnames/IPs that bypass the block.
 */
export function createSSRFSafeAgents(allowedAddresses?: string[] | null): {
  httpAgent: http.Agent;
  httpsAgent: https.Agent;
} {
  const lookup = allowedAddresses?.length ? buildSSRFSafeLookup(allowedAddresses) : ssrfSafeLookup;
  return {
    httpAgent: withSSRFProtection(new http.Agent(), lookup),
    httpsAgent: withSSRFProtection(new https.Agent(), lookup),
  };
}

/**
 * Returns undici-compatible `connect` options with SSRF-safe DNS lookup.
 * Pass the result as the `connect` property when constructing an undici `Agent`.
 *
 * @param allowedAddresses - Optional admin exemption list of hostnames/IPs that bypass the block.
 */
export function createSSRFSafeUndiciConnect(allowedAddresses?: string[] | null): {
  lookup: LookupFunction;
} {
  const lookup = allowedAddresses?.length ? buildSSRFSafeLookup(allowedAddresses) : ssrfSafeLookup;
  return { lookup };
}
