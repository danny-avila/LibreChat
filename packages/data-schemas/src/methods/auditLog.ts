import { PrincipalType } from 'librechat-data-provider';
import type { FilterQuery, Model, Types } from 'mongoose';
import type { AuditAction, IAuditLog } from '~/types';
import logger from '~/config/winston';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const MAX_SEARCH_LENGTH = 200;

export interface RecordAuditEntryInput {
  action: AuditAction;
  actorId: string | Types.ObjectId;
  actorName: string;
  targetPrincipalType: PrincipalType;
  targetPrincipalId: string | Types.ObjectId;
  targetName: string;
  capability: string;
  tenantId?: string;
}

export interface AuditLogFilters {
  search?: string;
  action?: AuditAction[];
  from?: Date;
  to?: Date;
  actorId?: string;
  targetPrincipalType?: PrincipalType;
  targetPrincipalId?: string;
  capability?: string;
  offset?: number;
  limit?: number;
}

export interface AuditLogPage {
  entries: AdminAuditLogEntryWire[];
  total: number;
}

/**
 * Wire shape returned to admin clients. `_id` is mapped to `id`, ObjectIds are
 * stringified, dates are ISO strings.
 */
export interface AdminAuditLogEntryWire {
  id: string;
  action: AuditAction;
  actorId: string;
  actorName: string;
  targetPrincipalType: PrincipalType;
  targetPrincipalId: string;
  targetName: string;
  capability: string;
  timestamp: string;
}

export interface AuditLogMethods {
  recordAuditEntry: (input: RecordAuditEntryInput) => Promise<IAuditLog | null>;
  listAuditLogPage: (
    tenantId: string | undefined,
    filters: AuditLogFilters,
  ) => Promise<AuditLogPage>;
  findAuditLogEntry: (
    tenantId: string | undefined,
    id: string,
  ) => Promise<AdminAuditLogEntryWire | null>;
  streamAuditLogEntries: (
    tenantId: string | undefined,
    filters: Omit<AuditLogFilters, 'offset' | 'limit'>,
    onEntry: (entry: AdminAuditLogEntryWire) => void | Promise<void>,
  ) => Promise<number>;
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toWire(doc: IAuditLog): AdminAuditLogEntryWire {
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
  return tenantId != null ? { tenantId } : { tenantId: { $exists: false } };
}

function buildFilter(
  tenantId: string | undefined,
  filters: AuditLogFilters,
): FilterQuery<IAuditLog> {
  const query: FilterQuery<IAuditLog> = { ...tenantFilter(tenantId) };

  if (filters.action && filters.action.length > 0) {
    query.action = filters.action.length === 1 ? filters.action[0] : { $in: filters.action };
  }
  // The `actorId` and `targetPrincipalId` filter params are matched against the
  // denormalized `actorName` / `targetName` fields with case-insensitive partial
  // regex — UI users want to filter by human name, not by Mongo ObjectId.
  if (filters.actorId) {
    query.actorName = { $regex: escapeRegex(filters.actorId), $options: 'i' };
  }
  if (filters.targetPrincipalType) {
    query.targetPrincipalType = filters.targetPrincipalType;
  }
  if (filters.targetPrincipalId) {
    query.targetName = { $regex: escapeRegex(filters.targetPrincipalId), $options: 'i' };
  }
  if (filters.capability) {
    query.capability = { $regex: escapeRegex(filters.capability), $options: 'i' };
  }
  if (filters.from || filters.to) {
    query.createdAt = {};
    if (filters.from) (query.createdAt as Record<string, Date>).$gte = filters.from;
    if (filters.to) (query.createdAt as Record<string, Date>).$lte = filters.to;
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
      logger.error(
        '[auditLog] failed to record audit entry',
        { action: input.action, capability: input.capability, tenantId: input.tenantId },
        err,
      );
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
  ): Promise<AdminAuditLogEntryWire | null> {
    if (!/^[a-fA-F0-9]{24}$/.test(id)) return null;
    const AuditLog = mongoose.models.AuditLog as Model<IAuditLog>;
    const query: FilterQuery<IAuditLog> = { _id: id, ...tenantFilter(tenantId) };
    const doc = await AuditLog.findOne(query).lean<IAuditLog>();
    return doc ? toWire(doc) : null;
  }

  async function streamAuditLogEntries(
    tenantId: string | undefined,
    filters: Omit<AuditLogFilters, 'offset' | 'limit'>,
    onEntry: (entry: AdminAuditLogEntryWire) => void | Promise<void>,
  ): Promise<number> {
    const AuditLog = mongoose.models.AuditLog as Model<IAuditLog>;
    const query = buildFilter(tenantId, filters);
    const cursor = AuditLog.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .lean<IAuditLog>()
      .cursor({ batchSize: 500 });

    let count = 0;
    for await (const doc of cursor) {
      await onEntry(toWire(doc as IAuditLog));
      count++;
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
