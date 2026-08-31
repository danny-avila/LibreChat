const express = require('express');
const request = require('supertest');

const mockCreateInsightsAccessHandler = jest.fn(() => (_req, res) => res.json({ access: true }));
const mockCreateInsightsHandler = jest.fn(() => (_req, res) => res.json({ summary: {} }));
const mockGrantedCapabilities = new Set(['access:admin', 'read:insights']);
const mockGetInsights = jest.fn();
let mockUser = { id: 'admin-id', role: 'ADMIN' };

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
    req.user = mockUser;
    next();
  },
  checkAdmin: (req, res, next) => {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Forbidden' });
    }
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
    mockUser = { id: 'admin-id', role: 'ADMIN' };
    mockGrantedCapabilities.clear();
    mockGrantedCapabilities.add('access:admin');
    mockGrantedCapabilities.add('read:insights');
  });

  it('requires the ADMIN role', async () => {
    mockUser = { id: 'delegated-admin-id', role: 'DELEGATED_ADMIN' };

    const response = await request(createApp()).get('/api/admin/insights');

    expect(response.status).toBe(403);
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
