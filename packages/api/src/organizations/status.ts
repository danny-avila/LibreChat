import type { TOrganizationStatus } from '@librechat/data-schemas';

export interface OrganizationStatusCacheDeps {
  findOrganization: (tenantId: string) => Promise<{ status?: TOrganizationStatus } | null>;
  /** How long a read status is trusted. Defaults to 30 seconds. */
  ttlMs?: number;
  now?: () => number;
}

export interface OrganizationStatusCache {
  /** The organization's status, or `null` when the tenant names no organization. */
  getStatus: (tenantId: string) => Promise<TOrganizationStatus | null>;
  /** Forgets a status after the operator changes it, so this process sees it at once. */
  evict: (tenantId: string) => void;
}

const DEFAULT_TTL_MS = 30_000;

/**
 * An organization's status as every authenticated request reads it, from memory. A change made
 * in this process is seen at once (the operator's handlers evict it); another server instance
 * sees it within the TTL, and the organization's sessions are already revoked by then.
 */
export function createOrganizationStatusCache(
  deps: OrganizationStatusCacheDeps,
): OrganizationStatusCache {
  const ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS;
  const now = deps.now ?? Date.now;
  const entries = new Map<string, { status: TOrganizationStatus | null; expiresAt: number }>();
  const flights = new Map<string, Promise<TOrganizationStatus | null>>();

  async function getStatus(tenantId: string): Promise<TOrganizationStatus | null> {
    const cached = entries.get(tenantId);
    if (cached && cached.expiresAt > now()) {
      return cached.status;
    }
    const inFlight = flights.get(tenantId);
    if (inFlight) {
      return inFlight;
    }
    const flight = deps
      .findOrganization(tenantId)
      .then((organization) => {
        const status = organization ? (organization.status ?? 'active') : null;
        entries.set(tenantId, { status, expiresAt: now() + ttlMs });
        return status;
      })
      .finally(() => flights.delete(tenantId));
    flights.set(tenantId, flight);
    return flight;
  }

  return {
    getStatus,
    evict: (tenantId) => {
      entries.delete(tenantId);
    },
  };
}
