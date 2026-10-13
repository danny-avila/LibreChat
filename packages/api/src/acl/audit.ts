import { PrincipalType } from 'librechat-data-provider';
import type { RecordAuditEntryInput } from '@librechat/data-schemas';
import type { ResourceType } from 'librechat-data-provider';
import type { InsightsPermissionChange } from './insightsPermissions';
import type { RecordAuditEntry } from '~/admin/audit';
import type { ServerRequest } from '~/types';
import { buildAuditContext } from '~/admin/context';
import { getAuditActor } from '~/admin/audit';

type AclAuditDeps = {
  recordAuditEntry: RecordAuditEntry;
  /** Reverts persisted changes so a mutation that could not be audited does not stand. */
  restorePermissionChanges: (changes: InsightsPermissionChange[]) => Promise<void>;
  logger: { error: (message: string, error?: unknown) => void };
};

function statusError(message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode: 500 });
}

function buildEvent(
  change: InsightsPermissionChange,
): Pick<RecordAuditEntryInput, 'action' | 'metadata'> | null {
  const { previousEntry, writtenEntry, principal } = change;
  const isPublic = principal.type === PrincipalType.PUBLIC;
  const previousBits = previousEntry?.permBits ?? 0;
  const permBits = writtenEntry?.permBits ?? 0;
  if (change.action === 'assigned') {
    const unchanged =
      previousEntry != null &&
      writtenEntry != null &&
      previousEntry.roleId?.toString() === writtenEntry.roleId?.toString() &&
      previousBits === permBits;
    if (unchanged) {
      return null;
    }
  }
  const metadata = {
    principalType: principal.type,
    principalId: principal.id?.toString() ?? '',
    permBits,
    previousPermBits: previousBits,
  };
  if (isPublic) {
    return {
      action: 'acl.public_changed',
      metadata: { ...metadata, enabled: change.action === 'assigned' },
    };
  }
  return { action: change.action === 'assigned' ? 'acl.granted' : 'acl.revoked', metadata };
}

/**
 * Records one `acl.*` entry per effective grant, revoke and public-visibility
 * change of a resource permission update. Entries carry ids and permission
 * bits only, never principal names or emails.
 *
 * With `failClosed`, a failed write restores the changes that were not yet
 * audited and throws, so the request fails and the log never lags the ACL.
 * Otherwise the failure is logged and the updated permissions stand.
 */
export async function auditResourcePermissionChanges({
  req,
  resourceType,
  resourceId,
  changes,
  failClosed,
  deps,
}: {
  req: ServerRequest;
  resourceType: ResourceType;
  resourceId: string;
  changes: InsightsPermissionChange[];
  failClosed: boolean;
  deps: AclAuditDeps;
}): Promise<void> {
  if (changes.length === 0) {
    return;
  }
  const actor = getAuditActor(req);
  if (!actor) {
    if (!failClosed) {
      deps.logger.error('[ResourcePermissions] Audit skipped: no authenticated actor');
      return;
    }
    await deps
      .restorePermissionChanges(changes)
      .catch((restoreError) =>
        deps.logger.error('[ResourcePermissions] Permission rollback failed', restoreError),
      );
    throw statusError('Authenticated user required for permission audit');
  }

  const context = buildAuditContext(req);
  for (let index = 0; index < changes.length; index++) {
    const event = buildEvent(changes[index]);
    if (!event) {
      continue;
    }
    const input: RecordAuditEntryInput = {
      ...event,
      outcome: 'success',
      severity: 'warning',
      actor,
      target: { type: resourceType, id: resourceId },
      context,
      tenantId: req.user?.tenantId,
    };
    try {
      await deps.recordAuditEntry(input, { failClosed });
    } catch (error) {
      if (!failClosed) {
        deps.logger.error('[ResourcePermissions] Audit persistence failed', error);
        continue;
      }
      await deps
        .restorePermissionChanges(changes.slice(index))
        .catch((restoreError) =>
          deps.logger.error('[ResourcePermissions] Permission rollback failed', restoreError),
        );
      throw statusError('Permission change could not be audited');
    }
  }
}
