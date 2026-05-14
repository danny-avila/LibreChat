import type { FilterQuery, Model } from 'mongoose';
import type {
  AdminAuditLogEntry,
  AuditLogFilters,
  AuditLogPage,
  IAuditLog,
  RecordAuditEntryInput,
} from '~/types';
import logger from '~/config/winston';

const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 500;
const MAX_SEARCH_LENGTH = 200;

export interface AuditLogMethods {
  recordAuditEntry: (input: RecordAuditEntryInput) => Promise<IAuditLog | null>;
  listAuditLogPage: (
    tenantId: string | undefined,
    filters: AuditLogFilters,
  ) => Promise<AuditLogPage>;
  findAuditLogEntry: (
    tenantId: string | undefined,
    id: string,
  ) => Promise<AdminAuditLogEntry | null>;
  streamAuditLogEntries: (
    tenantId: string | undefined,
    filters: Omit<AuditLogFilters, 'offset' | 'limit'>,
    onEntry: (entry: AdminAuditLogEntry) => void | Promise<void>,
    options?: { isCancelled?: () => boolean },
  ) => Promise<number>;
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toWire(doc: IAuditLog): AdminAuditLogEntry {
  return {
    id: doc._id.toString(),
    action: doc.action,
    actorId: doc.actorId.toString(),
    actorName: doc.actorName,
    targetPrincipalType: doc.targetPrincipalType,
    targetPrincipalId: doc.targetPrincipalId.toString(),
    targetName: doc.targetName,
    capability: doc.capability,
    timestamp: doc.createdAt.toISOString(),
  };
}

function tenantFilter(tenantId?: string): FilterQuery<IAuditLog> {
  return typeof tenantId === 'string' && tenantId.trim().length > 0
    ? { tenantId }
    : { tenantId: { $exists: false } };
}

function buildFilter(
  tenantId: string | undefined,
  filters: AuditLogFilters,
): FilterQuery<IAuditLog> {
  const query: FilterQuery<IAuditLog> = { ...tenantFilter(tenantId) };

  if (filters.action && filters.action.length > 0) {
    query.action = filters.action.length === 1 ? filters.action[0] : { $in: filters.action };
  }
  if (filters.actorQuery) {
    query.actorName = { $regex: escapeRegex(filters.actorQuery), $options: 'i' };
  }
  if (filters.targetPrincipalType) {
    query.targetPrincipalType = filters.targetPrincipalType;
  }
  if (filters.targetQuery) {
    query.targetName = { $regex: escapeRegex(filters.targetQuery), $options: 'i' };
  }
  if (filters.capability) {
    query.capability = { $regex: escapeRegex(filters.capability), $options: 'i' };
  }
  if (filters.from || filters.to) {
    const createdAt: { $gte?: Date; $lte?: Date } = {};
    if (filters.from) createdAt.$gte = filters.from;
    if (filters.to) createdAt.$lte = filters.to;
    query.createdAt = createdAt;
  }
  if (filters.search && filters.search.length > 0) {
    const trimmed = filters.search.slice(0, MAX_SEARCH_LENGTH);
    const safe = escapeRegex(trimmed);
    query.$or = [
      { actorName: { $regex: safe, $options: 'i' } },
      { targetName: { $regex: safe, $options: 'i' } },
      { capability: { $regex: safe, $options: 'i' } },
    ];
  }

  return query;
}

function clampLimit(limit?: number): number {
  if (!limit || Number.isNaN(limit) || limit < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), MAX_LIMIT);
}

export function createAuditLogMethods(mongoose: typeof import('mongoose')): AuditLogMethods {
  async function recordAuditEntry(input: RecordAuditEntryInput): Promise<IAuditLog | null> {
    const AuditLog = mongoose.models.AuditLog as Model<IAuditLog>;
    try {
      const doc = await AuditLog.create({
        action: input.action,
        actorId: input.actorId,
        actorName: input.actorName,
        targetPrincipalType: input.targetPrincipalType,
        targetPrincipalId: input.targetPrincipalId,
        targetName: input.targetName,
        capability: input.capability,
        ...(input.tenantId != null && { tenantId: input.tenantId }),
      });
      return doc;
    } catch (err) {
      /**
       * Audit emission must never block a privileged operation, so a failed
       * write returns null instead of throwing. The structured payload below
       * is the only forensic trail when downstream alerting flags the
       * `failed to record audit entry` message.
       */
      logger.error('[auditLog] failed to record audit entry', {
        action: input.action,
        capability: input.capability,
        tenantId: input.tenantId,
        actorId:
          typeof input.actorId === 'string' ? input.actorId : (input.actorId?.toString?.() ?? null),
        targetPrincipalType: input.targetPrincipalType,
        targetPrincipalId:
          typeof input.targetPrincipalId === 'string'
            ? input.targetPrincipalId
            : (input.targetPrincipalId?.toString?.() ?? null),
        err,
      });
      return null;
    }
  }

  async function listAuditLogPage(
    tenantId: string | undefined,
    filters: AuditLogFilters,
  ): Promise<AuditLogPage> {
    const AuditLog = mongoose.models.AuditLog as Model<IAuditLog>;
    const limit = clampLimit(filters.limit);
    const offset = filters.offset && filters.offset > 0 ? Math.floor(filters.offset) : 0;
    const query = buildFilter(tenantId, filters);

    const [rows, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ createdAt: -1, _id: -1 })
        .skip(offset)
        .limit(limit)
        .lean<IAuditLog[]>(),
      AuditLog.countDocuments(query),
    ]);

    return {
      entries: rows.map(toWire),
      total,
    };
  }

  async function findAuditLogEntry(
    tenantId: string | undefined,
    id: string,
  ): Promise<AdminAuditLogEntry | null> {
    if (!/^[a-fA-F0-9]{24}$/.test(id)) return null;
    const AuditLog = mongoose.models.AuditLog as Model<IAuditLog>;
    const query: FilterQuery<IAuditLog> = { _id: id, ...tenantFilter(tenantId) };
    const doc = await AuditLog.findOne(query).lean<IAuditLog>();
    return doc ? toWire(doc) : null;
  }

  async function streamAuditLogEntries(
    tenantId: string | undefined,
    filters: Omit<AuditLogFilters, 'offset' | 'limit'>,
    onEntry: (entry: AdminAuditLogEntry) => void | Promise<void>,
    options?: { isCancelled?: () => boolean },
  ): Promise<number> {
    const AuditLog = mongoose.models.AuditLog as Model<IAuditLog>;
    const query = buildFilter(tenantId, filters);
    const cursor = AuditLog.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .lean<IAuditLog[]>()
      .cursor({ batchSize: 500 });

    const isCancelled = options?.isCancelled;
    let count = 0;
    try {
      for await (const doc of cursor) {
        if (isCancelled?.()) {
          await cursor.close();
          break;
        }
        await onEntry(toWire(doc));
        count++;
      }
    } finally {
      await cursor.close().catch(() => undefined);
    }
    return count;
  }

  return {
    recordAuditEntry,
    listAuditLogPage,
    findAuditLogEntry,
    streamAuditLogEntries,
  };
}
