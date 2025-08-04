const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const zlib = require('zlib');

// Create test setup
const mockTestDir = path.join(__dirname, 'test-static-route');

// Mock the paths module to point to our test directory
jest.mock('~/config/paths', () => ({
  imageOutput: mockTestDir,
}));

describe('Static Route Integration', () => {
  let app;
  let staticRoute;
  let testDir;
  let testImagePath;

  beforeAll(() => {
    // Create a test directory and files
    testDir = mockTestDir;
    testImagePath = path.join(testDir, 'test-image.jpg');

    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Create a test image file
    fs.writeFileSync(testImagePath, 'fake-image-data');

    // Create a gzipped version of the test image (for gzip scanning tests)
    fs.writeFileSync(testImagePath + '.gz', zlib.gzipSync('fake-image-data'));
  });

  afterAll(() => {
    // Clean up test files
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  // Helper function to set up static route with specific config
  const setupStaticRoute = (skipGzipScan = false) => {
    if (skipGzipScan) {
      delete process.env.ENABLE_IMAGE_OUTPUT_GZIP_SCAN;
    } else {
      process.env.ENABLE_IMAGE_OUTPUT_GZIP_SCAN = 'true';
    }

    staticRoute = require('../static');
    app.use('/images', staticRoute);
  };

  beforeEach(() => {
    // Clear the module cache to get fresh imports
    jest.resetModules();

    app = express();

    // Clear environment variables
    delete process.env.ENABLE_IMAGE_OUTPUT_GZIP_SCAN;
    delete process.env.NODE_ENV;
  });

  describe('route functionality', () => {
    it('should serve static image files', async () => {
      process.env.NODE_ENV = 'production';
      setupStaticRoute();

      const response = await request(app).get('/images/test-image.jpg').expect(200);

      expect(response.body.toString()).toBe('fake-image-data');
    });

    it('should return 404 for non-existent files', async () => {
      setupStaticRoute();

      const response = await request(app).get('/images/nonexistent.jpg');
      expect(response.status).toBe(404);
    });
  });

  describe('cache behavior', () => {
    it('should set cache headers for images in production', async () => {
      process.env.NODE_ENV = 'production';
      setupStaticRoute();

      const response = await request(app).get('/images/test-image.jpg').expect(200);

      expect(response.headers['cache-control']).toBe('public, max-age=172800, s-maxage=86400');
    });

    it('should not set cache headers in development', async () => {
      process.env.NODE_ENV = 'development';
      setupStaticRoute();

      const response = await request(app).get('/images/test-image.jpg').expect(200);

      // Our middleware should not set the production cache-control header in development
      expect(response.headers['cache-control']).not.toBe('public, max-age=172800, s-maxage=86400');
    });
  });

  describe('gzip compression behavior', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('should serve gzipped files when gzip scanning is enabled', async () => {
      setupStaticRoute(false); // Enable gzip scanning

      const response = await request(app)
        .get('/images/test-image.jpg')
        .set('Accept-Encoding', 'gzip')
        .expect(200);

      expect(response.headers['content-encoding']).toBe('gzip');
      expect(response.body.toString()).toBe('fake-image-data');
    });

    it('should not serve gzipped files when gzip scanning is disabled', async () => {
      setupStaticRoute(true); // Disable gzip scanning

      const response = await request(app)
        .get('/images/test-image.jpg')
        .set('Accept-Encoding', 'gzip')
        .expect(200);

      expect(response.headers['content-encoding']).toBeUndefined();
      expect(response.body.toString()).toBe('fake-image-data');
    });
  });

  describe('path configuration', () => {
    it('should use the configured imageOutput path', async () => {
      setupStaticRoute();

      const response = await request(app).get('/images/test-image.jpg').expect(200);

      expect(response.body.toString()).toBe('fake-image-data');
    });

    it('should serve from subdirectories', async () => {
      // Create a subdirectory with a file
      const subDir = path.join(testDir, 'thumbs');
      fs.mkdirSync(subDir, { recursive: true });
      const thumbPath = path.join(subDir, 'thumb.jpg');
      fs.writeFileSync(thumbPath, 'thumbnail-data');

      setupStaticRoute();

      const response = await request(app).get('/images/thumbs/thumb.jpg').expect(200);

      expect(response.body.toString()).toBe('thumbnail-data');

      // Clean up
      fs.rmSync(subDir, { recursive: true, force: true });
    });
  });
});
