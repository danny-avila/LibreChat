import type { ClientSession, FilterQuery, Model } from 'mongoose';
import { Types } from 'mongoose';
import type {
  AuditAction,
  AdminAuditLogEntry,
  IAuditLog,
  UserMigratedAuditMetadata,
} from '~/types/admin';
import logger from '~/config/winston';

export interface CreateAuditEntryInput {
  action: AuditAction;
  actorId: string | Types.ObjectId;
  targetPrincipalType?: IAuditLog['targetPrincipalType'];
  targetPrincipalId?: string;
  targetName?: string;
  capability?: string;
  metadata?: UserMigratedAuditMetadata;
  tenantId?: string;
  session?: ClientSession;
}

export interface ListAuditEntriesParams {
  action?: AuditAction;
  actorId?: string;
  limit?: number;
  offset?: number;
  tenantId?: string;
}

export function createAuditLogMethods(mongoose: typeof import('mongoose')) {
  async function createAuditEntry(input: CreateAuditEntryInput): Promise<IAuditLog> {
    const AuditLog = mongoose.models.AuditLog as Model<IAuditLog>;
    const actorObjectId =
      input.actorId instanceof Types.ObjectId
        ? input.actorId
        : new Types.ObjectId(String(input.actorId));

    const doc = await AuditLog.create(
      [
        {
          action: input.action,
          actorId: actorObjectId,
          targetPrincipalType: input.targetPrincipalType,
          targetPrincipalId: input.targetPrincipalId,
          targetName: input.targetName,
          capability: input.capability,
          metadata: input.metadata,
          tenantId: input.tenantId,
        },
      ],
      input.session ? { session: input.session } : undefined,
    );

    return doc[0];
  }

  async function listAuditEntries(
    params: ListAuditEntriesParams = {},
  ): Promise<{ entries: AdminAuditLogEntry[]; total: number }> {
    const AuditLog = mongoose.models.AuditLog as Model<IAuditLog>;
    const filter: FilterQuery<IAuditLog> = {};

    if (params.action) {
      filter.action = params.action;
    }
    if (params.actorId) {
      filter.actorId = new Types.ObjectId(params.actorId);
    }
    if (params.tenantId) {
      filter.tenantId = params.tenantId;
    }

    const limit = Math.min(Math.max(params.limit ?? 50, 1), 500);
    const offset = Math.max(params.offset ?? 0, 0);

    const [docs, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);

    const entries: AdminAuditLogEntry[] = docs.map((doc) => ({
      id: String(doc._id),
      action: doc.action,
      actorId: String(doc.actorId),
      actorName: '',
      targetPrincipalType: doc.targetPrincipalType,
      targetPrincipalId: doc.targetPrincipalId,
      targetName: doc.targetName ?? '',
      capability: doc.capability ?? '',
      timestamp: doc.createdAt?.toISOString() ?? new Date().toISOString(),
      metadata: doc.metadata,
    }));

    return { entries, total };
  }

  return {
    createAuditEntry,
    listAuditEntries,
  };
}

export type AuditLogMethods = ReturnType<typeof createAuditLogMethods>;
