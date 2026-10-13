import { PrincipalType } from 'librechat-data-provider';
import type { RecordAuditEntryInput } from '@librechat/data-schemas';
import type { ResourceType } from 'librechat-data-provider';
import type { InsightsPermissionChange } from './insightsPermissions';
import type { RecordAuditEntry } from '~/admin/audit';
import type { ServerRequest } from '~/types';
import { buildAuditContext } from '~/admin/context';
import { getAuditActor } from '~/admin/audit';

export type AuditPlanItem = {
  input: RecordAuditEntryInput;
  /** The persisted change this entry describes; restored if the entry cannot be written. */
  change: InsightsPermissionChange;
};

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

type InsightsPlanDeps = {
  getAgent: (
    filter: Record<string, unknown>,
    projection: string,
  ) => Promise<{ id: string; name?: string } | null>;
  logger: AclAuditDeps['logger'];
};

/** Builds one `permission.insights_*` entry per Insights transition. */
export async function planInsightsAudit({
  req,
  resourceId,
  changes,
  deps,
}: {
  req: ServerRequest;
  resourceId: string;
  changes: InsightsPermissionChange[];
  deps: InsightsPlanDeps;
}): Promise<AuditPlanItem[]> {
  if (changes.length === 0) {
    return [];
  }
  const actor = getAuditActor(req);
  if (!actor) {
    throw statusError('Authenticated user required for Insights permission audit');
  }
  /** The lookup only decorates the entry; a failure must not skip the audit. */
  let agent: { id: string; name?: string } | null = null;
  try {
    agent = await deps.getAgent(
      {
        _id: resourceId,
        ...(req.user?.tenantId
          ? { tenantId: req.user.tenantId }
          : { tenantId: { $exists: false } }),
      },
      '_id id name',
    );
  } catch (error) {
    deps.logger.error('[InsightsPermissions] Audit target lookup failed', error);
  }
  const target = { id: agent?.id ?? resourceId, name: agent?.name || agent?.id || resourceId };
  const context = buildAuditContext(req);
  return changes.map((change) => ({
    change,
    input: {
      action:
        change.action === 'assigned'
          ? 'permission.insights_assigned'
          : 'permission.insights_removed',
      outcome: 'success',
      severity: 'warning',
      actor,
      target: { type: 'agent', ...target },
      metadata: {
        principalType: change.principal.type,
        principalId: change.principal.id?.toString() ?? '',
      },
      context,
      tenantId: req.user?.tenantId,
    },
  }));
}

/** Builds one `acl.*` entry per effective grant, revoke and public change. */
export function planResourceAudit({
  req,
  resourceType,
  resourceId,
  changes,
}: {
  req: ServerRequest;
  resourceType: ResourceType;
  resourceId: string;
  changes: InsightsPermissionChange[];
}): AuditPlanItem[] {
  if (changes.length === 0) {
    return [];
  }
  const actor = getAuditActor(req);
  if (!actor) {
    throw statusError('Authenticated user required for permission audit');
  }
  const context = buildAuditContext(req);
  const items: AuditPlanItem[] = [];
  for (const change of changes) {
    const event = buildEvent(change);
    if (event) {
      items.push({
        change,
        input: {
          ...event,
          outcome: 'success',
          severity: 'warning',
          actor,
          target: { type: resourceType, id: resourceId },
          context,
          tenantId: req.user?.tenantId,
        },
      });
    }
  }
  return items;
}

/**
 * Writes the planned entries in order. With `failClosed`, a failed write
 * restores every change whose entry was not yet written and throws, so the
 * request fails and the log never lags the ACL. Otherwise the failure is
 * logged and the updated permissions stand.
 */
export async function runAuditPlan({
  items,
  failClosed,
  deps,
}: {
  items: AuditPlanItem[];
  failClosed: boolean;
  deps: AclAuditDeps;
}): Promise<void> {
  for (let index = 0; index < items.length; index++) {
    try {
      await deps.recordAuditEntry(items[index].input, { failClosed });
    } catch (error) {
      if (!failClosed) {
        deps.logger.error('[ResourcePermissions] Audit persistence failed', error);
        continue;
      }
      await deps
        .restorePermissionChanges(items.slice(index).map((item) => item.change))
        .catch((restoreError) =>
          deps.logger.error('[ResourcePermissions] Permission rollback failed', restoreError),
        );
      throw statusError('Permission change could not be audited');
    }
  }
}

const principalKey = (change: InsightsPermissionChange) =>
  `${change.principal.type}:${change.principal.id?.toString() ?? ''}`;

/**
 * Audits a resource permission update: `acl.*` entries for every grant, revoke
 * and public change, plus the agent Insights entries when `insights` is given.
 * Both streams run as one pass, grouped by principal, so a fail-closed failure
 * restores every change not yet audited across both. Entries carry ids and
 * permission bits only, never principal names or emails.
 */
export async function auditResourcePermissionChanges({
  req,
  resourceType,
  resourceId,
  changes,
  insights,
  failClosed,
  deps,
}: {
  req: ServerRequest;
  resourceType: ResourceType;
  resourceId: string;
  changes: InsightsPermissionChange[];
  insights?: { changes: InsightsPermissionChange[]; getAgent: InsightsPlanDeps['getAgent'] };
  failClosed: boolean;
  deps: AclAuditDeps;
}): Promise<void> {
  const insightsChanges = insights?.changes ?? [];
  if (changes.length === 0 && insightsChanges.length === 0) {
    return;
  }
  let items: AuditPlanItem[];
  try {
    items = [
      ...planResourceAudit({ req, resourceType, resourceId, changes }),
      ...(insights
        ? await planInsightsAudit({
            req,
            resourceId,
            changes: insightsChanges,
            deps: { getAgent: insights.getAgent, logger: deps.logger },
          })
        : []),
    ];
  } catch (error) {
    if (failClosed) {
      await deps
        .restorePermissionChanges(changes)
        .catch((restoreError) =>
          deps.logger.error('[ResourcePermissions] Permission rollback failed', restoreError),
        );
    } else {
      deps.logger.error('[ResourcePermissions] Audit skipped', error);
      return;
    }
    throw error;
  }
  const order = new Map<string, number>();
  for (const { change } of items) {
    const key = principalKey(change);
    if (!order.has(key)) {
      order.set(key, order.size);
    }
  }
  items.sort((a, b) => order.get(principalKey(a.change))! - order.get(principalKey(b.change))!);
  await runAuditPlan({ items, failClosed, deps });
}
