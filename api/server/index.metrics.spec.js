const fs = require('fs');
const { promisify } = require('util');
const express = require('express');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

jest.mock('~/server/services/Config', () => ({
  syncStaticTools: jest.fn().mockResolvedValue(undefined),
  loadCustomConfig: jest.fn(() => Promise.resolve({})),
  getAppConfig: jest.fn().mockResolvedValue({
    paths: {
      uploads: '/tmp',
      dist: '/tmp/dist',
      fonts: '/tmp/fonts',
      assets: '/tmp/assets',
    },
    fileStrategy: 'local',
    imageOutputType: 'PNG',
  }),
  mergeAppTools: jest.fn().mockResolvedValue(undefined),
  setCachedTools: jest.fn(),
}));

jest.mock('~/app/clients/tools', () => ({
  createOpenAIImageTools: jest.fn(() => []),
  createYouTubeTools: jest.fn(() => []),
  manifestToolMap: {},
  toolkits: [],
}));

jest.mock('~/config', () => ({
  createMCPServersRegistry: jest.fn(),
  createMCPManager: jest.fn().mockResolvedValue({
    getAppToolFunctions: jest.fn().mockResolvedValue({}),
  }),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
  runAsSystem: jest.fn(async (callback) => callback()),
  createModels: jest.fn(),
  createMethods: jest.fn(() => ({})),
  SystemCapabilities: new Proxy({}, { get: (_target, property) => String(property) }),
  getTenantId: jest.fn(),
}));

jest.mock(
  '~/models',
  () =>
    new Proxy(
      {},
      {
        get: (_target, property) =>
          property === 'seedDatabase' ? jest.fn().mockResolvedValue(undefined) : jest.fn(),
      },
    ),
);

jest.mock(
  '@librechat/api/telemetry',
  () => ({
    initializeTelemetry: jest.fn(() => ({
      enabled: false,
      status: 'disabled',
      shutdown: jest.fn(),
    })),
    telemetryMiddleware: jest.fn((_req, _res, next) => next()),
    telemetryErrorMiddleware: jest.fn((err, _req, _res, next) => next(err)),
  }),
  { virtual: true },
);

jest.mock('~/server/services/initializeMCPs', () => jest.fn().mockResolvedValue(undefined));
jest.mock('~/server/services/initializeOAuthReconnectManager', () =>
  jest.fn().mockResolvedValue(undefined),
);
jest.mock('~/server/services/start/migration', () => ({
  checkMigrations: jest.fn().mockResolvedValue(undefined),
}));

describe('Server metrics route', () => {
  jest.setTimeout(30_000);

  let mongoServer;
  let app;
  let server;

  const originalReadFileSync = fs.readFileSync;

  beforeAll(() => {
    fs.readFileSync = function (filepath, options) {
      if (filepath.includes('index.html')) {
        return '<!DOCTYPE html><html><head><title>LibreChat</title></head><body><div id="root"></div></body></html>';
      }
      return originalReadFileSync(filepath, options);
    };
  });

  afterAll(() => {
    fs.readFileSync = originalReadFileSync;
  });

  beforeAll(async () => {
    const fs = require('fs');
    const path = require('path');

    const dirs = ['/tmp/dist', '/tmp/fonts', '/tmp/assets'];
    dirs.forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    fs.writeFileSync(
      path.join('/tmp/dist', 'index.html'),
      '<!DOCTYPE html><html><head><title>LibreChat</title></head><body><div id="root"></div></body></html>',
    );

    mongoServer = await MongoMemoryServer.create({
      instance: { launchTimeout: 30_000 },
    });
    process.env.MONGO_URI = mongoServer.getUri();
    process.env.PORT = '0';
    process.env.METRICS_SECRET = 'test-secret';
    /* index.js listens at module scope and exports only the app, so capture the server to close it. */
    const listenSpy = jest.spyOn(express.application, 'listen');
    app = require('~/server');

    await healthCheckPoll(app);
    server = listenSpy.mock.results[0].value;
    listenSpy.mockRestore();
  });

  afterEach(() => {
    process.env.METRICS_SECRET = 'test-secret';
  });

  afterAll(async () => {
    if (app?.server) {
      await new Promise((resolve) => app.server.close(resolve));
    }
    delete process.env.METRICS_SECRET;
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('returns 401 at /metrics when METRICS_SECRET is unset', async () => {
    const response = await request(app).get('/metrics');
    expect(response.status).toBe(401);
  });

  it('returns 401 at /metrics when no token provided', async () => {
    process.env.METRICS_SECRET = 'test-secret';

    const response = await request(app).get('/metrics');

    expect(response.status).toBe(401);
  });

  it('returns 401 at /metrics when wrong token provided', async () => {
    process.env.METRICS_SECRET = 'test-secret';

    const response = await request(app).get('/metrics').set('Authorization', 'Bearer wrong-token');

    expect(response.status).toBe(401);
  });

  it('returns 401 at /metrics when the bearer scheme is omitted', async () => {
    process.env.METRICS_SECRET = 'test-secret';

    const response = await request(app).get('/metrics').set('Authorization', 'test-secret');

    expect(response.status).toBe(401);
  });

  it('returns 401 at /metrics for non-bearer auth schemes', async () => {
    process.env.METRICS_SECRET = 'test-secret';

    const response = await request(app).get('/metrics').set('Authorization', 'Basic test-secret');

    expect(response.status).toBe(401);
  });

  it('exposes Prometheus metrics at /metrics with correct bearer token', async () => {
    process.env.METRICS_SECRET = 'test-secret';

    const response = await request(app).get('/metrics').set('Authorization', 'Bearer test-secret');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/plain/);
    expect(response.text).toMatch(/^# HELP /m);
    expect(response.text).toMatch(/^# TYPE /m);
  });

  it('accepts lowercase bearer scheme at /metrics', async () => {
    process.env.METRICS_SECRET = 'test-secret';

    const response = await request(app).get('/metrics').set('Authorization', 'bearer test-secret');

    expect(response.status).toBe(200);
  });
});

async function healthCheckPoll(app, retries = 0) {
  const maxRetries = Math.floor(10000 / 30);
  try {
    const response = await request(app).get('/health');
    if (response.status === 200) {
      return;
    }
  } catch {
    // Ignore connection errors during polling.
  }

  if (retries < maxRetries) {
    await new Promise((resolve) => setTimeout(resolve, 30));
    await healthCheckPoll(app, retries + 1);
    return;
  }

  throw new Error('App did not become healthy within 10 seconds.');
}
