const express = require('express');
const request = require('supertest');

const mockHasGenerationClaim = jest.fn();
const mockIpLimiter = jest.fn((_req, res) => res.status(429).json({ limited: 'ip' }));
const mockUserLimiter = jest.fn((_req, res) => res.status(429).json({ limited: 'user' }));
const mockRetryLimiter = jest.fn((_req, _res, next) => next());
const mockExemptAgentTrigger = jest.fn(() => false);
const mockExemptSchedule = jest.fn(() => false);

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock('@librechat/api', () => ({
  isEnabled: jest.fn(() => true),
  detectGenerationRetry: async (req, _res, next) => {
    req._isConfirmedGenerationRetry = await mockHasGenerationClaim(
      req.user?.id,
      req.body?.clientRequestId,
    );
    next();
  },
  isConfirmedGenerationRetry: (req) => req._isConfirmedGenerationRetry === true,
  generationRetryLimiter: (...args) => mockRetryLimiter(...args),
  isAgentTriggerRequest: jest.fn(() => false),
  captureScheduleFireContext: jest.fn(),
  exemptAgentTriggerFromIpLimiter: (...args) => mockExemptAgentTrigger(...args),
  exemptFromUserLimiter: (...args) => mockExemptSchedule(...args),
  createMessageFilterPii: jest.fn(() => (_req, _res, next) => next()),
}));

jest.mock('~/server/middleware', () => ({
  uaParser: (_req, _res, next) => next(),
  checkBan: (_req, _res, next) => next(),
  requireJwtAuth: (req, _res, next) => {
    req.user = { id: 'user-1' };
    next();
  },
  moderateText: (_req, _res, next) => next(),
  messageIpLimiter: (...args) => mockIpLimiter(...args),
  configMiddleware: (_req, _res, next) => next(),
  messageUserLimiter: (...args) => mockUserLimiter(...args),
}));

jest.mock('~/server/routes/agents/chat', () => {
  const router = require('express').Router();
  router.post('/', (_req, res) => res.status(201).json({ admitted: true }));
  return router;
});
jest.mock('~/server/routes/agents/v1', () => ({
  v1: require('express').Router(),
}));
jest.mock('~/server/routes/agents/openai', () => require('express').Router());
jest.mock('~/server/routes/agents/responses', () => require('express').Router());
jest.mock('~/server/controllers/agents/steer', () => {
  const controller = (_req, _res, next) => next();
  controller.SteerDeliveryController = (_req, _res, next) => next();
  controller.SteerCancelController = (_req, _res, next) => next();
  controller.SteerArmController = (_req, _res, next) => next();
  return controller;
});
jest.mock('~/models', () => ({}));
jest.mock('~/server/services/Schedules', () => ({}));

const agentsRouter = require('../index');
const app = express();
app.use(express.json());
app.use('/agents', agentsRouter);

describe('start-generation idempotency before message limiters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExemptAgentTrigger.mockReturnValue(false);
    mockExemptSchedule.mockReturnValue(false);
  });

  it('lets a confirmed retry reach the controller without consuming either limiter', async () => {
    mockHasGenerationClaim.mockResolvedValue(true);

    const response = await request(app).post('/agents/chat').send({ clientRequestId: 'request-1' });

    expect(response.status).toBe(201);
    expect(mockRetryLimiter).toHaveBeenCalledTimes(1);
    expect(mockIpLimiter).not.toHaveBeenCalled();
    expect(mockUserLimiter).not.toHaveBeenCalled();
  });

  it('keeps a new submission behind the configured message limiters', async () => {
    mockHasGenerationClaim.mockResolvedValue(false);

    const response = await request(app).post('/agents/chat').send({ clientRequestId: 'request-2' });

    expect(response.status).toBe(429);
    expect(response.body).toEqual({ limited: 'ip' });
    expect(mockRetryLimiter).toHaveBeenCalledTimes(1);
    expect(mockIpLimiter).toHaveBeenCalledTimes(1);
    expect(mockUserLimiter).not.toHaveBeenCalled();
  });

  it('rejects an excessive confirmed retry before the chat pipeline', async () => {
    mockHasGenerationClaim.mockResolvedValue(true);
    mockRetryLimiter.mockImplementationOnce((_req, res) =>
      res.status(429).json({ error: { code: 'generation_retry_rate_limited' } }),
    );

    const response = await request(app).post('/agents/chat').send({ clientRequestId: 'request-3' });

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('generation_retry_rate_limited');
    expect(mockIpLimiter).not.toHaveBeenCalled();
    expect(mockUserLimiter).not.toHaveBeenCalled();
  });

  it.each([
    ['an agent-trigger delivery', mockExemptAgentTrigger],
    ['a scheduled delivery', mockExemptSchedule],
  ])('keeps %s outside the human retry bucket', async (_label, exemption) => {
    mockHasGenerationClaim.mockResolvedValue(true);
    exemption.mockReturnValue(true);

    const response = await request(app).post('/agents/chat').send({ clientRequestId: 'request-4' });

    expect(response.status).toBe(201);
    expect(mockRetryLimiter).not.toHaveBeenCalled();
    expect(mockIpLimiter).not.toHaveBeenCalled();
    expect(mockUserLimiter).not.toHaveBeenCalled();
  });
});
