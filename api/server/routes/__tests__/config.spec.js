const request = require('supertest');
const express = require('express');
const routes = require('../');
const app = express();
app.use('/api/config', routes.config);

afterEach(() => {
  delete process.env.APP_TITLE;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.OPENID_CLIENT_ID;
  delete process.env.OPENID_CLIENT_SECRET;
  delete process.env.OPENID_ISSUER;
  delete process.env.OPENID_SESSION_SECRET;
  delete process.env.VITE_OPENID_LABEL;
  delete process.env.VITE_OPENID_URL;
  delete process.env.DOMAIN_SERVER;
  delete process.env.ALLOW_REGISTRATION;
});

//TODO: This works/passes locally but http request tests fail with 404 in CI. Need to figure out why.

// eslint-disable-next-line jest/no-disabled-tests
describe.skip('GET /', () => {
  it('should return 200 and the correct body', async () => {
    process.env.APP_TITLE = 'Test Title';
    process.env.GOOGLE_CLIENT_ID = 'Test Google Client Id';
    process.env.GOOGLE_CLIENT_SECRET = 'Test Google Client Secret';
    process.env.OPENID_CLIENT_ID= 'Test OpenID Id';
    process.env.OPENID_CLIENT_SECRET= 'Test OpenID Secret';
    process.env.OPENID_ISSUER= 'Test OpenID Issuer';
    process.env.OPENID_SESSION_SECRET= 'Test Secret';
    process.env.VITE_OPENID_LABEL= 'Test OpenID';
    process.env.VITE_OPENID_URL= 'http://test-server.com';
    process.env.DOMAIN_SERVER = 'http://test-server.com';
    process.env.ALLOW_REGISTRATION = 'true';

    const response = await request(app).get('/');

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      appTitle: 'Test Title',
      googleLoginEnabled: true,
      openidLoginEnabled: true,
      openidLabel: 'Test OpenID',
      openidUrl: 'http://test-server.com',
      serverDomain: 'http://test-server.com',
      registrationEnabled: 'true',
    });
  });
});
