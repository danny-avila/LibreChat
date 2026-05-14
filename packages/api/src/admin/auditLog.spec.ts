import { EventEmitter } from 'events';
import { Types } from 'mongoose';
import { PrincipalType } from 'librechat-data-provider';
import type { AdminAuditLogEntry, AuditLogPage } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
import type { AdminAuditLogDeps } from './auditLog';
import { createAdminAuditLogHandlers } from './auditLog';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const validObjectId = new Types.ObjectId().toString();

function mockEntry(overrides: Partial<AdminAuditLogEntry> = {}): AdminAuditLogEntry {
  return {
    id: new Types.ObjectId().toString(),
    action: 'grant_assigned',
    actorId: new Types.ObjectId().toString(),
    actorName: 'Alice Admin',
    targetPrincipalType: PrincipalType.USER,
    targetPrincipalId: new Types.ObjectId().toString(),
    targetName: 'Bob User',
    capability: 'manage:users',
    timestamp: new Date('2025-01-15T10:30:00.000Z').toISOString(),
    ...overrides,
  };
}

function createReqRes(
  overrides: {
    params?: Record<string, string>;
    query?: Record<string, string | string[]>;
    user?: { _id?: Types.ObjectId; id?: string; role?: string; tenantId?: string } | undefined;
  } = {},
) {
  const req = {
    params: overrides.params ?? {},
    query: overrides.query ?? {},
    body: {},
    user: 'user' in overrides ? overrides.user : { _id: new Types.ObjectId(), role: 'admin' },
  } as unknown as ServerRequest;

  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;

  return { req, res, status, json };
}

interface CsvCaptureContext {
  req: ServerRequest;
  res: Response;
  emitter: EventEmitter;
  reqEmitter: EventEmitter;
  chunks: string[];
  endCalled: () => boolean;
  emitClose: () => void;
}

/**
 * Wraps the request/response in EventEmitter shims so the streaming
 * handler can register `close` / `aborted` / `drain` listeners and the
 * test can drive them.
 */
function createCsvContext(
  overrides: {
    query?: Record<string, string | string[]>;
    user?: { _id?: Types.ObjectId; id?: string; role?: string; tenantId?: string } | undefined;
    writeReturns?: boolean;
  } = {},
): CsvCaptureContext {
  const emitter = new EventEmitter();
  const reqEmitter = new EventEmitter();
  const chunks: string[] = [];
  let ended = false;

  const res = Object.assign(emitter, {
    setHeader: jest.fn(),
    write: jest.fn((chunk: string) => {
      chunks.push(chunk);
      return overrides.writeReturns ?? true;
    }),
    end: jest.fn(() => {
      ended = true;
    }),
    headersSent: false,
    status: jest.fn().mockReturnValue({ json: jest.fn() }),
    removeListener: emitter.removeListener.bind(emitter),
  }) as unknown as Response;

  const req = Object.assign(reqEmitter, {
    params: {},
    query: overrides.query ?? {},
    body: {},
    user: 'user' in overrides ? overrides.user : { _id: new Types.ObjectId(), role: 'admin' },
    removeListener: reqEmitter.removeListener.bind(reqEmitter),
  }) as unknown as ServerRequest;

  return {
    req,
    res,
    emitter,
    reqEmitter,
    chunks,
    endCalled: () => ended,
    emitClose: () => emitter.emit('close'),
  };
}

function createDeps(overrides: Partial<AdminAuditLogDeps> = {}): AdminAuditLogDeps {
  return {
    listAuditLogPage: jest
      .fn<Promise<AuditLogPage>, unknown[]>()
      .mockResolvedValue({ entries: [], total: 0 }),
    findAuditLogEntry: jest
      .fn<Promise<AdminAuditLogEntry | null>, unknown[]>()
      .mockResolvedValue(null),
    streamAuditLogEntries: jest.fn<Promise<number>, unknown[]>().mockResolvedValue(0),
    ...overrides,
  };
}

