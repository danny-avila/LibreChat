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
  cursor?: string;
  limit?: number;
}

export interface AuditLogPage {
  entries: AdminAuditLogEntryWire[];
  nextCursor: string | null;
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
    filters: Omit<AuditLogFilters, 'cursor' | 'limit'>,
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

function encodeCursor(id: Types.ObjectId): string {
  return Buffer.from(id.toString(), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): string | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    if (!/^[a-fA-F0-9]{24}$/.test(decoded)) return null;
    return decoded;
  } catch {
    return null;
  }
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
  if (filters.actorId) {
    query.actorId = filters.actorId;
  }
  if (filters.targetPrincipalType) {
    query.targetPrincipalType = filters.targetPrincipalType;
  }
  if (filters.targetPrincipalId) {
    query.targetPrincipalId = filters.targetPrincipalId;
  }
  if (filters.capability) {
    query.capability = filters.capability;
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
    const query = buildFilter(tenantId, filters);

    if (filters.cursor) {
      const cursorId = decodeCursor(filters.cursor);
      if (cursorId) {
        query._id = { $lt: cursorId };
      }
    }

    const rows = await AuditLog.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean<IAuditLog[]>();

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last._id) : null;

    return {
      entries: page.map(toWire),
      nextCursor,
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
    filters: Omit<AuditLogFilters, 'cursor' | 'limit'>,
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
