import auditLogSchema from '~/schema/auditLog';
import type { IAuditLog } from '~/types/auditLog';

export function createAuditLogModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', auditLogSchema);
}
