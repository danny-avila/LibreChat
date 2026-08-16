const express = require('express');
const request = require('supertest');

const mockCreateInsightsAccessHandler = jest.fn(() => (_req, res) => res.json({ access: true }));
const mockCreateInsightsHandler = jest.fn(() => (_req, res) => res.json({ summary: {} }));
const mockGrantedCapabilities = new Set(['access:admin', 'read:insights']);
const mockGetInsights = jest.fn();

jest.mock('@librechat/api', () => ({
  createInsightsAccessHandler: (...args) => mockCreateInsightsAccessHandler(...args),
  createInsightsHandler: (...args) => mockCreateInsightsHandler(...args),
  isEnabled: (value) => value === 'true',
}));

jest.mock('@librechat/data-schemas', () => ({
  SystemCapabilities: {
    ACCESS_ADMIN: 'access:admin',
    READ_INSIGHTS: 'read:insights',
  },
}));

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, _res, next) => {
    req.user = { id: 'admin-id', role: 'ADMIN' };
    next();
  },
}));

jest.mock('~/server/middleware/roles/capabilities', () => ({
  requireCapability: (capability) => (_req, res, next) => {
    if (!mockGrantedCapabilities.has(capability)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  },
}));

jest.mock('~/models', () => ({
  getInsights: (...args) => mockGetInsights(...args),
}));

const insightsRouter = require('../insights');

function createApp() {
  const app = express();
  app.use('/api/admin/insights', insightsRouter);
  return app;
}

describe('Insights routes', () => {
  beforeEach(() => {
    mockGrantedCapabilities.clear();
    mockGrantedCapabilities.add('access:admin');
    mockGrantedCapabilities.add('read:insights');
  });

  it('serves the access probe and dashboard', async () => {
    const app = createApp();

    await expect(request(app).get('/api/admin/insights/access')).resolves.toMatchObject({
      status: 200,
      body: { access: true },
    });
    await expect(request(app).get('/api/admin/insights')).resolves.toMatchObject({
      status: 200,
      body: { summary: {} },
    });
  });

  it.each(['access:admin', 'read:insights'])('requires %s', async (capability) => {
    mockGrantedCapabilities.delete(capability);

    const response = await request(createApp()).get('/api/admin/insights');

    expect(response.status).toBe(403);
  });
});
