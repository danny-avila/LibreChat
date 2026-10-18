import { logger } from '@librechat/data-schemas';
import type {
  AuditAction,
  AuditMetadata,
  AuditActorType,
  AuditTargetInput,
} from '@librechat/data-schemas';
import type { RecordAuditEntry } from '~/admin/audit';
import { getSafeErrorMetadata } from '~/utils/errors';

/** One organization event: who did what to whom, in which organization. */
export interface OrganizationAuditEvent {
  /** The organization's chain; `undefined` writes to the platform chain. */
  tenantId: string | undefined;
  action: AuditAction;
  /** The member acting, as the organization knows them (or the system, for background work). */
  actor: { id: string; name?: string; type?: AuditActorType };
  target: AuditTargetInput;
  metadata?: AuditMetadata;
}

export type OrganizationAuditor = (event: OrganizationAuditEvent) => Promise<void>;

/**
 * Writes organization events to the organization's own audit chain, where its admins read
 * them. Fail-open: each event follows a change that already happened, so a failed write is
 * logged rather than turned into an error for a change that succeeded.
 */
export function createOrganizationAuditor(
  recordAuditEntry?: RecordAuditEntry,
): OrganizationAuditor {
  return async (event) => {
    if (!recordAuditEntry) {
      return;
    }
    try {
      await recordAuditEntry({
        tenantId: event.tenantId,
        action: event.action,
        actor: {
          type: event.actor.type ?? 'user',
          id: event.actor.id,
          name: event.actor.name || event.actor.id,
        },
        target: event.target,
        ...(event.metadata ? { metadata: event.metadata } : {}),
      });
    } catch (error) {
      logger.error(
        `[organizations] audit write failed for ${event.action}`,
        getSafeErrorMetadata(error),
      );
    }
  };
}
