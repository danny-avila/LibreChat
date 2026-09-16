/**
 * IA patch "login footer": `interface.loginFooter` has to reach the login page,
 * and the login page is served to a caller who has not signed in yet.
 *
 * These tests fail if the pre-login branch of `GET /api/config` stops carrying
 * the field — which is what a rebase onto a new upstream tag would do silently,
 * because that branch hand-picks every field it exposes.
 */
jest.mock('~/cache/getLogStores');

const mockGetAppConfig = jest.fn();
jest.mock('~/server/services/Config/app', () => ({
  getAppConfig: (...args) => mockGetAppConfig(...args),
}));

jest.mock('~/server/services/Config/ldap', () => ({
  getLdapConfig: jest.fn(() => null),
}));

jest.mock('~/server/middleware/roles/capabilities', () => ({
  hasCapability: jest.fn(),
  hasConfigCapability: jest.fn(),
}));

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  getTenantId: jest.fn(() => undefined),
}));

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  getCloudFrontConfig: jest.fn(() => null),
  resolveBuildInfo: jest.fn(() => ({
    commit: null,
    commitShort: null,
    branch: null,
    buildDate: null,
  })),
}));

const request = require('supertest');
const express = require('express');
const configRoute = require('../config');

function createAnonymousApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api/config', configRoute);
  return app;
}

const LOGIN_FOOTER = 'Operated by [Example Hosting](https://example-hosting.com) | Support';

afterEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/config — interface.loginFooter, unauthenticated', () => {
  it('serves the configured login footer to a caller who has not signed in', async () => {
    mockGetAppConfig.mockResolvedValue({
      interfaceConfig: { loginFooter: LOGIN_FOOTER },
    });

    const response = await request(createAnonymousApp()).get('/api/config');

    expect(response.status).toBe(200);
    expect(response.body.interface?.loginFooter).toBe(LOGIN_FOOTER);
  });

  it('serves it alongside the policy links rather than in place of them', async () => {
    mockGetAppConfig.mockResolvedValue({
      interfaceConfig: {
        loginFooter: LOGIN_FOOTER,
        privacyPolicy: { externalUrl: 'https://example.com/privacy' },
        termsOfService: { externalUrl: 'https://example.com/tos' },
      },
    });

    const response = await request(createAnonymousApp()).get('/api/config');

    expect(response.body.interface).toEqual(
      expect.objectContaining({
        loginFooter: LOGIN_FOOTER,
        privacyPolicy: { externalUrl: 'https://example.com/privacy' },
        termsOfService: { externalUrl: 'https://example.com/tos' },
      }),
    );
  });

  it('omits the field when it is not configured, leaving the payload as it was', async () => {
    mockGetAppConfig.mockResolvedValue({
      interfaceConfig: { privacyPolicy: { externalUrl: 'https://example.com/privacy' } },
    });

    const response = await request(createAnonymousApp()).get('/api/config');

    expect(response.body.interface).not.toHaveProperty('loginFooter');
  });

  it('does not invent an interface object when nothing at all is configured', async () => {
    mockGetAppConfig.mockResolvedValue({ interfaceConfig: {} });

    const response = await request(createAnonymousApp()).get('/api/config');

    expect(response.body).not.toHaveProperty('interface');
  });

  it('ignores a non-string value instead of passing it through', async () => {
    mockGetAppConfig.mockResolvedValue({
      interfaceConfig: { loginFooter: { text: 'nope' } },
    });

    const response = await request(createAnonymousApp()).get('/api/config');

    expect(response.body).not.toHaveProperty('interface');
  });
});
