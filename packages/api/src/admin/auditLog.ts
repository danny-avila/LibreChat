import { PrincipalType } from 'librechat-data-provider';
import { logger } from '@librechat/data-schemas';
import type {
  AdminAuditLogEntryWire,
  AuditAction,
  AuditLogPage,
  RecordAuditEntryInput,
} from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';

const FORMULA_PREFIX = /^[=+\-@\t\r]/;
const CSV_BOM = '﻿';

const VALID_ACTIONS = new Set<AuditAction>(['grant_assigned', 'grant_removed']);
const VALID_PRINCIPAL_TYPES = new Set<string>(Object.values(PrincipalType));

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z?)?$/;
const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

export interface AdminAuditLogDeps {
  recordAuditEntry: (input: RecordAuditEntryInput) => Promise<unknown>;
  listAuditLogPage: (
    tenantId: string | undefined,
    filters: {
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
    },
  ) => Promise<AuditLogPage>;
  findAuditLogEntry: (
    tenantId: string | undefined,
    id: string,
  ) => Promise<AdminAuditLogEntryWire | null>;
  streamAuditLogEntries: (
    tenantId: string | undefined,
    filters: Parameters<AdminAuditLogDeps['listAuditLogPage']>[1],
    onEntry: (entry: AdminAuditLogEntryWire) => void | Promise<void>,
  ) => Promise<number>;
}

interface CallerContext {
  userId: string;
  role: string;
  tenantId?: string;
}

function resolveCaller(req: ServerRequest): CallerContext | null {
  const user = req.user;
  if (!user) return null;
  const userId = user._id?.toString() ?? user.id;
  if (!userId || !user.role) return null;
  return { userId, role: user.role, tenantId: user.tenantId };
}

function asStringArray(v: unknown): string[] | undefined {
  if (v == null) return undefined;
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string') return [v];
  return undefined;
}

function parseActionFilter(raw: unknown): AuditAction[] | undefined {
  const arr = asStringArray(raw);
  if (!arr || arr.length === 0) return undefined;
  const valid = arr.filter((a): a is AuditAction => VALID_ACTIONS.has(a as AuditAction));
  return valid.length ? valid : undefined;
}

function parseIsoDate(raw: unknown): { ok: true; value?: Date } | { ok: false; error: string } {
  if (raw == null || raw === '') return { ok: true, value: undefined };
  if (typeof raw !== 'string') return { ok: false, error: 'Date must be a string' };
  if (!ISO_DATE_RE.test(raw)) return { ok: false, error: 'Date must be ISO 8601' };
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return { ok: false, error: 'Invalid date' };
  return { ok: true, value: d };
}

function parseLimit(
  raw: unknown,
): { ok: true; value: number | undefined } | { ok: false; error: string } {
  if (raw == null || raw === '') return { ok: true, value: undefined };
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return { ok: false, error: 'limit must be a number' };
  if (n < 1) return { ok: false, error: 'limit must be >= 1' };
  if (n > 500) return { ok: false, error: 'limit must be <= 500' };
  return { ok: true, value: Math.floor(n) };
}

function parseOffset(
  raw: unknown,
): { ok: true; value: number | undefined } | { ok: false; error: string } {
  if (raw == null || raw === '') return { ok: true, value: undefined };
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return { ok: false, error: 'offset must be a number' };
  if (n < 0) return { ok: false, error: 'offset must be >= 0' };
  return { ok: true, value: Math.floor(n) };
}

function parsePrincipalType(raw: unknown): PrincipalType | undefined {
  if (typeof raw !== 'string' || !raw) return undefined;
  if (!VALID_PRINCIPAL_TYPES.has(raw)) return undefined;
  return raw as PrincipalType;
}

function pickString(raw: unknown, maxLen = 256): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

