import { PrincipalType } from 'librechat-data-provider';
import {
  AUDIT_ACTIONS,
  logger,
  MAX_AUDIT_EXPORT_ROWS,
  MAX_AUDIT_LOG_LIMIT,
} from '@librechat/data-schemas';
import type {
  AdminAuditLogEntry,
  AuditAction,
  AuditLogFilters,
  AuditLogPage,
} from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';

const FORMULA_PREFIX = /^[=+\-@\t\r]/;
const CSV_BOM = '﻿';

const VALID_ACTIONS = new Set<AuditAction>(AUDIT_ACTIONS);
const VALID_PRINCIPAL_TYPES = new Set<string>(Object.values(PrincipalType));

/**
 * Accepts `YYYY-MM-DD` (interpreted as UTC by the downstream Date parse) or a
 * full ISO 8601 / RFC 3339 timestamp that includes either `Z` or a `±HH:MM`
 * offset. Local-time strings without a zone are rejected so every input maps
 * to an unambiguous instant.
 */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/;
const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

export interface AdminAuditLogDeps {
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
    options?: { isCancelled?: () => boolean; maxRows?: number },
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

function parseActionFilter(raw: unknown):
  | {
      ok: true;
      value: AuditAction[] | undefined;
    }
  | { ok: false; error: string } {
  const arr = asStringArray(raw);
  if (!arr || arr.length === 0) return { ok: true, value: undefined };
  const invalid = arr.find((a) => !VALID_ACTIONS.has(a as AuditAction));
  if (invalid != null) {
    return { ok: false, error: `Unknown action: ${invalid}` };
  }
  return { ok: true, value: arr as AuditAction[] };
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses a filter date. `boundary` controls how a bare `YYYY-MM-DD` is widened:
 * `start` leaves it at the beginning of the day (00:00:00.000Z, the default for
 * `from`), `end` snaps it to 23:59:59.999Z so that a `to=2025-01-15` filter
 * actually includes everything that occurred on January 15 instead of cutting
 * off at midnight. Full ISO timestamps are honored exactly regardless.
 */
function parseIsoDate(
  raw: unknown,
  boundary: 'start' | 'end' = 'start',
): { ok: true; value?: Date } | { ok: false; error: string } {
  if (raw == null || raw === '') return { ok: true, value: undefined };
  if (typeof raw !== 'string') return { ok: false, error: 'Date must be a string' };
  if (!ISO_DATE_RE.test(raw)) return { ok: false, error: 'Date must be ISO 8601' };
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return { ok: false, error: 'Invalid date' };
  if (boundary === 'end' && DATE_ONLY_RE.test(raw)) {
    d.setUTCHours(23, 59, 59, 999);
  }
  return { ok: true, value: d };
}

function parseLimit(
  raw: unknown,
): { ok: true; value: number | undefined } | { ok: false; error: string } {
  if (raw == null || raw === '') return { ok: true, value: undefined };
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return { ok: false, error: 'limit must be a number' };
  if (n < 1) return { ok: false, error: 'limit must be >= 1' };
  if (n > MAX_AUDIT_LOG_LIMIT)
    return { ok: false, error: `limit must be <= ${MAX_AUDIT_LOG_LIMIT}` };
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

function parsePrincipalType(
  raw: unknown,
): { ok: true; value: PrincipalType | undefined } | { ok: false; error: string } {
  if (raw == null || raw === '') return { ok: true, value: undefined };
  if (typeof raw !== 'string') return { ok: false, error: 'targetPrincipalType must be a string' };
  if (!VALID_PRINCIPAL_TYPES.has(raw)) {
    return { ok: false, error: `Unknown targetPrincipalType: ${raw}` };
  }
  return { ok: true, value: raw as PrincipalType };
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

const CSV_COLUMNS: ReadonlyArray<{ key: keyof AdminAuditLogEntry; label: string }> = [
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

function formatCsvRow(entry: AdminAuditLogEntry): string {
  return CSV_COLUMNS.map((c) => escapeCsvCell(String(entry[c.key] ?? ''))).join(',');
}

type ParsedFilters = Omit<AuditLogFilters, 'offset' | 'limit'>;

interface AuditLogQuery {
  search?: string;
  action?: string | string[];
  from?: string;
  to?: string;
  /** Substring match against the denormalized actor display name. */
  actorQuery?: string;
  /** @deprecated Use `actorQuery`. Still accepted as an alias. */
  actorId?: string;
  targetPrincipalType?: string;
  /** Substring match against the denormalized target display name. */
  targetQuery?: string;
  /** @deprecated Use `targetQuery`. Still accepted as an alias. */
  targetPrincipalId?: string;
  capability?: string;
  limit?: string;
  offset?: string;
}

/**
 * The HTTP filter keys `actorId`/`targetPrincipalId` were misnomers — they
 * never matched ObjectIds, they did case-insensitive substring matches on
 * the denormalized display names. The new keys `actorQuery`/`targetQuery`
 * describe what actually happens. The legacy names are accepted for one
 * release as deprecated aliases so the sibling admin-panel PR keeps working
 * while it migrates; each use emits a deprecation log.
 */
function readActorQuery(query: AuditLogQuery): string | undefined {
  if (query.actorQuery != null) return pickString(query.actorQuery, 128);
  if (query.actorId != null) {
    logger.warn(
      '[adminAuditLog] deprecated filter param `actorId` — rename to `actorQuery` (substring match on actorName)',
    );
    return pickString(query.actorId, 128);
  }
  return undefined;
}

function readTargetQuery(query: AuditLogQuery): string | undefined {
  if (query.targetQuery != null) return pickString(query.targetQuery, 128);
  if (query.targetPrincipalId != null) {
    logger.warn(
      '[adminAuditLog] deprecated filter param `targetPrincipalId` — rename to `targetQuery` (substring match on targetName)',
    );
    return pickString(query.targetPrincipalId, 128);
  }
  return undefined;
}

function parseFilters(
  query: AuditLogQuery,
): { ok: true; value: ParsedFilters } | { ok: false; error: string } {
  const from = parseIsoDate(query.from, 'start');
  if (!from.ok) return { ok: false, error: `from: ${from.error}` };
  const to = parseIsoDate(query.to, 'end');
  if (!to.ok) return { ok: false, error: `to: ${to.error}` };
  if (from.value && to.value && from.value > to.value) {
    return { ok: false, error: '`from` must be earlier than `to`' };
  }
  const action = parseActionFilter(query.action);
  if (!action.ok) return { ok: false, error: action.error };
  const targetPrincipalType = parsePrincipalType(query.targetPrincipalType);
  if (!targetPrincipalType.ok) return { ok: false, error: targetPrincipalType.error };
  return {
    ok: true,
    value: {
      search: pickString(query.search, 200),
      action: action.value,
      from: from.value,
      to: to.value,
      actorQuery: readActorQuery(query),
      targetPrincipalType: targetPrincipalType.value,
      targetQuery: readTargetQuery(query),
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

      /**
       * The socket-`close` listener is the canonical signal — it fires on
       * client TCP RST as well as on graceful end. `req.aborted` (deprecated)
       * is kept as a belt-and-braces fallback for Node versions that emit it
       * before the response sees `close`.
       */
      let clientAborted = false;
      const markAborted = () => {
        clientAborted = true;
      };
      res.once('close', markAborted);
      req.once('aborted', markAborted);
      const isCancelled = () => clientAborted;

      /**
       * Wait for `drain` when the kernel/socket buffer is full so we never
       * queue an unbounded amount of CSV in Node memory for slow consumers.
       * Race against `close` so a destroyed socket can't strand the handler
       * on a `drain` that will never fire.
       */
      const writeChunk = (chunk: string): Promise<void> => {
        if (clientAborted) return Promise.resolve();
        if (res.write(chunk)) return Promise.resolve();
        return new Promise<void>((resolve) => {
          const onDrain = () => {
            res.removeListener('close', onClose);
            resolve();
          };
          const onClose = () => {
            res.removeListener('drain', onDrain);
            resolve();
          };
          res.once('drain', onDrain);
          res.once('close', onClose);
        });
      };

      await writeChunk(CSV_BOM);
      await writeChunk(formatCsvHeader());
      await writeChunk('\r\n');

      await streamAuditLogEntries(
        caller.tenantId,
        filters.value,
        async (entry) => {
          if (clientAborted) return;
          await writeChunk(formatCsvRow(entry));
          await writeChunk('\r\n');
        },
        { isCancelled, maxRows: MAX_AUDIT_EXPORT_ROWS },
      );

      res.removeListener('close', markAborted);
      req.removeListener('aborted', markAborted);
      if (!clientAborted) res.end();
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
