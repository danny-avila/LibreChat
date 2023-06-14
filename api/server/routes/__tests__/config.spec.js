const request = require('supertest');
const express = require('express');
const routes = require('../');

const app = express();
app.use('/api/config', routes.config);

afterEach(() => {
  delete process.env.APP_TITLE;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.DOMAIN_SERVER;
  delete process.env.ALLOW_REGISTRATION;
});

describe('GET /', () => {
  it('should return 200 and the correct body', async () => {
    process.env.APP_TITLE = 'Test Title';
    process.env.GOOGLE_CLIENT_ID = 'Test Google Client Id';
    process.env.GOOGLE_CLIENT_SECRET = 'Test Google Client Secret';
    process.env.DOMAIN_SERVER = 'http://test-server.com';
    process.env.ALLOW_REGISTRATION = 'true';

    const response = await request(app).get('/');

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      appTitle: 'Test Title',
      googleLoginEnabled: true,
      serverDomain: 'http://test-server.com',
      registrationEnabled: 'true',
    });
  });
});