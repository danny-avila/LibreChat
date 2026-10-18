import { ResourceType } from 'librechat-data-provider';
import type { AdminAuditLogEntry } from 'librechat-data-provider';
import type { PrincipalType } from 'librechat-data-provider';
import type { GrantAuditAction } from '~/admin/constants';
import type * as t from '~/admin/types';
import { getScopeTypeConfig } from '~/admin/constants';

/** The capability a grant entry concerns now lives in `metadata.capability`
 * (other event categories omit it). Returns '' when absent or non-string. */
export function auditCapability(entry: Pick<AdminAuditLogEntry, 'metadata'>): string {
  const cap = entry.metadata?.capability;
  return typeof cap === 'string' ? cap : '';
}

export const ACTION_BADGE_STATE: Record<GrantAuditAction, 'success' | 'danger'> = {
  'grant.assigned': 'success',
  'grant.removed': 'danger',
  'permission.insights_assigned': 'success',
  'permission.insights_removed': 'danger',
};

export const ACTION_LABEL_KEY: Record<GrantAuditAction, string> = {
  'grant.assigned': 'com_admin_audit_action_assigned',
  'grant.removed': 'com_admin_audit_action_removed',
  'permission.insights_assigned': 'com_admin_audit_action_insights_assigned',
  'permission.insights_removed': 'com_admin_audit_action_insights_removed',
};

export const ACTION_SUMMARY_KEY: Record<GrantAuditAction, string> = {
  'grant.assigned': 'com_admin_audit_detail_summary_assigned',
  'grant.removed': 'com_admin_audit_detail_summary_removed',
  'permission.insights_assigned': 'com_admin_audit_detail_summary_insights_assigned',
  'permission.insights_removed': 'com_admin_audit_detail_summary_insights_removed',
};

const INSIGHTS_PERMISSION = 'VIEW_INSIGHTS';

function isInsightsAction(action: string): boolean {
  return action === 'permission.insights_assigned' || action === 'permission.insights_removed';
}

/** Capability grants carry `metadata.capability`; Insights entries change the
 * agent-level `VIEW_INSIGHTS` permission bit instead. */
export function auditSubject(
  entry: Pick<AdminAuditLogEntry, 'action' | 'metadata'>,
  localize: (key: string) => string,
): t.AuditSubject {
  if (isInsightsAction(entry.action)) {
    return { label: localize('com_admin_audit_insights_permission'), value: INSIGHTS_PERMISSION };
  }
  const capability = auditCapability(entry);
  return { label: capabilityLabel(capability, localize), value: capability };
}

/** Insights entries target the agent; the affected principal lives in metadata. */
export function auditGrantee(
  entry: Pick<AdminAuditLogEntry, 'metadata'>,
): t.AuditGrantee | undefined {
  const type = entry.metadata?.principalType;
  const id = entry.metadata?.principalId;
  if (typeof type !== 'string' || typeof id !== 'string') return undefined;
  return { type, id };
}

const AGENT_TARGET_CONFIG: Pick<t.ScopeTypeConfigEntry, 'icon' | 'labelKey'> = {
  icon: 'sparkle',
  labelKey: 'com_admin_audit_target_agent',
};

export function auditTargetConfig(
  targetType: string,
): Pick<t.ScopeTypeConfigEntry, 'icon' | 'labelKey'> {
  if (targetType === ResourceType.AGENT) return AGENT_TARGET_CONFIG;
  return getScopeTypeConfig(targetType as PrincipalType);
}

/** Parse a `YYYY-MM-DD` filter value as a local-time date so the DatePicker
 * round-trips the same calendar day the user picked, regardless of TZ.
 * Rejects rolled-over inputs like `2026-13-01` (which `Date` would silently
 * coerce to January 2027) by re-checking the parsed components. */
export function isoDateToDate(iso: string): Date | undefined {
  if (!iso) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return undefined;
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return undefined;
  }
  return date;
}

export function dateToIsoDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Convert a `YYYY-MM-DD` filter value into the ISO timestamp for the start
 * (inclusive) or end (inclusive, millisecond-precise) of that local-time day.
 * Mixing local-day pick-list values with UTC midnight (the prior behaviour)
 * caused off-by-one filtering for any non-UTC user. */
export function localDayBoundaryIso(iso: string, boundary: 'start' | 'end'): string | undefined {
  const date = isoDateToDate(iso);
  if (!date) return undefined;
  if (boundary === 'end') date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

export function formatTimestamp(iso: string, locale: string | undefined = undefined): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function capabilityLabel(cap: string, localize: (key: string) => string): string {
  const key = `com_admin_cap_${cap.replace(/:/g, '_')}`;
  const label = localize(key);
  return label !== key ? label : cap;
}

/** Build a deep-link to a single audit-log entry, preserving any configured
 * `VITE_BASE_PATH` so the link resolves under subpath deployments (e.g.
 * `/adminpanel`). `basePath` is normalized to drop a trailing slash. */
export function buildEntryPermalink(id: string, origin: string, basePath: string): string {
  const base = basePath.replace(/\/$/, '');
  return `${origin}${base}/grants?tab=audit-log&entryId=${encodeURIComponent(id)}`;
}
