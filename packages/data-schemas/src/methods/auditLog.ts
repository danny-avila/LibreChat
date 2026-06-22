import type { Model } from 'mongoose';
import type { IAuditLog, IAuditLogLean } from '~/types/auditLog';
import type { Types } from 'mongoose';

export function createAuditLogMethods(mongoose: typeof import('mongoose')) {
  /** Writes a new audit log entry. Failures are non-fatal — callers should catch and log. */
  async function writeAuditLog(args: {
    actorId: Types.ObjectId;
    action: string;
    targetUserId: Types.ObjectId;
    payload: Record<string, unknown>;
  }): Promise<IAuditLogLean> {
    const AuditLog = mongoose.models.AuditLog as Model<IAuditLog>;
    const doc = await AuditLog.create({
      actor_id: args.actorId,
      action: args.action,
      target_user_id: args.targetUserId,
      payload: args.payload,
      created_at: new Date(),
    });
    return doc.toObject() as IAuditLogLean;
  }

  return { writeAuditLog };
}

export type AuditLogMethods = ReturnType<typeof createAuditLogMethods>;
