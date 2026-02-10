import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import { isPrivateIP } from './domain';

/** DNS lookup wrapper that blocks resolution to private/reserved IP addresses */
const ssrfSafeLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, options, (err, address, family) => {
    if (err) {
      callback(err, '', 0);
      return;
    }
    if (typeof address === 'string' && isPrivateIP(address)) {
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

/** Internal agent shape exposing createConnection (exists at runtime but not in TS types) */
type AgentInternal = {
  createConnection: (options: Record<string, unknown>, oncreate?: unknown) => unknown;
};

/** Patches an agent instance to inject SSRF-safe DNS lookup at connect time */
function withSSRFProtection<T extends http.Agent>(agent: T): T {
  const internal = agent as unknown as AgentInternal;
  const origCreate = internal.createConnection.bind(agent);
  internal.createConnection = (options: Record<string, unknown>, oncreate?: unknown) => {
    options.lookup = ssrfSafeLookup;
    return origCreate(options, oncreate);
  };
  return agent;
}

/**
 * Creates HTTP and HTTPS agents that block TCP connections to private/reserved IP addresses.
 * Provides TOCTOU-safe SSRF protection by validating the resolved IP at connect time,
 * preventing DNS rebinding attacks where a hostname resolves to a public IP during
 * pre-validation but to a private IP when the actual connection is made.
 */
export function createSSRFSafeAgents(): { httpAgent: http.Agent; httpsAgent: https.Agent } {
  return {
    httpAgent: withSSRFProtection(new http.Agent()),
    httpsAgent: withSSRFProtection(new https.Agent()),
  };
}

/**
 * Returns undici-compatible `connect` options with SSRF-safe DNS lookup.
 * Pass the result as the `connect` property when constructing an undici `Agent`.
 */
export function createSSRFSafeUndiciConnect(): { lookup: LookupFunction } {
  return { lookup: ssrfSafeLookup };
}
