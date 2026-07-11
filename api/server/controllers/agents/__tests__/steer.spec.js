/**
 * Unit tests for the steer controller (POST /agents/chat/steer).
 *
 * Drives the real `SteerController` over supertest with `GenerationJobManager`
 * mocked. Covers the guard ladder (validation, SDK capability, job liveness,
 * ownership/tenant, paused state), the enqueue rejection codes, and the
 * 202 accepted shape.
 */

const express = require('express');
const request = require('supertest');

const USER_ID = 'user-1';
const TENANT_ID = 'tenant-1';
const CONVO_ID = 'convo-steer-123';

const mockLogger = {
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};

const mockEnqueue = jest.fn();
const mockGetJob = jest.fn();
const mockIsSteeringSupported = jest.fn(() => true);

const mockGenerationJobManager = {
  getJob: (...args) => mockGetJob(...args),
  steering: { enqueue: (...args) => mockEnqueue(...args) },
};

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: mockLogger,
}));

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  GenerationJobManager: mockGenerationJobManager,
  isSteeringSupported: (...args) => mockIsSteeringSupported(...args),
}));

const SteerController = require('~/server/controllers/agents/steer');

function buildApp(user = { id: USER_ID, tenantId: TENANT_ID }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  app.post('/chat/steer', SteerController);
  return app;
}

function runningJob(overrides = {}) {
  return {
    status: 'running',
    createdAt: Date.now(),
    metadata: { userId: USER_ID, tenantId: TENANT_ID },
    ...overrides,
  };
}

describe('SteerController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsSteeringSupported.mockReturnValue(true);
  });

  it('400s on a missing or placeholder conversationId', async () => {
    const app = buildApp();
    const missing = await request(app).post('/chat/steer').send({ text: 'hello' });
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('INVALID_CONVERSATION');

    const placeholder = await request(app)
      .post('/chat/steer')
      .send({ conversationId: 'new', text: 'hello' });
    expect(placeholder.status).toBe(400);
  });

  it('400s on empty or whitespace-only text', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/chat/steer')
      .send({ conversationId: CONVO_ID, text: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EMPTY_TEXT');
  });

  it('413s past the length cap', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/chat/steer')
      .send({ conversationId: CONVO_ID, text: 'x'.repeat(16001) });
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('STEER_TOO_LONG');
  });

  it('501s when the installed SDK cannot inject hook messages', async () => {
    mockIsSteeringSupported.mockReturnValue(false);
    const app = buildApp();
    const res = await request(app)
      .post('/chat/steer')
      .send({ conversationId: CONVO_ID, text: 'steer me' });
    expect(res.status).toBe(501);
    expect(res.body.code).toBe('STEER_UNSUPPORTED');
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('404s when the job is missing or terminal', async () => {
    const app = buildApp();
    mockGetJob.mockResolvedValueOnce(undefined);
    const missing = await request(app)
      .post('/chat/steer')
      .send({ conversationId: CONVO_ID, text: 'steer' });
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('NO_ACTIVE_RUN');

    mockGetJob.mockResolvedValueOnce(runningJob({ status: 'complete' }));
    const terminal = await request(app)
      .post('/chat/steer')
      .send({ conversationId: CONVO_ID, text: 'steer' });
    expect(terminal.status).toBe(404);
  });

  it('403s for another user or tenant', async () => {
    const app = buildApp();
    mockGetJob.mockResolvedValueOnce(runningJob({ metadata: { userId: 'someone-else' } }));
    const wrongUser = await request(app)
      .post('/chat/steer')
      .send({ conversationId: CONVO_ID, text: 'steer' });
    expect(wrongUser.status).toBe(403);

    mockGetJob.mockResolvedValueOnce(
      runningJob({ metadata: { userId: USER_ID, tenantId: 'other-tenant' } }),
    );
    const wrongTenant = await request(app)
      .post('/chat/steer')
      .send({ conversationId: CONVO_ID, text: 'steer' });
    expect(wrongTenant.status).toBe(403);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('409s while the run is paused for human review', async () => {
    const app = buildApp();
    mockGetJob.mockResolvedValueOnce(runningJob({ status: 'requires_action' }));
    const res = await request(app)
      .post('/chat/steer')
      .send({ conversationId: CONVO_ID, text: 'steer' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('RUN_PAUSED');
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('maps enqueue rejections: raced completion → 404, full queue → 429', async () => {
    const app = buildApp();
    mockGetJob.mockResolvedValue(runningJob());

    mockEnqueue.mockResolvedValueOnce(-1);
    const raced = await request(app)
      .post('/chat/steer')
      .send({ conversationId: CONVO_ID, text: 'steer' });
    expect(raced.status).toBe(404);
    expect(raced.body.code).toBe('NO_ACTIVE_RUN');

    mockEnqueue.mockResolvedValueOnce(-2);
    const full = await request(app)
      .post('/chat/steer')
      .send({ conversationId: CONVO_ID, text: 'steer' });
    expect(full.status).toBe(429);
    expect(full.body.code).toBe('STEER_QUEUE_FULL');
  });

  it('202s with steerId + position and sanitizes the text', async () => {
    const app = buildApp();
    mockGetJob.mockResolvedValue(runningJob());
    mockEnqueue.mockResolvedValueOnce(2);

    const res = await request(app)
      .post('/chat/steer')
      .send({ conversationId: CONVO_ID, text: '  focus on tests\0  ' });

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({
      status: 'queued',
      position: 2,
      conversationId: CONVO_ID,
    });
    expect(typeof res.body.steerId).toBe('string');

    const [streamId, item] = mockEnqueue.mock.calls[0];
    expect(streamId).toBe(CONVO_ID);
    expect(item).toMatchObject({ text: 'focus on tests', userId: USER_ID });
    expect(typeof item.createdAt).toBe('number');
  });
});
