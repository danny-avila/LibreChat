/**
 * Regression tests for the ephemeral-agent chat route used by custom endpoints.
 *
 * The client posts to `/api/agents/chat/<endpoint>` with the endpoint name URL-encoded,
 * so a custom endpoint named "Company/API" arrives as `/api/agents/chat/Company%2FAPI`
 * in a single path segment. These tests pin that routing: the encoded slash must still
 * match the `/:endpoint` route, and Express must hand the decoded name to the handler.
 */

const express = require('express');
const request = require('supertest');

const mockLogger = {
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};

const mockRequestController = jest.fn(async (req, res) => {
  res.json({
    ok: true,
    paramsEndpoint: req.params?.endpoint,
    bodyEndpoint: req.body?.endpoint,
  });
});

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: mockLogger,
}));

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  isEnabled: jest.fn(() => false),
  GenerationJobManager: {},
  isAgentTriggerRequest: jest.fn(() => false),
  captureScheduleFireContext: jest.fn(),
  getSafeErrorMetadata: jest.fn((error) => ({ error: String(error) })),
  createMessageFilterPii: () => (req, _res, next) => next(),
  generateCheckAccess: () => (req, _res, next) => next(),
  skipAgentCheck: true,
  applyResumeContext: jest.fn(),
  applyResumeModelParameters: jest.fn(),
}));

jest.mock('~/models', () => ({
  saveMessage: jest.fn(),
  getFiles: jest.fn().mockResolvedValue([]),
  getRoleByName: jest.fn().mockResolvedValue(null),
}));

jest.mock('~/server/services/Schedules', () => ({
  recordScheduleOutcome: jest.fn(),
  beginScheduledStop: jest.fn(),
  acknowledgeScheduledStopPersistence: jest.fn(),
}));

jest.mock('~/server/middleware', () => ({
  uaParser: (req, _res, next) => next(),
  checkBan: (req, _res, next) => next(),
  requireJwtAuth: (req, _res, next) => {
    req.user = { id: 'test-user-123' };
    next();
  },
  moderateText: (req, _res, next) => next(),
  messageIpLimiter: (req, _res, next) => next(),
  messageUserLimiter: (req, _res, next) => next(),
  configMiddleware: (req, _res, next) => next(),
  validateConvoAccess: (req, _res, next) => next(),
  buildEndpointOption: (req, _res, next) => next(),
  canAccessAgentFromBody: (_options) => (req, _res, next) => next(),
}));

jest.mock(
  '~/server/controllers/agents/request',
  () =>
    (...args) =>
      mockRequestController(...args),
);

jest.mock('~/server/controllers/agents/resume', () =>
  jest.fn(async (_req, res) => {
    res.json({ ok: true });
  }),
);

jest.mock('~/server/controllers/agents/steer', () =>
  Object.assign(
    jest.fn(async (_req, res) => res.json({ ok: true })),
    {
      SteerDeliveryController: jest.fn(async (_req, res) => res.json({ ok: true })),
      SteerCancelController: jest.fn(async (_req, res) => res.json({ ok: true })),
      SteerArmController: jest.fn(async (_req, res) => res.json({ ok: true })),
    },
  ),
);

jest.mock('~/server/services/Endpoints/agents', () => ({
  initializeClient: jest.fn(),
}));

jest.mock('~/server/services/Endpoints/agents/title', () => jest.fn());

jest.mock('~/server/middleware/validate/subagentThreadTurn', () =>
  jest.fn((req, _res, next) => next()),
);

jest.mock('~/server/routes/agents/responses', () => require('express').Router());
jest.mock('~/server/routes/agents/openai', () => require('express').Router());
jest.mock('~/server/routes/agents/v1', () => ({ v1: require('express').Router() }));

// Import after mocks
const agentRoutes = require('~/server/routes/agents/index');

describe('POST /api/agents/chat/:endpoint routing', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/agents', agentRoutes);
  });

  beforeEach(() => {
    mockRequestController.mockClear();
  });

  it('routes a chat whose custom endpoint name contains a slash via the encoded segment', async () => {
    const response = await request(app)
      .post(`/api/agents/chat/${encodeURIComponent('Company/API')}`)
      .send({ endpoint: 'Company/API' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      paramsEndpoint: 'Company/API',
      bodyEndpoint: 'Company/API',
    });
    expect(mockRequestController).toHaveBeenCalledTimes(1);
  });

  it('keeps routing an ordinary custom endpoint unchanged', async () => {
    const response = await request(app)
      .post('/api/agents/chat/CompanyAPI')
      .send({ endpoint: 'CompanyAPI' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      paramsEndpoint: 'CompanyAPI',
      bodyEndpoint: 'CompanyAPI',
    });
    expect(mockRequestController).toHaveBeenCalledTimes(1);
  });

  it('still routes the built-in agents entry point without a trailing segment', async () => {
    const response = await request(app).post('/api/agents/chat').send({ endpoint: 'agents' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      paramsEndpoint: undefined,
      bodyEndpoint: 'agents',
    });
  });
});
