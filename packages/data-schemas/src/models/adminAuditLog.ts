import adminAuditLogSchema, { IMongoAdminAuditLog } from '~/schema/adminAuditLog';

/**
 * Creates or returns the AdminAuditLog model using the provided mongoose instance and schema
 */
export function createAdminAuditLogModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.AdminAuditLog ||
    mongoose.model<IMongoAdminAuditLog>('AdminAuditLog', adminAuditLogSchema)
  );
}
