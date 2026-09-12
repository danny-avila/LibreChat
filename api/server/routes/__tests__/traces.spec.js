const express = require('express');
const request = require('supertest');
const { createHash } = require('crypto');

const mockGetConvoOwnership = jest.fn();
const mockGetConversationTraceRefs = jest.fn();
let mockUser;
let mockTraceViewer;

jest.mock('~/models', () => ({
  getConvoOwnership: (...args) => mockGetConvoOwnership(...args),
  getConversationTraceRefs: (...args) => mockGetConversationTraceRefs(...args),
}));

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) => {
    if (!mockUser) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    req.user = mockUser;
    next();
  },
}));

jest.mock('~/server/middleware/config/app', () => (req, _res, next) => {
  req.config = { interfaceConfig: { traceViewer: mockTraceViewer } };
  next();
});

const traceIdFor = (seed) => createHash('sha256').update(seed, 'utf8').digest('hex').slice(0, 32);

const langfuseEnv = {
  LANGFUSE_PUBLIC_KEY: 'pk-route',
  LANGFUSE_SECRET_KEY: 'sk-route',
  LANGFUSE_PROJECT_ID: 'route-project',
  LANGFUSE_BASE_URL: 'https://langfuse.route.test',
};

describe('trace routes', () => {
  let app;
  let fetchSpy;

  beforeAll(() => {
    Object.assign(process.env, langfuseEnv);
    const tracesRouter = require('../traces');
    app = express();
    app.use('/api/traces', tracesRouter);
  });

  afterAll(() => {
    for (const key of Object.keys(langfuseEnv)) {
      delete process.env[key];
    }
  });

  beforeEach(() => {
    mockUser = { id: 'owner', role: 'USER' };
    mockTraceViewer = { enabled: true };
    mockGetConvoOwnership.mockResolvedValue({ user: 'owner' });
    mockGetConversationTraceRefs.mockResolvedValue({
      firstMessageAt: new Date('2026-09-12T11:00:00.000Z'),
      sampledMessages: [{ messageId: 'response-1' }],
    });
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'obs-root',
                traceId: traceIdFor('response-1'),
                startTime: '2026-09-12T11:30:00.000Z',
                endTime: '2026-09-12T11:30:02.000Z',
                parentObservationId: null,
                type: 'AGENT',
                name: 'AgentGraph',
                level: 'DEFAULT',
              },
              {
                id: 'obs-foreign',
                traceId: traceIdFor('other-response'),
                startTime: '2026-09-12T11:31:00.000Z',
                endTime: '2026-09-12T11:31:02.000Z',
                parentObservationId: null,
                type: 'AGENT',
                name: 'AgentGraph',
              },
            ],
            meta: {},
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('requires authentication', async () => {
    mockUser = undefined;

    const response = await request(app).get('/api/traces/convo-1/records');

    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reads the owner's sampled traces from Langfuse without exposing other traces", async () => {
    const availability = await request(app).get('/api/traces/convo-1/availability');
    const response = await request(app).get('/api/traces/convo-1/records');

    expect(availability.body).toEqual({ available: true });
    expect(response.status).toBe(200);
    expect(response.body.records.map(({ id }) => id)).toEqual(['obs-root']);
    expect(response.body.records[0]).toMatchObject({ messageId: 'response-1', kind: 'agent' });
    expect(mockGetConvoOwnership).toHaveBeenCalledWith('owner', 'convo-1');
    expect(mockGetConversationTraceRefs).toHaveBeenCalledWith({
      user: 'owner',
      conversationId: 'convo-1',
      sampledLimit: undefined,
    });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(new URL(url).origin).toBe('https://langfuse.route.test');
    expect(new URL(url).searchParams.get('sessionId')).toBe('convo-1');
    expect(new Headers(init.headers).get('Authorization')).toBe(
      `Basic ${Buffer.from('pk-route:sk-route').toString('base64')}`,
    );
    expect(JSON.stringify(response.body)).not.toContain('sk-route');
  });

  it("refuses another user's conversation before reading Langfuse", async () => {
    mockGetConvoOwnership.mockResolvedValue(null);

    const availability = await request(app).get('/api/traces/convo-1/availability');
    const response = await request(app).get('/api/traces/convo-1/records/obs-root');

    expect(availability.body).toEqual({ available: false });
    expect(response.status).toBe(404);
    expect(mockGetConversationTraceRefs).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('stays off until the deployment enables the viewer', async () => {
    mockTraceViewer = undefined;

    const response = await request(app).get('/api/traces/convo-1/records');

    expect(response.status).toBe(404);
    expect(response.body.errorCode).toBe('disabled');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
