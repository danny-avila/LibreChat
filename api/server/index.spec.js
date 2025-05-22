const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

describe('Server Configuration', () => {
  // Increase the default timeout to allow for Mongo cleanup
  jest.setTimeout(30_000);

  let mongoServer;
  let app;

  /** Mocked fs.readFileSync for index.html */
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
    // Restore original fs.readFileSync
    fs.readFileSync = originalReadFileSync;
  });

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongoServer.getUri();
    process.env.PORT = '0'; // Use a random available port
    app = require('~/server');

    // Wait for the app to be healthy
    await healthCheckPoll(app);
  });

  afterAll(async () => {
    await mongoServer.stop();
    await mongoose.disconnect();
  });

  it('should return OK for /health', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.text).toBe('OK');
  });

  it('should not cache index page', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-cache, no-store, must-revalidate');
    expect(response.headers['pragma']).toBe('no-cache');
    expect(response.headers['expires']).toBe('0');
  });
});

// Polls the /health endpoint every 30ms for up to 10 seconds to wait for the server to start completely
async function healthCheckPoll(app, retries = 0) {
  const maxRetries = Math.floor(10000 / 30); // 10 seconds / 30ms
  try {
    const response = await request(app).get('/health');
    if (response.status === 200) {
      return; // App is healthy
    }
  } catch (error) {
    // Ignore connection errors during polling
  }

  if (retries < maxRetries) {
    await new Promise((resolve) => setTimeout(resolve, 30));
    await healthCheckPoll(app, retries + 1);
  } else {
    throw new Error('App did not become healthy within 10 seconds.');
  }
}