function escapeCsvCell(value: string): string {
  if (value === '') return '';
  const guarded = FORMULA_PREFIX.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

const CSV_COLUMNS: ReadonlyArray<{ key: keyof AdminAuditLogEntryWire; label: string }> = [
  { key: 'timestamp', label: 'Timestamp' },
  { key: 'action', label: 'Action' },
  { key: 'actorName', label: 'Actor' },
  { key: 'actorId', label: 'Actor ID' },
  { key: 'targetPrincipalType', label: 'Target type' },
  { key: 'targetPrincipalId', label: 'Target ID' },
  { key: 'targetName', label: 'Target' },
  { key: 'capability', label: 'Capability' },
];

function formatCsvHeader(): string {
  return CSV_COLUMNS.map((c) => escapeCsvCell(c.label)).join(',');
}

function formatCsvRow(entry: AdminAuditLogEntryWire): string {
  return CSV_COLUMNS.map((c) => escapeCsvCell(String(entry[c.key] ?? ''))).join(',');
}

interface ParsedFilters {
  search?: string;
  action?: AuditAction[];
  from?: Date;
  to?: Date;
  actorId?: string;
  targetPrincipalType?: PrincipalType;
  targetPrincipalId?: string;
  capability?: string;
}

interface AuditLogQuery {
  search?: string;
  action?: string | string[];
  from?: string;
  to?: string;
  actorId?: string;
  targetPrincipalType?: string;
  targetPrincipalId?: string;
  capability?: string;
  limit?: string;
  offset?: string;
}

function parseFilters(
  query: AuditLogQuery,
): { ok: true; value: ParsedFilters } | { ok: false; error: string } {
  const from = parseIsoDate(query.from);
  if (!from.ok) return { ok: false, error: `from: ${from.error}` };
  const to = parseIsoDate(query.to);
  if (!to.ok) return { ok: false, error: `to: ${to.error}` };
  return {
    ok: true,
    value: {
      search: pickString(query.search, 200),
      action: parseActionFilter(query.action),
      from: from.value,
      to: to.value,
      actorId: pickString(query.actorId, 128),
      targetPrincipalType: parsePrincipalType(query.targetPrincipalType),
      targetPrincipalId: pickString(query.targetPrincipalId, 128),
      capability: pickString(query.capability, 256),
    },
  };
}

export function createAdminAuditLogHandlers(deps: AdminAuditLogDeps) {
  const { listAuditLogPage, findAuditLogEntry, streamAuditLogEntries } = deps;

  async function listAuditLogHandler(req: ServerRequest, res: Response) {
    try {
      const caller = resolveCaller(req);
      if (!caller) return res.status(401).json({ error: 'Authentication required' });

      const query = req.query as AuditLogQuery;
      const filters = parseFilters(query);
      if (!filters.ok) return res.status(400).json({ error: filters.error });

      const limitResult = parseLimit(query.limit);
      if (!limitResult.ok) return res.status(400).json({ error: limitResult.error });
      const offsetResult = parseOffset(query.offset);
      if (!offsetResult.ok) return res.status(400).json({ error: offsetResult.error });

      const page = await listAuditLogPage(caller.tenantId, {
        ...filters.value,
        offset: offsetResult.value,
        limit: limitResult.value,
      });

      return res.status(200).json(page);
    } catch (err) {
      logger.error('[adminAuditLog] list error:', err);
      return res.status(500).json({ error: 'Failed to fetch audit log' });
    }
  }

  async function getAuditLogEntryHandler(req: ServerRequest, res: Response) {
    try {
      const caller = resolveCaller(req);
      if (!caller) return res.status(401).json({ error: 'Authentication required' });

      const { id } = req.params as { id?: string };
      if (!id || !OBJECT_ID_RE.test(id)) {
        return res.status(400).json({ error: 'Invalid id' });
      }

      const entry = await findAuditLogEntry(caller.tenantId, id);
      if (!entry) return res.status(404).json({ error: 'Not found' });
      return res.status(200).json({ entry });
    } catch (err) {
      logger.error('[adminAuditLog] get error:', err);
      return res.status(500).json({ error: 'Failed to fetch audit log entry' });
    }
  }

  async function exportAuditLogCsvHandler(req: ServerRequest, res: Response) {
    try {
      const caller = resolveCaller(req);
      if (!caller) return res.status(401).json({ error: 'Authentication required' });

      const filters = parseFilters(req.query as AuditLogQuery);
      if (!filters.ok) return res.status(400).json({ error: filters.error });

      const filenameStamp = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="audit-log-${filenameStamp}.csv"`);
      res.setHeader('Cache-Control', 'no-store');

      res.write(CSV_BOM);
      res.write(formatCsvHeader());
      res.write('\r\n');

      await streamAuditLogEntries(caller.tenantId, filters.value, (entry) => {
        res.write(formatCsvRow(entry));
        res.write('\r\n');
      });

      res.end();
    } catch (err) {
      logger.error('[adminAuditLog] export error:', err);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Failed to export audit log' });
      }
      res.end();
    }
  }

  return {
    listAuditLog: listAuditLogHandler,
    getAuditLogEntry: getAuditLogEntryHandler,
    exportAuditLogCsv: exportAuditLogCsvHandler,
  };
}
