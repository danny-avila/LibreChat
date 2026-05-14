const fs = require('fs');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

jest.mock('~/server/services/Config', () => ({
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

describe('Server metrics route', () => {
  jest.setTimeout(30_000);

  let mongoServer;
  let app;

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

    mongoServer = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongoServer.getUri();
    process.env.PORT = '0';
    app = require('~/server');

    await healthCheckPoll(app);
  });

  afterEach(() => {
    delete process.env.METRICS_SECRET;
  });

  afterAll(async () => {
    await mongoServer.stop();
    await mongoose.disconnect();
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
