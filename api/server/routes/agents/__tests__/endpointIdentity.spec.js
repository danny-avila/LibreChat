/**
 * Behavior 3.4 — URL and body endpoint identity is exact.
 *
 * Drives the REAL agents chat router. Only the far side of the promise is stubbed:
 * the controllers (which are downstream of the observable) and the authentication /
 * moderation middleware that precede the span. `requireEndpointIdentity` and
 * `buildEndpointOption` run for real, in their production registration order.
 */

const express = require('express');
const request = require('supertest');
const { EModelEndpoint, Providers } = require('librechat-data-provider');

const passthrough = (req, res, next) => next();

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  createMessageFilterPii: () => passthrough,
  generateCheckAccess: () => passthrough,
  GenerationJobManager: { getJob: jest.fn().mockResolvedValue(null) },
}));

const mockController = jest.fn((req, res) => res.status(200).json({ ok: 'chat' }));
const mockResumeController = jest.fn((req, res) => res.status(200).json({ ok: 'resume' }));

jest.mock('~/server/controllers/agents/request', () => (req, res) => mockController(req, res));
jest.mock('~/server/controllers/agents/resume', () => (req, res) => mockResumeController(req, res));
jest.mock('~/server/services/Endpoints/agents/title', () => jest.fn());

jest.mock('~/server/middleware', () => {
  const actualBuildEndpointOption = jest.requireActual('~/server/middleware/buildEndpointOption');
  return {
    moderateText: (req, res, next) => next(),
    validateConvoAccess: (req, res, next) => next(),
    canAccessAgentFromBody: () => (req, res, next) => next(),
    buildEndpointOption: actualBuildEndpointOption,
  };
});

const mockGetEndpointsConfig = jest.fn();
jest.mock('~/server/services/Config', () => ({
  getEndpointsConfig: (...args) => mockGetEndpointsConfig(...args),
}));

jest.mock('~/models', () => ({
  getRoleByName: jest.fn(),
  updateFilesUsage: jest.fn(),
}));

const chatRouter = require('~/server/routes/agents/chat');

const BAML_ENDPOINT = 'Team BAML+[v1]';

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { id: 'user-1', tenantId: 'tenant-1' };
    req.config = {};
    next();
  });
  app.use('/api/agents/chat', chatRouter);
  return app;
};

describe('agents chat route endpoint identity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEndpointsConfig.mockResolvedValue({
      [BAML_ENDPOINT]: {
        type: EModelEndpoint.custom,
        customParams: { defaultParamsEndpoint: Providers.BAML },
      },
    });
  });

  const post = (segment, body) =>
    request(buildApp()).post(`/api/agents/chat/${segment}`).send(body);

  it('accepts a matching encoded route segment and body endpoint', async () => {
    const res = await post(encodeURIComponent(BAML_ENDPOINT), {
      endpoint: BAML_ENDPOINT,
      endpointType: EModelEndpoint.custom,
      model: 'OpenRouter',
    });

    expect(res.status).toBe(200);
    expect(mockController).toHaveBeenCalled();
    expect(mockController.mock.calls[0][0].body.endpointOption.endpoint).toBe(BAML_ENDPOINT);
  });

  it('rejects a route endpoint that does not match the body endpoint', async () => {
    const res = await post(encodeURIComponent(BAML_ENDPOINT), {
      endpoint: 'Skunkworks [v2]',
      endpointType: EModelEndpoint.custom,
      model: 'OpenRouter',
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Route endpoint does not match request endpoint.' });
    expect(mockController).not.toHaveBeenCalled();
  });

  it('rejects a missing body endpoint before any endpoint-option work', async () => {
    const res = await post(encodeURIComponent(BAML_ENDPOINT), { model: 'OpenRouter' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Route endpoint does not match request endpoint.' });
    expect(mockGetEndpointsConfig).not.toHaveBeenCalled();
    expect(mockController).not.toHaveBeenCalled();
  });

  it('rejects a non-string body endpoint', async () => {
    const res = await post(encodeURIComponent(BAML_ENDPOINT), {
      endpoint: { name: BAML_ENDPOINT },
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Route endpoint does not match request endpoint.' });
    expect(mockController).not.toHaveBeenCalled();
  });

  it('leaves the bare chat route unguarded and still built', async () => {
    const res = await request(buildApp())
      .post('/api/agents/chat')
      .send({ endpoint: BAML_ENDPOINT, endpointType: EModelEndpoint.custom, model: 'OpenRouter' });

    expect(res.status).toBe(200);
    expect(mockController).toHaveBeenCalled();
    expect(mockController.mock.calls[0][0].body.endpointOption.endpoint).toBe(BAML_ENDPOINT);
  });

  it('leaves the resume route unguarded and still built', async () => {
    const res = await request(buildApp())
      .post('/api/agents/chat/resume')
      .send({ endpoint: BAML_ENDPOINT, endpointType: EModelEndpoint.custom, model: 'OpenRouter' });

    expect(res.status).toBe(200);
    expect(mockResumeController).toHaveBeenCalled();
    expect(mockResumeController.mock.calls[0][0].body.endpointOption.endpoint).toBe(BAML_ENDPOINT);
  });
});
