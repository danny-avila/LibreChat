/**
 * Coverage for the new GET /files/:file_id/preview endpoint.
 *
 * Two-phase code-execution flow: phase-1 emits a file record at
 * `status: 'pending'`; phase-2 transitions it to `'ready'` (with text)
 * or `'failed'` (with previewError). The frontend polls this endpoint
 * until status is terminal. This suite asserts the response shape
 * across all four states (pending, ready, failed, legacy/back-compat)
 * and the auth boundary (404 vs 403).
 */

jest.mock('@librechat/data-schemas', () => ({
  logger: { warn: jest.fn(), debug: jest.fn(), error: jest.fn(), info: jest.fn() },
  SystemCapabilities: {},
}));

jest.mock('@librechat/api', () => ({
  refreshS3FileUrls: jest.fn(),
  resolveUploadErrorMessage: jest.fn(),
  verifyAgentUploadPermission: jest.fn(),
}));

const mockFindFileById = jest.fn();
const mockGetFiles = jest.fn();
jest.mock('~/models', () => ({
  findFileById: (...args) => mockFindFileById(...args),
  getFiles: (...args) => mockGetFiles(...args),
  getAgents: jest.fn().mockResolvedValue([]),
  batchUpdateFiles: jest.fn(),
}));

jest.mock('~/server/services/Files/process', () => ({
  filterFile: jest.fn(),
  processFileUpload: jest.fn(),
  processDeleteRequest: jest.fn(),
  processAgentFileUpload: jest.fn(),
}));

jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(() => ({})),
}));

jest.mock('~/server/controllers/assistants/helpers', () => ({
  getOpenAIClient: jest.fn(),
}));

jest.mock('~/server/middleware/roles/capabilities', () => ({
  hasCapability: jest.fn(() => (_req, _res, next) => next()),
}));

jest.mock('~/server/services/PermissionService', () => ({
  checkPermission: jest.fn(() => (_req, _res, next) => next()),
  getEffectivePermissions: jest.fn().mockResolvedValue(0),
}));

jest.mock('~/server/services/Files', () => ({
  hasAccessToFilesViaAgent: jest.fn(),
}));

jest.mock('~/server/utils/files', () => ({
  cleanFileName: (name) => name,
}));

jest.mock('~/cache', () => ({
  getLogStores: jest.fn(() => ({ get: jest.fn(), set: jest.fn() })),
}));

const express = require('express');
const request = require('supertest');
const filesRouter = require('./files');

/**
 * Mount the router with a per-request user injector so we can simulate
 * a logged-in user without spinning up the full auth stack.
 */
function buildApp({ user = { id: 'user-123', role: 'user' } } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    req.config = { fileStrategy: 'local' };
    next();
  });
  app.use('/files', filesRouter);
  return app;
}

const OWNER_USER_ID = 'user-123';

