import type * as t from '~/types';
import auditLogSchema from '~/schema/auditLog';

/**
 * AuditLog is an append-only compliance record of SystemGrant changes.
 *
 * Like SystemGrant, the tenant-isolation plugin is intentionally not applied:
 * the audit listing/export queries explicitly compose the tenantId filter
 * from the JWT-resolved caller, and platform-level entries (admin operating
 * outside any tenant context) use `{ tenantId: { $exists: false } }`.
 */
export function createAuditLogModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.AuditLog || mongoose.model<t.IAuditLog>('AuditLog', auditLogSchema);
}
