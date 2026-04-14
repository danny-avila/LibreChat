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

describe('Server Configuration', () => {
  // Increase the default timeout to allow for Mongo cleanup
  jest.setTimeout(120_000);

  let mongoServer;
  let app;
  const originalEnv = {
    MONGO_URI: process.env.MONGO_URI,
    PORT: process.env.PORT,
    ENABLE_PUBLIC_AUTH_INDEXING: process.env.ENABLE_PUBLIC_AUTH_INDEXING,
    DOMAIN_CLIENT: process.env.DOMAIN_CLIENT,
    NO_INDEX: process.env.NO_INDEX,
  };

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
    // Create the required directories and files for the test
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
      instance: {
        launchTimeout: 30000,
      },
    });
    process.env.MONGO_URI = mongoServer.getUri();
    process.env.PORT = '0'; // Use a random available port
    process.env.ENABLE_PUBLIC_AUTH_INDEXING = 'true';
    process.env.DOMAIN_CLIENT = 'https://example.com';
    delete process.env.NO_INDEX;
    app = require('~/server');

    // Wait for the app to be healthy
    await healthCheckPoll(app);
  });

  afterAll(async () => {
    if (mongoServer) {
      await mongoServer.stop();
    }
    await mongoose.disconnect();
    process.env.MONGO_URI = originalEnv.MONGO_URI;
    process.env.PORT = originalEnv.PORT;
    process.env.ENABLE_PUBLIC_AUTH_INDEXING = originalEnv.ENABLE_PUBLIC_AUTH_INDEXING;
    process.env.DOMAIN_CLIENT = originalEnv.DOMAIN_CLIENT;
    if (originalEnv.NO_INDEX == null) {
      delete process.env.NO_INDEX;
    } else {
      process.env.NO_INDEX = originalEnv.NO_INDEX;
    }
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

  it('should allow indexing and inject crawlable HTML for /login', async () => {
    const response = await request(app).get('/login');

    expect(response.status).toBe(200);
    expect(response.headers['x-robots-tag']).toBeUndefined();
    expect(response.text).toContain('<title>Login | CodeCan AI</title>');
    expect(response.text).toContain(
      '<meta name="description" content="Sign in to CodeCan AI to access your account, conversations, and building code guidance." />',
    );
    expect(response.text).toContain('<meta name="robots" content="index,follow" />');
    expect(response.text).toContain('<link rel="canonical" href="https://example.com/login" />');
    expect(response.text).toContain('data-public-auth-fallback="true"');
    expect(response.text).toContain('Sign in to CodeCan AI');
    expect(response.text).toContain('Create an account');
    expect(response.text).toContain('Forgot your password?');
  });

  it('should allow indexing and inject crawlable HTML for /register', async () => {
    const response = await request(app).get('/register');

    expect(response.status).toBe(200);
    expect(response.headers['x-robots-tag']).toBeUndefined();
    expect(response.text).toContain('<title>Create Account | CodeCan AI</title>');
    expect(response.text).toContain('<link rel="canonical" href="https://example.com/register" />');
    expect(response.text).toContain('Create your CodeCan AI account');
  });

  it('should allow indexing and inject crawlable HTML for /forgot-password', async () => {
    const response = await request(app).get('/forgot-password');

    expect(response.status).toBe(200);
    expect(response.headers['x-robots-tag']).toBeUndefined();
    expect(response.text).toContain('<title>Forgot Password | CodeCan AI</title>');
    expect(response.text).toContain(
      '<link rel="canonical" href="https://example.com/forgot-password" />',
    );
    expect(response.text).toContain('Reset your password');
  });

  it('should keep tokenized reset-password non-indexable and without canonical metadata', async () => {
    const response = await request(app).get('/reset-password?token=test-token&userId=test-user');

    expect(response.status).toBe(200);
    expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(response.text).not.toContain('rel="canonical"');
    expect(response.text).not.toContain('data-public-auth-fallback="true"');
  });

  it('should keep internal routes non-indexable', async () => {
    const response = await request(app).get('/search');

    expect(response.status).toBe(200);
    expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
  });

  it('should return 500 for unknown errors via ErrorController', async () => {
    // Testing the error handling here on top of unit tests to ensure the middleware is correctly integrated

    // Mock MongoDB operations to fail
    const originalFindOne = mongoose.models.User.findOne;
    const mockError = new Error('MongoDB operation failed');
    mongoose.models.User.findOne = jest.fn().mockImplementation(() => {
      throw mockError;
    });

    try {
      const response = await request(app).post('/api/auth/login').send({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(response.status).toBe(500);
      expect(response.text).toBe('An unknown error occurred.');
    } finally {
      // Restore original function
      mongoose.models.User.findOne = originalFindOne;
    }
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
  } catch {
    // Ignore connection errors during polling
  }

  if (retries < maxRetries) {
    await new Promise((resolve) => setTimeout(resolve, 30));
    await healthCheckPoll(app, retries + 1);
  } else {
    throw new Error('App did not become healthy within 10 seconds.');
  }
}
