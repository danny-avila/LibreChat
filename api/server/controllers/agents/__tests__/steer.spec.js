const express = require('express');
const request = require('supertest');

const mockHandleSteerRequest = jest.fn();
const mockLogger = { warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() };

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: mockLogger,
}));

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  handleSteerRequest: (...args) => mockHandleSteerRequest(...args),
}));

const SteerController = require('~/server/controllers/agents/steer');

/**
 * The guard ladder itself (validation, file sanitization, ownership, enqueue
 * codes) is typed logic in `@librechat/api` and is covered against the REAL
 * in-memory job manager by `packages/api/src/agents/steering/__tests__/request.spec.ts`.
 * This spec only pins the thin wrapper contract: pass-through of user/body,
 * verbatim status/body serialization, and the 500 failure envelope.
 */
function buildApp(user = { id: 'user-1', tenantId: 'tenant-1' }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  app.post('/chat/steer', SteerController);
  return app;
}

describe('SteerController (wrapper)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('serializes the handler result verbatim', async () => {
    mockHandleSteerRequest.mockResolvedValue({
      status: 202,
      body: { status: 'queued', steerId: 's1', position: 1, conversationId: 'c1' },
    });

    const res = await request(buildApp())
      .post('/chat/steer')
      .send({ conversationId: 'c1', text: 'hello', files: [{ file_id: 'f1' }] });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({
      status: 'queued',
      steerId: 's1',
      position: 1,
      conversationId: 'c1',
    });
    expect(mockHandleSteerRequest).toHaveBeenCalledWith(
      { id: 'user-1', tenantId: 'tenant-1' },
      { conversationId: 'c1', text: 'hello', files: [{ file_id: 'f1' }] },
    );
  });

  it('passes rejection statuses through untouched', async () => {
    mockHandleSteerRequest.mockResolvedValue({ status: 409, body: { code: 'RUN_PAUSED' } });

    const res = await request(buildApp()).post('/chat/steer').send({ conversationId: 'c1' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('RUN_PAUSED');
  });

  it('500s with STEER_FAILED when the handler throws', async () => {
    mockHandleSteerRequest.mockRejectedValue(new Error('store down'));

    const res = await request(buildApp())
      .post('/chat/steer')
      .send({ conversationId: 'c1', text: 'x' });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('STEER_FAILED');
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
