import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import {
  normalizePort,
  normalizeAllowedAddressesSet,
  isAddressInAllowedSet,
} from './allowedAddresses';
import { isPrivateIP } from './ip';

/**
 * Builds a DNS lookup wrapper that blocks resolution to private/reserved IP
 * addresses. When `allowedAddresses` is provided, hostname/IP + port pairs
 * matching the list bypass the block — admins can permit known-good internal
 * services (self-hosted Ollama, Docker host, etc.) without disabling SSRF
 * protection for every port on the same host.
 *
 * The exemption list is pre-normalized once at construction so the per-
 * connection lookup runs an O(1) Set membership check. Normalization and
 * scoping rules live in `./allowedAddresses`, shared with the preflight
 * helper in `./domain` so the two layers cannot diverge.
 */
function buildSSRFSafeLookup(
  allowedAddresses?: string[] | null,
  port?: string | number | null,
): LookupFunction {
  const exemptSet = normalizeAllowedAddressesSet(allowedAddresses);
  const normalizedPort = normalizePort(port);
  return (hostname, options, callback) => {
    const hostnameAllowed = isAddressInAllowedSet(hostname, exemptSet, normalizedPort);
    dns.lookup(hostname, options, (err, address, family) => {
      if (err) {
        callback(err, '', 0);
        return;
      }
      if (
        !hostnameAllowed &&
        typeof address === 'string' &&
        isPrivateIP(address) &&
        !isAddressInAllowedSet(address, exemptSet, normalizedPort)
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

function getConnectionPort(options: Record<string, unknown>): string {
  return normalizePort(options.port ?? options.defaultPort);
}

/** Patches an agent instance to inject SSRF-safe DNS lookup at connect time */
function withSSRFProtection<T extends http.Agent>(agent: T, allowedAddresses?: string[] | null): T {
  const internal = agent as unknown as AgentInternal;
  const origCreate = internal.createConnection.bind(agent);
  internal.createConnection = (options: Record<string, unknown>, oncreate?: unknown) => {
    options.lookup = allowedAddresses?.length
      ? buildSSRFSafeLookup(allowedAddresses, getConnectionPort(options))
      : ssrfSafeLookup;
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
 * @param allowedAddresses - Optional admin exemption list of host:port pairs that bypass the block.
 */
export function createSSRFSafeAgents(allowedAddresses?: string[] | null): {
  httpAgent: http.Agent;
  httpsAgent: https.Agent;
} {
  return {
    httpAgent: withSSRFProtection(new http.Agent(), allowedAddresses),
    httpsAgent: withSSRFProtection(new https.Agent(), allowedAddresses),
  };
}

/**
 * Returns undici-compatible `connect` options with SSRF-safe DNS lookup.
 * Pass the result as the `connect` property when constructing an undici `Agent`.
 *
 * @param allowedAddresses - Optional admin exemption list of host:port pairs that bypass the block.
 */
export function createSSRFSafeUndiciConnect(
  allowedAddresses?: string[] | null,
  port?: string | number | null,
): {
  lookup: LookupFunction;
} {
  const lookup = allowedAddresses?.length
    ? buildSSRFSafeLookup(allowedAddresses, port)
    : ssrfSafeLookup;
  return { lookup };
}