describe('GET /files/:file_id/preview', () => {
  beforeEach(() => {
    mockFindFileById.mockReset();
    mockGetFiles.mockReset();
  });

  it('returns 404 when the file does not exist (auth check fails first via fileAccess)', async () => {
    /* `fileAccess` middleware does its own getFiles lookup and returns
     * 404 before our handler ever runs. This test asserts the boundary
     * lives there, not that the handler duplicates the check. */
    mockGetFiles.mockResolvedValueOnce([]);
    const res = await request(buildApp()).get('/files/missing-id/preview');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'Not Found' });
    expect(mockFindFileById).not.toHaveBeenCalled();
  });

  it('returns 403 when the requester does not own the file and has no agent-based access', async () => {
    /* fileAccess returns 403 — the file exists but belongs to someone
     * else and no agent grants access. The preview handler should
     * never run. */
    mockGetFiles.mockResolvedValueOnce([
      { file_id: 'someone-elses', user: 'other-user', filename: 'x.xlsx' },
    ]);
    const res = await request(buildApp()).get('/files/someone-elses/preview');
    expect(res.status).toBe(403);
    expect(mockFindFileById).not.toHaveBeenCalled();
  });

  it('returns status:pending without text/textFormat while phase-2 is in flight', async () => {
    mockGetFiles.mockResolvedValueOnce([
      { file_id: 'fid-pending', user: OWNER_USER_ID, filename: 'data.xlsx' },
    ]);
    mockFindFileById.mockResolvedValueOnce({
      file_id: 'fid-pending',
      status: 'pending',
      text: null,
      textFormat: null,
    });
    const res = await request(buildApp()).get('/files/fid-pending/preview');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ file_id: 'fid-pending', status: 'pending' });
    /* Critical: pending must NOT leak `text` even if a stale value
     * exists on the record. The client gates routing on status. */
    expect(res.body).not.toHaveProperty('text');
    expect(res.body).not.toHaveProperty('textFormat');
    expect(res.body).not.toHaveProperty('previewError');
  });

  it('returns status:ready with text + textFormat when phase-2 succeeded', async () => {
    mockGetFiles.mockResolvedValueOnce([
      { file_id: 'fid-ready', user: OWNER_USER_ID, filename: 'data.xlsx' },
    ]);
    mockFindFileById.mockResolvedValueOnce({
      file_id: 'fid-ready',
      status: 'ready',
      text: '<table><tr><td>1</td></tr></table>',
      textFormat: 'html',
    });
    const res = await request(buildApp()).get('/files/fid-ready/preview');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      file_id: 'fid-ready',
      status: 'ready',
      text: '<table><tr><td>1</td></tr></table>',
      textFormat: 'html',
    });
  });

  it('returns status:failed with previewError when phase-2 errored', async () => {
    mockGetFiles.mockResolvedValueOnce([
      { file_id: 'fid-failed', user: OWNER_USER_ID, filename: 'data.xlsx' },
    ]);
    mockFindFileById.mockResolvedValueOnce({
      file_id: 'fid-failed',
      status: 'failed',
      text: null,
      textFormat: null,
      previewError: 'parser-error',
    });
    const res = await request(buildApp()).get('/files/fid-failed/preview');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      file_id: 'fid-failed',
      status: 'failed',
      previewError: 'parser-error',
    });
    expect(res.body).not.toHaveProperty('text');
    expect(res.body).not.toHaveProperty('textFormat');
  });

  it('defaults to status:ready for legacy records with no status field (back-compat)', async () => {
    /* Records pre-dating PR #12957 have no `status` field. The endpoint
     * MUST treat that as 'ready' so legacy code-execution attachments
     * don't suddenly poll forever. If text exists, surface it. */
    mockGetFiles.mockResolvedValueOnce([
      { file_id: 'fid-legacy', user: OWNER_USER_ID, filename: 'old.csv' },
    ]);
    mockFindFileById.mockResolvedValueOnce({
      file_id: 'fid-legacy',
      // status intentionally absent
      text: 'csv,header\n1,2',
      textFormat: 'text',
    });
    const res = await request(buildApp()).get('/files/fid-legacy/preview');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      file_id: 'fid-legacy',
      status: 'ready',
      text: 'csv,header\n1,2',
      textFormat: 'text',
    });
  });

  it('returns status:ready with no text when the record is ready but text is null (binary/oversized)', async () => {
    /* Non-office files (binary, oversized, etc.) complete phase-1 with
     * `text: null` and no `status` field. The endpoint surfaces them
     * as ready with no text — frontend renders download-only. */
    mockGetFiles.mockResolvedValueOnce([
      { file_id: 'fid-binary', user: OWNER_USER_ID, filename: 'image.bin' },
    ]);
    mockFindFileById.mockResolvedValueOnce({
      file_id: 'fid-binary',
      text: null,
      textFormat: null,
    });
    const res = await request(buildApp()).get('/files/fid-binary/preview');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ file_id: 'fid-binary', status: 'ready' });
  });

  it('returns 404 if findFileById returns null even after fileAccess passed (race with delete)', async () => {
    /* fileAccess sees the file via getFiles, but findFileById returns
     * null because a concurrent delete just removed it. Don't 500 —
     * return 404 so the client stops polling. */
    mockGetFiles.mockResolvedValueOnce([
      { file_id: 'fid-race', user: OWNER_USER_ID, filename: 'data.xlsx' },
    ]);
    mockFindFileById.mockResolvedValueOnce(null);
    const res = await request(buildApp()).get('/files/fid-race/preview');
    expect(res.status).toBe(404);
  });

  it('returns 500 with a stable shape if findFileById throws unexpectedly', async () => {
    mockGetFiles.mockResolvedValueOnce([
      { file_id: 'fid-boom', user: OWNER_USER_ID, filename: 'data.xlsx' },
    ]);
    mockFindFileById.mockRejectedValueOnce(new Error('mongo down'));
    const res = await request(buildApp()).get('/files/fid-boom/preview');
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: 'Internal Server Error' });
  });
});
