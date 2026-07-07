const express = require('express');
const request = require('supertest');

const mockRequireRumProxyAuth = jest.fn((_req, _res, next) => next());
const mockIsRumProxyEnabled = jest.fn();
const mockProxyRumRequest = jest.fn((_req, res) => res.status(202).send());

jest.mock('~/server/middleware', () => ({
  requireRumProxyAuth: (...args) => mockRequireRumProxyAuth(...args),
}));

jest.mock('@librechat/api', () => ({
  getRumProxyBodyLimit: jest.fn(() => '3mb'),
  isRumProxyEnabled: (...args) => mockIsRumProxyEnabled(...args),
  proxyRumRequest: (...args) => mockProxyRumRequest(...args),
}));

describe('RUM proxy routes', () => {
  let app;

  beforeAll(() => {
    const rumRouter = require('../rum');

    app = express();
    app.use('/api/rum', rumRouter);
  });

  beforeEach(() => {
    mockRequireRumProxyAuth.mockClear();
    mockIsRumProxyEnabled.mockReset();
    mockProxyRumRequest.mockClear();
  });

  it('returns 404 before auth and proxying when RUM proxy mode is disabled', async () => {
    mockIsRumProxyEnabled.mockReturnValue(false);

    const response = await request(app)
      .post('/api/rum/v1/traces')
      .set('Content-Type', 'application/x-protobuf')
      .send(Buffer.from('payload'));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'RUM proxy is not configured' });
    expect(mockRequireRumProxyAuth).not.toHaveBeenCalled();
    expect(mockProxyRumRequest).not.toHaveBeenCalled();
  });

  it('authenticates and proxies when RUM proxy mode is enabled', async () => {
    mockIsRumProxyEnabled.mockReturnValue(true);

    const response = await request(app)
      .post('/api/rum/v1/traces')
      .set('Content-Type', 'application/x-protobuf')
      .send(Buffer.from('payload'));

    expect(response.status).toBe(202);
    expect(mockRequireRumProxyAuth).toHaveBeenCalledTimes(1);
    expect(mockProxyRumRequest).toHaveBeenCalledTimes(1);
  });

  it('uses RUM-specific auth for logs as well as traces', async () => {
    mockIsRumProxyEnabled.mockReturnValue(true);

    const response = await request(app)
      .post('/api/rum/v1/logs')
      .set('Content-Type', 'application/x-protobuf')
      .send(Buffer.from('payload'));

    expect(response.status).toBe(202);
    expect(mockRequireRumProxyAuth).toHaveBeenCalledTimes(1);
    expect(mockProxyRumRequest).toHaveBeenCalledTimes(1);
  });
});
