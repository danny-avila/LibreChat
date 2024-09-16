const request = require('supertest');
const express = require('express');
const routes = require('../');
// file deepcode ignore UseCsurfForExpress/test: test
const app = express();
app.disable('x-powered-by');
app.use('/api/config', routes.config);

afterEach(() => {
  delete process.env.APP_TITLE;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.FACEBOOK_CLIENT_ID;
  delete process.env.FACEBOOK_CLIENT_SECRET;
  delete process.env.OPENID_CLIENT_ID;
  delete process.env.OPENID_CLIENT_SECRET;
  delete process.env.OPENID_ISSUER;
  delete process.env.OPENID_SESSION_SECRET;
  delete process.env.OPENID_BUTTON_LABEL;
  delete process.env.OPENID_AUTH_URL;
  delete process.env.GITHUB_CLIENT_ID;
  delete process.env.GITHUB_CLIENT_SECRET;
  delete process.env.DISCORD_CLIENT_ID;
  delete process.env.DISCORD_CLIENT_SECRET;
  delete process.env.DOMAIN_SERVER;
  delete process.env.ALLOW_REGISTRATION;
  delete process.env.ALLOW_SOCIAL_LOGIN;
  delete process.env.ALLOW_PASSWORD_RESET;
  delete process.env.LDAP_URL;
  delete process.env.LDAP_BIND_DN;
  delete process.env.LDAP_BIND_CREDENTIALS;
  delete process.env.LDAP_USER_SEARCH_BASE;
  delete process.env.LDAP_SEARCH_FILTER;
});

//TODO: This works/passes locally but http request tests fail with 404 in CI. Need to figure out why.

// eslint-disable-next-line jest/no-disabled-tests
describe.skip('GET /', () => {
  it('should return 200 and the correct body', async () => {
    process.env.APP_TITLE = 'Test Title';
    process.env.GOOGLE_CLIENT_ID = 'Test Google Client Id';
    process.env.GOOGLE_CLIENT_SECRET = 'Test Google Client Secret';
    process.env.FACEBOOK_CLIENT_ID = 'Test Facebook Client Id';
    process.env.FACEBOOK_CLIENT_SECRET = 'Test Facebook Client Secret';
    process.env.OPENID_CLIENT_ID = 'Test OpenID Id';
    process.env.OPENID_CLIENT_SECRET = 'Test OpenID Secret';
    process.env.OPENID_ISSUER = 'Test OpenID Issuer';
    process.env.OPENID_SESSION_SECRET = 'Test Secret';
    process.env.OPENID_BUTTON_LABEL = 'Test OpenID';
    process.env.OPENID_AUTH_URL = 'http://test-server.com';
    process.env.GITHUB_CLIENT_ID = 'Test Github client Id';
    process.env.GITHUB_CLIENT_SECRET = 'Test Github client Secret';
    process.env.DISCORD_CLIENT_ID = 'Test Discord client Id';
    process.env.DISCORD_CLIENT_SECRET = 'Test Discord client Secret';
    process.env.DOMAIN_SERVER = 'http://test-server.com';
    process.env.ALLOW_REGISTRATION = 'true';
    process.env.ALLOW_SOCIAL_LOGIN = 'true';
    process.env.ALLOW_PASSWORD_RESET = 'true';
    process.env.LDAP_URL = 'Test LDAP URL';
    process.env.LDAP_BIND_DN = 'Test LDAP Bind DN';
    process.env.LDAP_BIND_CREDENTIALS = 'Test LDAP Bind Credentials';
    process.env.LDAP_USER_SEARCH_BASE = 'Test LDAP User Search Base';
    process.env.LDAP_SEARCH_FILTER = 'Test LDAP Search Filter';

    const response = await request(app).get('/');

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      appTitle: 'Test Title',
      socialLogins: ['google', 'facebook', 'openid', 'github', 'discord'],
      discordLoginEnabled: true,
      facebookLoginEnabled: true,
      githubLoginEnabled: true,
      googleLoginEnabled: true,
      openidLoginEnabled: true,
      openidLabel: 'Test OpenID',
      openidImageUrl: 'http://test-server.com',
      ldap: {
        enabled: true,
      },
      serverDomain: 'http://test-server.com',
      emailLoginEnabled: 'true',
      registrationEnabled: 'true',
      passwordResetEnabled: 'true',
      socialLoginEnabled: 'true',
    });
  });
});
