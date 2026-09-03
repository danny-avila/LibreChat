const express = require('express');
const request = require('supertest');

const mockMapAgentManagementError = jest.fn(() => ({
  status: 404,
  body: { error: { code: 'not_found', message: 'Agent not found' } },
}));
const mockCheckBan = jest.fn((_req, _res, next) => next());
const mockUaParser = jest.fn((_req, _res, next) => next());

const mockRequireAgentManagementAuth = jest.fn((req, res, next) => {
  if (req.headers.authorization !== 'Bearer valid-token') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.user = { id: 'integration-user', tenantId: 'tenant-a', role: 'USER' };
  next();
});

jest.mock('../middleware', () => ({
  requireAgentManagementAuth: mockRequireAgentManagementAuth,
}));
jest.mock('@librechat/api', () => ({
  mapAgentManagementError: mockMapAgentManagementError,
}));
jest.mock('~/server/middleware', () => ({
  checkBan: mockCheckBan,
  uaParser: mockUaParser,
}));

const router = require('../management');

describe('Agent Management route boundary', () => {
  const app = express();
  app.use('/api/agents/v1/agents', router);

  beforeEach(() => {
    mockRequireAgentManagementAuth.mockClear();
    mockCheckBan.mockClear();
    mockUaParser.mockClear();
    mockMapAgentManagementError.mockClear();
  });

  it('rejects a request before reaching management routes without machine authentication', async () => {
    const response = await request(app).get('/api/agents/v1/agents');

    expect(response.status).toBe(401);
    expect(mockRequireAgentManagementAuth).toHaveBeenCalledTimes(1);
    expect(mockCheckBan).not.toHaveBeenCalled();
    expect(mockUaParser).not.toHaveBeenCalled();
  });

  it('terminates authenticated unknown paths inside the management router', async () => {
    const response = await request(app)
      .get('/api/agents/v1/agents/not-a-management-operation')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'not_found', message: 'Agent not found' } });
    expect(mockCheckBan).toHaveBeenCalledTimes(1);
    expect(mockUaParser).toHaveBeenCalledTimes(1);
    expect(mockMapAgentManagementError).toHaveBeenCalledWith('not_found');
    expect(mockRequireAgentManagementAuth).toHaveBeenCalledTimes(1);
  });
});
