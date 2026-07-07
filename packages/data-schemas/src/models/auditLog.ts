import auditLogSchema from '~/schema/auditLog';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import type { IAuditLog } from '~/types/admin';

export function createAuditLogModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(auditLogSchema);
  return mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', auditLogSchema);
}
