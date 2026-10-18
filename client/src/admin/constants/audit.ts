import type {
  AuditAction,
  AuditActorType,
  AuditCategory,
  AuditOutcome,
  AuditSeverity,
} from 'librechat-data-provider';

/**
 * Client-safe mirrors of the audit enums from `@librechat/data-schemas`.
 *
 * These are defined as local literals rather than imported from the package's
 * main barrel: that barrel pulls Node-only modules (mongoose, winston, …) and
 * must never reach the client bundle (see AGENTS.md). `src/server/capabilities.ts`
 * is reached by browser components via `@/server`, so its zod validators source
 * these arrays here instead of the barrel.
 *
 * The `satisfies` clauses fail `tsc` if any member drifts from the published
 * unions; the type-only imports above are fully erased at build time so nothing
 * from the barrel reaches the bundle.
 */
export const AUDIT_ACTIONS = [
  'grant.assigned',
  'grant.removed',
  'permission.insights_assigned',
  'permission.insights_removed',
] as const satisfies readonly AuditAction[];

/** The grant events the panel's audit log tab shows (it asks for the `grant` category only). */
export type GrantAuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_CATEGORIES = [
  'grant',
  'agent_run',
  'tool_call',
  'mcp',
  'config',
  'permission',
  'auth',
  'approval',
] as const satisfies readonly AuditCategory[];

export const AUDIT_OUTCOMES = [
  'success',
  'failure',
  'denied',
  'pending',
] as const satisfies readonly AuditOutcome[];

export const AUDIT_SEVERITIES = [
  'info',
  'warning',
  'critical',
] as const satisfies readonly AuditSeverity[];

export const AUDIT_ACTOR_TYPES = [
  'user',
  'system',
  'agent',
  'service',
  'schedule',
  'webhook',
  'api',
] as const satisfies readonly AuditActorType[];

/** Backend audit-entry id shape (Mongo ObjectId). Shared by the BFF validator
 * and the client query guard so a crafted `?entryId=` deep link is rejected. */
const AUDIT_ENTRY_ID_RE = /^[a-f0-9]{24}$/i;

export function isAuditEntryId(id: string | undefined | null): id is string {
  return typeof id === 'string' && AUDIT_ENTRY_ID_RE.test(id);
}
