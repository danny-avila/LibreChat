import { PrincipalType } from 'librechat-data-provider';
import type { RecordAuditEntryInput } from '@librechat/data-schemas';
import type { ResourceType } from 'librechat-data-provider';
import type { RecordAuditEntry } from '~/admin/audit';
import type { PermissionChange } from './types';
import type { ServerRequest } from '~/types';
import { buildAuditContext } from '~/admin/context';
import { getAuditActor } from '~/admin/audit';

export type AuditPlanItem = {
  input: RecordAuditEntryInput;
};

type AclAuditDeps = {
  recordAuditEntry: RecordAuditEntry;
  logger: { error: (message: string, error?: unknown) => void };
};

function statusError(message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode: 500 });
}

function buildEvent(
  change: PermissionChange,
): Pick<RecordAuditEntryInput, 'action' | 'metadata'> | null {
  const { previous, written, principal } = change;
  const isPublic = principal.type === PrincipalType.PUBLIC;
  const previousBits = previous?.permBits ?? 0;
  const permBits = written?.permBits ?? 0;
  if (change.action === 'assigned') {
    const unchanged =
      previous != null &&
      written != null &&
      previous.roleId === written.roleId &&
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
  changes: PermissionChange[];
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
  changes: PermissionChange[];
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

export type PermissionPlan = {
  aclChanges: PermissionChange[];
  insightsChanges: PermissionChange[];
};

/**
 * Audits a resource permission update before it is written. `update` receives a
 * `beforeWrite` hook to call with the computed changes ahead of any ACL write:
 * it records one `acl.*` entry per grant, revoke and public change, plus the
 * agent Insights entries when `getAgent` is given. With `failClosed`, a failed
 * audit write throws, so the request fails with the ACL untouched. If the ACL
 * write then fails, the entries already recorded are followed by matching
 * `failure` entries (best effort), so the log never claims a change that did
 * not happen. Entries carry ids and permission bits only, never names or emails.
 */
export async function runAuditedPermissionUpdate<T>({
  req,
  resourceType,
  resourceId,
  getAgent,
  failClosed,
  deps,
  update,
}: {
  req: ServerRequest;
  resourceType: ResourceType;
  resourceId: string;
  getAgent?: InsightsPlanDeps['getAgent'];
  failClosed: boolean;
  deps: AclAuditDeps;
  update: (beforeWrite: (plan: PermissionPlan) => Promise<void>) => Promise<T>;
}): Promise<T> {
  const recorded: AuditPlanItem[] = [];
  const recordFailures = async () => {
    const items = recorded.splice(0);
    for (const item of items) {
      try {
        await deps.recordAuditEntry({ ...item.input, outcome: 'failure' });
      } catch (error) {
        deps.logger.error('[ResourcePermissions] Audit failure entry not persisted', error);
      }
    }
  };
  try {
    return await update(async ({ aclChanges, insightsChanges }) => {
      let items: AuditPlanItem[];
      try {
        items = [
          ...planResourceAudit({ req, resourceType, resourceId, changes: aclChanges }),
          ...(getAgent
            ? await planInsightsAudit({
                req,
                resourceId,
                changes: insightsChanges,
                deps: { getAgent, logger: deps.logger },
              })
            : []),
        ];
      } catch (error) {
        if (failClosed) {
          throw error;
        }
        deps.logger.error('[ResourcePermissions] Audit skipped', error);
        return;
      }
      for (const item of items) {
        try {
          await deps.recordAuditEntry(item.input, { failClosed });
          recorded.push(item);
        } catch (error) {
          if (!failClosed) {
            deps.logger.error('[ResourcePermissions] Audit persistence failed', error);
            continue;
          }
          await recordFailures();
          throw statusError('Permission change could not be audited');
        }
      }
    });
  } catch (error) {
    await recordFailures();
    throw error;
  }
}
