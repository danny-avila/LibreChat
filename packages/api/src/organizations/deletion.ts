import { randomUUID } from 'crypto';
import { logger, runInTenant, OrganizationStatus } from '@librechat/data-schemas';
import type { AllMethods } from '@librechat/data-schemas';
import type { RecordAuditEntry } from '~/admin/audit';
import type { ErasableMember } from './erase';
import { getSafeErrorMetadata } from '~/utils/errors';
import { createOrganizationAuditor } from './audit';

export type OrganizationDeletionDb = Pick<
  AllMethods,
  | 'findOrganization'
  | 'listOrganizations'
  | 'listTenantMemberIds'
  | 'getUserById'
  | 'deleteTenantSessions'
  | 'purgeTenantRecords'
  | 'deleteTenantGrants'
  | 'deleteOrganization'
  | 'acquireResourceLock'
  | 'releaseResourceLock'
>;

export interface OrganizationDeletionDeps {
  db: OrganizationDeletionDb;
  /** The single-user erasure cascade, run inside the member's organization. */
  eraseMember: (member: ErasableMember) => Promise<void>;
  /** Forgets cached state the organization leaves behind (its status, its config overrides). */
  forgetOrganization?: (tenantId: string) => Promise<void> | void;
  recordAuditEntry?: RecordAuditEntry;
  /** How long one run may hold the organization's deletion lock. */
  lockTtlMs?: number;
}

export interface OrganizationDeleter {
  /** Erases an organization already marked `deleting`; safe to call again until it is gone. */
  deleteOrganization: (
    tenantId: string,
    requestedBy?: { id: string; name?: string },
  ) => Promise<void>;
  /** Resumes every deletion a stopped server left unfinished. Run at startup. */
  resumePendingDeletions: () => Promise<void>;
}

const DEFAULT_LOCK_TTL_MS = 30 * 60 * 1000;
const RESUME_PAGE = 100;

/**
 * Permanently erases an organization the platform operator deleted. The organization is marked
 * `deleting` first (by the caller), which refuses every sign-in, switch, invite and admin scope,
 * so nothing new lands while it runs:
 *
 * 1. its sessions end;
 * 2. every member record (any status, including the operator's access) goes through the same
 *    erasure cascade an account deletion uses: files, conversations, agents and the rest;
 * 3. every other record of every tenant-isolated model is swept from the tenant;
 * 4. its grants go, and the organization record last, which marks the deletion done.
 *
 * Each step is idempotent and a failure leaves the organization `deleting`, so the next run
 * (or the next startup) picks up where this one stopped. The organization's audit chain is
 * append-only and is kept.
 */
export function createOrganizationDeleter(deps: OrganizationDeletionDeps): OrganizationDeleter {
  const { db } = deps;
  const audit = createOrganizationAuditor(deps.recordAuditEntry);
  const lockTtlMs = deps.lockTtlMs ?? DEFAULT_LOCK_TTL_MS;

  async function eraseMembers(tenantId: string): Promise<number> {
    let failures = 0;
    for (const memberId of await db.listTenantMemberIds(tenantId)) {
      try {
        const member = await runInTenant(tenantId, () => db.getUserById(memberId, 'role tenantId'));
        if (!member) {
          continue;
        }
        await runInTenant(tenantId, () =>
          deps.eraseMember({ id: memberId, tenantId, role: member.role }),
        );
      } catch (error) {
        failures += 1;
        logger.error(
          `[organizations] Could not erase member ${memberId} of ${tenantId}`,
          getSafeErrorMetadata(error),
        );
      }
    }
    return failures;
  }

  async function deleteOrganization(
    tenantId: string,
    requestedBy?: { id: string; name?: string },
  ): Promise<void> {
    const key = `organization-delete:${tenantId}`;
    const ownerId = randomUUID();
    if (!(await db.acquireResourceLock({ key, ownerId, ttlMs: lockTtlMs }))) {
      /* Another run holds it; that run finishes the job. */
      return;
    }
    try {
      const organization = await db.findOrganization(tenantId);
      if (!organization || organization.status !== OrganizationStatus.DELETING) {
        return;
      }
      await db.deleteTenantSessions(tenantId);
      const failedMembers = await eraseMembers(tenantId);
      if (failedMembers > 0) {
        throw new Error(`${failedMembers} member(s) could not be erased`);
      }
      const purge = await db.purgeTenantRecords(tenantId, ['Organization']);
      if (purge.failed.length > 0) {
        throw new Error(`Records left in: ${purge.failed.join(', ')}`);
      }
      await db.deleteTenantGrants(tenantId);
      await db.deleteOrganization(tenantId);
      await deps.forgetOrganization?.(tenantId);
      /* A platform action: on the platform chain, whoever (or whatever) finished the run. */
      await audit({
        tenantId: undefined,
        action: 'organization.deleted',
        actor: requestedBy ?? { id: 'system', name: 'system', type: 'system' },
        target: { type: 'organization', id: tenantId, name: organization.name },
        metadata: {
          organization: tenantId,
          records: Object.values(purge.deleted).reduce((sum, n) => sum + n, 0),
        },
      });
      logger.info(`[organizations] Deleted organization ${tenantId}`);
    } finally {
      await db.releaseResourceLock({ key, ownerId }).catch((error: unknown) => {
        logger.warn('[organizations] Could not release the deletion lock', error);
      });
    }
  }

  async function resumePendingDeletions(): Promise<void> {
    const pending = await db.listOrganizations({
      status: OrganizationStatus.DELETING,
      limit: RESUME_PAGE,
    });
    for (const organization of pending) {
      await deleteOrganization(organization.tenantId).catch((error: unknown) => {
        logger.error(
          `[organizations] Deletion of ${organization.tenantId} is still unfinished`,
          getSafeErrorMetadata(error),
        );
      });
    }
  }

  return { deleteOrganization, resumePendingDeletions };
}