describe('createAdminAuditLogHandlers', () => {
  describe('listAuditLog', () => {
    it('returns 401 when req.user is missing', async () => {
      const deps = createDeps();
      const handlers = createAdminAuditLogHandlers(deps);
      const { req, res, status, json } = createReqRes({ user: undefined });

      await handlers.listAuditLog(req, res);

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('returns 200 with the page payload', async () => {
      const entries = [mockEntry()];
      const deps = createDeps({
        listAuditLogPage: jest.fn().mockResolvedValue({ entries, total: 1 }),
      });
      const handlers = createAdminAuditLogHandlers(deps);
      const { req, res, status, json } = createReqRes();

      await handlers.listAuditLog(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ entries, total: 1 });
    });

    it('rejects malformed `from` with 400', async () => {
      const deps = createDeps();
      const handlers = createAdminAuditLogHandlers(deps);
      const { req, res, status, json } = createReqRes({ query: { from: '2025-01-01 10:00' } });

      await handlers.listAuditLog(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json.mock.calls[0][0].error).toMatch(/from/);
      expect(deps.listAuditLogPage).not.toHaveBeenCalled();
    });

    it('rejects local-time ISO without a zone offset', async () => {
      const deps = createDeps();
      const handlers = createAdminAuditLogHandlers(deps);
      const { req, res, status } = createReqRes({ query: { to: '2025-01-01T10:00:00' } });

      await handlers.listAuditLog(req, res);

      expect(status).toHaveBeenCalledWith(400);
    });

    it('accepts ISO timestamps with a `+HH:MM` offset', async () => {
      const deps = createDeps();
      const handlers = createAdminAuditLogHandlers(deps);
      const { req, res, status } = createReqRes({
        query: { from: '2025-01-01T10:00:00+02:00' },
      });

      await handlers.listAuditLog(req, res);

      expect(status).toHaveBeenCalledWith(200);
    });

    it('widens a date-only `to` filter to the end of the day UTC', async () => {
      const deps = createDeps();
      const handlers = createAdminAuditLogHandlers(deps);
      const { req, res } = createReqRes({ query: { to: '2025-01-15' } });

      await handlers.listAuditLog(req, res);

      const filtersArg = (deps.listAuditLogPage as jest.Mock).mock.calls[0][1];
      expect(filtersArg.to).toBeInstanceOf(Date);
      expect((filtersArg.to as Date).toISOString()).toBe('2025-01-15T23:59:59.999Z');
    });

    it('leaves a full ISO `to` timestamp exact (no day-boundary widening)', async () => {
      const deps = createDeps();
      const handlers = createAdminAuditLogHandlers(deps);
      const { req, res } = createReqRes({ query: { to: '2025-01-15T08:30:00Z' } });

      await handlers.listAuditLog(req, res);

      const filtersArg = (deps.listAuditLogPage as jest.Mock).mock.calls[0][1];
      expect((filtersArg.to as Date).toISOString()).toBe('2025-01-15T08:30:00.000Z');
    });

    it('rejects when `from` is later than `to`', async () => {
      const deps = createDeps();
      const handlers = createAdminAuditLogHandlers(deps);
      const { req, res, status, json } = createReqRes({
        query: { from: '2025-12-31', to: '2025-01-01' },
      });

      await handlers.listAuditLog(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json.mock.calls[0][0].error).toMatch(/from.*to/);
      expect(deps.listAuditLogPage).not.toHaveBeenCalled();
    });

    it('rejects limit > 500 with 400', async () => {
      const deps = createDeps();
      const handlers = createAdminAuditLogHandlers(deps);
      const { req, res, status, json } = createReqRes({ query: { limit: '501' } });

      await handlers.listAuditLog(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json.mock.calls[0][0].error).toMatch(/limit/);
    });

    it('rejects negative offset with 400', async () => {
      const deps = createDeps();
      const handlers = createAdminAuditLogHandlers(deps);
      const { req, res, status, json } = createReqRes({ query: { offset: '-1' } });

      await handlers.listAuditLog(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json.mock.calls[0][0].error).toMatch(/offset/);
    });

    it('rejects an unknown `action` with 400', async () => {
      const deps = createDeps();
      const handlers = createAdminAuditLogHandlers(deps);
      const { req, res, status, json } = createReqRes({ query: { action: 'invalid_action' } });

      await handlers.listAuditLog(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json.mock.calls[0][0].error).toMatch(/action/i);
    });

    it('rejects an unknown `targetPrincipalType` with 400', async () => {
      const deps = createDeps();
      const handlers = createAdminAuditLogHandlers(deps);
      const { req, res, status, json } = createReqRes({
        query: { targetPrincipalType: 'unknown' },
      });

      await handlers.listAuditLog(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json.mock.calls[0][0].error).toMatch(/targetPrincipalType/);
    });

    it('uses caller.tenantId from req.user and ignores forged `tenantId` query', async () => {
      const deps = createDeps();
      const handlers = createAdminAuditLogHandlers(deps);
      const { req, res } = createReqRes({
        query: { tenantId: 'attacker-tenant' } as Record<string, string>,
        user: { _id: new Types.ObjectId(), role: 'admin', tenantId: 'real-tenant' },
      });

      await handlers.listAuditLog(req, res);

      expect(deps.listAuditLogPage).toHaveBeenCalledWith('real-tenant', expect.any(Object));
      const tenantArg = (deps.listAuditLogPage as jest.Mock).mock.calls[0][0];
      expect(tenantArg).toBe('real-tenant');
    });

    it('forwards `actorQuery` / `targetQuery` straight through', async () => {
      const deps = createDeps();
      const handlers = createAdminAuditLogHandlers(deps);
      const { req, res } = createReqRes({
        query: { actorQuery: 'alice', targetQuery: 'bob' },
      });

      await handlers.listAuditLog(req, res);

      expect(deps.listAuditLogPage).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ actorQuery: 'alice', targetQuery: 'bob' }),
      );
    });

    it('maps deprecated `actorId` to `actorQuery` and `targetPrincipalId` to `targetQuery`', async () => {
      const deps = createDeps();
      const handlers = createAdminAuditLogHandlers(deps);
      const { req, res } = createReqRes({
        query: { actorId: 'alice', targetPrincipalId: 'bob' },
      });

      await handlers.listAuditLog(req, res);

      expect(deps.listAuditLogPage).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ actorQuery: 'alice', targetQuery: 'bob' }),
      );
    });

    it('returns 500 when the dep throws', async () => {
      const deps = createDeps({
        listAuditLogPage: jest.fn().mockRejectedValue(new Error('db down')),
      });
      const handlers = createAdminAuditLogHandlers(deps);
      const { req, res, status, json } = createReqRes();

      await handlers.listAuditLog(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Failed to fetch audit log' });
    });
  });

  describe('getAuditLogEntry', () => {
    it('returns 401 when req.user is missing', async () => {
      const deps = createDeps();
      const handlers = createAdminAuditLogHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { id: validObjectId },
        user: undefined,
      });

      await handlers.getAuditLogEntry(req, res);

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('returns 400 when id is not a 24-char hex ObjectId', async () => {
      const deps = createDeps();
      const handlers = createAdminAuditLogHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { id: 'not-an-objectid' } });

      await handlers.getAuditLogEntry(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Invalid id' });
      expect(deps.findAuditLogEntry).not.toHaveBeenCalled();
    });

    it('returns 404 when the dep returns null', async () => {
      const deps = createDeps({
        findAuditLogEntry: jest.fn().mockResolvedValue(null),
      });
      const handlers = createAdminAuditLogHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { id: validObjectId } });

      await handlers.getAuditLogEntry(req, res);

      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith({ error: 'Not found' });
    });

    it('returns 200 with the entry payload', async () => {
      const entry = mockEntry();
      const deps = createDeps({
        findAuditLogEntry: jest.fn().mockResolvedValue(entry),
      });
      const handlers = createAdminAuditLogHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { id: validObjectId } });

      await handlers.getAuditLogEntry(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ entry });
    });

    it('passes caller.tenantId, not a query param tenantId, to the dep', async () => {
      const entry = mockEntry();
      const deps = createDeps({
        findAuditLogEntry: jest.fn().mockResolvedValue(entry),
      });
      const handlers = createAdminAuditLogHandlers(deps);
      const { req, res } = createReqRes({
        params: { id: validObjectId },
        query: { tenantId: 'attacker' } as Record<string, string>,
        user: { _id: new Types.ObjectId(), role: 'admin', tenantId: 'real-tenant' },
      });

      await handlers.getAuditLogEntry(req, res);

      expect(deps.findAuditLogEntry).toHaveBeenCalledWith('real-tenant', validObjectId);
    });
  });

  describe('exportAuditLogCsv', () => {
    it('returns 401 when req.user is missing', async () => {
      const deps = createDeps();
      const handlers = createAdminAuditLogHandlers(deps);
      const { req, res, status, json } = createReqRes({ user: undefined });

      await handlers.exportAuditLogCsv(req, res);

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('emits BOM as the first chunk and CRLF line endings', async () => {
      const entry = mockEntry();
      const deps = createDeps({
        streamAuditLogEntries: jest.fn(async (_t, _f, onEntry) => {
          await (onEntry as (e: AdminAuditLogEntry) => Promise<void>)(entry);
          return 1;
        }),
      });
      const handlers = createAdminAuditLogHandlers(deps);
      const ctx = createCsvContext();

      await handlers.exportAuditLogCsv(ctx.req, ctx.res);

      expect(ctx.chunks[0]).toBe('﻿');
      expect(ctx.chunks).toContain('\r\n');
      expect(ctx.endCalled()).toBe(true);
    });

    it('writes a header row matching the column labels', async () => {
      const deps = createDeps();
      const handlers = createAdminAuditLogHandlers(deps);
      const ctx = createCsvContext();

      await handlers.exportAuditLogCsv(ctx.req, ctx.res);

      const header = ctx.chunks[1];
      expect(header).toBe(
        'Timestamp,Action,Actor,Actor ID,Target type,Target ID,Target,Capability',
      );
    });

    it('escapes commas, quotes, and newlines inside cells', async () => {
      const entry = mockEntry({
        actorName: 'Alice "Quoted", Admin',
        targetName: 'multi\nline target',
      });
      const deps = createDeps({
        streamAuditLogEntries: jest.fn(async (_t, _f, onEntry) => {
          await (onEntry as (e: AdminAuditLogEntry) => Promise<void>)(entry);
          return 1;
        }),
      });
      const handlers = createAdminAuditLogHandlers(deps);
      const ctx = createCsvContext();

      await handlers.exportAuditLogCsv(ctx.req, ctx.res);

      const rowChunk = ctx.chunks.find((c) => c.includes('Alice') && c.includes('Quoted'));
      expect(rowChunk).toBeDefined();
      expect(rowChunk).toContain('"Alice ""Quoted"", Admin"');
      expect(rowChunk).toContain('"multi\nline target"');
    });

    it('defangs formula-injection prefixes (= + - @ tab CR) by quoting the cell', async () => {
      const cases: string[] = ['=SUM(A1)', '+1+1', '-1+2', '@SUM(A1)', '\tTAB', '\rCR'];
      for (const dangerous of cases) {
        const entry = mockEntry({ actorName: dangerous });
        const deps = createDeps({
          streamAuditLogEntries: jest.fn(async (_t, _f, onEntry) => {
            await (onEntry as (e: AdminAuditLogEntry) => Promise<void>)(entry);
            return 1;
          }),
        });
        const handlers = createAdminAuditLogHandlers(deps);
        const ctx = createCsvContext();

        await handlers.exportAuditLogCsv(ctx.req, ctx.res);

        const rowChunk = ctx.chunks.find(
          (c) => c.includes("'") && c.includes(dangerous.replace(/[\r\n]/g, '')),
        );
        expect(rowChunk).toBeDefined();
        const expectedGuarded = `'${dangerous}`;
        expect(rowChunk).toContain(
          expectedGuarded.includes(',') ? `"${expectedGuarded}"` : expectedGuarded,
        );
      }
    });

    it('passes isCancelled to the stream dep and flips to true when client aborts mid-stream', async () => {
      let capturedIsCancelled: (() => boolean) | undefined;
      const deps = createDeps({
        streamAuditLogEntries: jest.fn(async (_t, _f, _onEntry, options) => {
          capturedIsCancelled = (options as { isCancelled?: () => boolean })?.isCancelled;
          expect(capturedIsCancelled?.()).toBe(false);
          ctx.emitClose();
          expect(capturedIsCancelled?.()).toBe(true);
          return 0;
        }),
      });
      const handlers = createAdminAuditLogHandlers(deps);
      const ctx = createCsvContext();

      await handlers.exportAuditLogCsv(ctx.req, ctx.res);

      expect(capturedIsCancelled).toBeDefined();
    });

    it('skips res.end when the client has already disconnected mid-stream', async () => {
      const deps = createDeps({
        streamAuditLogEntries: jest.fn(async (_t, _f, _onEntry, _options) => {
          ctx.emitClose();
          return 0;
        }),
      });
      const handlers = createAdminAuditLogHandlers(deps);
      const ctx = createCsvContext();

      await handlers.exportAuditLogCsv(ctx.req, ctx.res);

      expect(ctx.endCalled()).toBe(false);
    });

    it('rejects malformed `from` with 400 before opening the stream', async () => {
      const deps = createDeps();
      const handlers = createAdminAuditLogHandlers(deps);
      const { req, res, status, json } = createReqRes({ query: { from: 'not-a-date' } });

      await handlers.exportAuditLogCsv(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json.mock.calls[0][0].error).toMatch(/from/);
      expect(deps.streamAuditLogEntries).not.toHaveBeenCalled();
    });

    it('passes a maxRows cap into the stream call', async () => {
      const deps = createDeps();
      const handlers = createAdminAuditLogHandlers(deps);
      const ctx = createCsvContext();

      await handlers.exportAuditLogCsv(ctx.req, ctx.res);

      const optionsArg = (deps.streamAuditLogEntries as jest.Mock).mock.calls[0][3];
      expect(optionsArg).toEqual(
        expect.objectContaining({ maxRows: expect.any(Number) }),
      );
      expect(optionsArg.maxRows).toBeGreaterThan(0);
    });

    it('closes the response cleanly when the stream throws after headers are sent', async () => {
      const entry = mockEntry();
      const deps = createDeps({
        streamAuditLogEntries: jest.fn(async (_t, _f, onEntry) => {
          await (onEntry as (e: AdminAuditLogEntry) => Promise<void>)(entry);
          throw new Error('cursor exploded mid-stream');
        }),
      });
      const handlers = createAdminAuditLogHandlers(deps);
      const ctx = createCsvContext();
      /** Headers were already sent by the BOM / header write before the throw,
       * so the catch block must use res.end() instead of trying to send JSON. */
      (ctx.res as unknown as { headersSent: boolean }).headersSent = true;

      await handlers.exportAuditLogCsv(ctx.req, ctx.res);

      expect(ctx.endCalled()).toBe(true);
      const statusMock = (ctx.res as unknown as { status: jest.Mock }).status;
      expect(statusMock).not.toHaveBeenCalled();
    });
  });
});
