jest.mock('~/cache/getLogStores');

const mockGetAppConfig = jest.fn();
jest.mock('~/server/services/Config/app', () => ({
  getAppConfig: (...args) => mockGetAppConfig(...args),
}));

jest.mock('~/server/services/Config/ldap', () => ({
  getLdapConfig: jest.fn(() => null),
}));

const mockGetTenantId = jest.fn(() => undefined);
jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  getTenantId: (...args) => mockGetTenantId(...args),
}));

const request = require('supertest');
const express = require('express');
const configRoute = require('../config');

function createApp(user) {
  const app = express();
  app.disable('x-powered-by');
  if (user) {
    app.use((req, _res, next) => {
      req.user = user;
      next();
    });
  }
  app.use('/api/config', configRoute);
  return app;
}

const baseAppConfig = {
  registration: { socialLogins: ['google', 'github'] },
  interfaceConfig: {
    privacyPolicy: { externalUrl: 'https://example.com/privacy' },
    termsOfService: { externalUrl: 'https://example.com/tos' },
    modelSelect: true,
  },
  turnstileConfig: { siteKey: 'test-key' },
  modelSpecs: { list: [{ name: 'test-spec' }] },
  webSearch: { searchProvider: 'tavily' },
};

const mockUser = {
  id: 'user123',
  role: 'USER',
  tenantId: undefined,
};

afterEach(() => {
  jest.resetAllMocks();
  delete process.env.APP_TITLE;
  delete process.env.CHECK_BALANCE;
  delete process.env.START_BALANCE;
  delete process.env.SANDPACK_BUNDLER_URL;
  delete process.env.SANDPACK_STATIC_BUNDLER_URL;
  delete process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES;
  delete process.env.ALLOW_REGISTRATION;
  delete process.env.ALLOW_SOCIAL_LOGIN;
  delete process.env.ALLOW_PASSWORD_RESET;
  delete process.env.DOMAIN_SERVER;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.OPENID_CLIENT_ID;
  delete process.env.OPENID_CLIENT_SECRET;
  delete process.env.OPENID_ISSUER;
  delete process.env.OPENID_SESSION_SECRET;
  delete process.env.GITHUB_CLIENT_ID;
  delete process.env.GITHUB_CLIENT_SECRET;
  delete process.env.DISCORD_CLIENT_ID;
  delete process.env.DISCORD_CLIENT_SECRET;
  delete process.env.SAML_ENTRY_POINT;
  delete process.env.SAML_ISSUER;
  delete process.env.SAML_CERT;
  delete process.env.SAML_SESSION_SECRET;
});

describe('GET /api/config', () => {
  describe('unauthenticated (no req.user)', () => {
    it('should call getAppConfig with baseOnly when no tenant context', async () => {
      mockGetAppConfig.mockResolvedValue(baseAppConfig);
      mockGetTenantId.mockReturnValue(undefined);
      const app = createApp(null);

      await request(app).get('/api/config');

      expect(mockGetAppConfig).toHaveBeenCalledWith({ baseOnly: true });
    });

    it('should call getAppConfig with tenantId when tenant context is present', async () => {
      mockGetAppConfig.mockResolvedValue(baseAppConfig);
      mockGetTenantId.mockReturnValue('tenant-abc');
      const app = createApp(null);

      await request(app).get('/api/config');

      expect(mockGetAppConfig).toHaveBeenCalledWith({ tenantId: 'tenant-abc' });
    });

    it('should map tenant-scoped config fields in unauthenticated response', async () => {
      const tenantConfig = {
        ...baseAppConfig,
        registration: { socialLogins: ['saml'] },
        turnstileConfig: { siteKey: 'tenant-key' },
      };
      mockGetAppConfig.mockResolvedValue(tenantConfig);
      mockGetTenantId.mockReturnValue('tenant-abc');
      const app = createApp(null);

      const response = await request(app).get('/api/config');

      expect(response.statusCode).toBe(200);
      expect(response.body.socialLogins).toEqual(['saml']);
      expect(response.body.turnstile).toEqual({ siteKey: 'tenant-key' });
      expect(response.body).not.toHaveProperty('modelSpecs');
    });

    it('should return minimal payload without authenticated-only fields', async () => {
      mockGetAppConfig.mockResolvedValue(baseAppConfig);
      const app = createApp(null);

      const response = await request(app).get('/api/config');

      expect(response.statusCode).toBe(200);
      expect(response.body).not.toHaveProperty('modelSpecs');
      expect(response.body).not.toHaveProperty('balance');
      expect(response.body).not.toHaveProperty('webSearch');
      expect(response.body).not.toHaveProperty('bundlerURL');
      expect(response.body).not.toHaveProperty('staticBundlerURL');
      expect(response.body).not.toHaveProperty('sharePointFilePickerEnabled');
      expect(response.body).not.toHaveProperty('conversationImportMaxFileSize');
    });

    it('should include socialLogins and turnstile from base config', async () => {
      mockGetAppConfig.mockResolvedValue(baseAppConfig);
      const app = createApp(null);

      const response = await request(app).get('/api/config');

      expect(response.body.socialLogins).toEqual(['google', 'github']);
      expect(response.body.turnstile).toEqual({ siteKey: 'test-key' });
    });

    it('should include only privacyPolicy and termsOfService from interface config', async () => {
      mockGetAppConfig.mockResolvedValue(baseAppConfig);
      const app = createApp(null);

      const response = await request(app).get('/api/config');

      expect(response.body.interface).toEqual({
        privacyPolicy: { externalUrl: 'https://example.com/privacy' },
        termsOfService: { externalUrl: 'https://example.com/tos' },
      });
      expect(response.body.interface).not.toHaveProperty('modelSelect');
    });

    it('should not include interface if no privacyPolicy or termsOfService', async () => {
      mockGetAppConfig.mockResolvedValue({
        ...baseAppConfig,
        interfaceConfig: { modelSelect: true },
      });
      const app = createApp(null);

      const response = await request(app).get('/api/config');

      expect(response.body).not.toHaveProperty('interface');
    });

    it('should include shared env var fields', async () => {
      mockGetAppConfig.mockResolvedValue(baseAppConfig);
      process.env.APP_TITLE = 'Test App';
      const app = createApp(null);

      const response = await request(app).get('/api/config');

      expect(response.body.appTitle).toBe('Test App');
      expect(response.body).toHaveProperty('emailLoginEnabled');
      expect(response.body).toHaveProperty('serverDomain');
    });

    it('should return 500 when getAppConfig throws', async () => {
      mockGetAppConfig.mockRejectedValue(new Error('Config service failure'));
      const app = createApp(null);

      const response = await request(app).get('/api/config');

      expect(response.statusCode).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('authenticated (req.user exists)', () => {
    it('should call getAppConfig with role, userId, and tenantId', async () => {
      mockGetAppConfig.mockResolvedValue(baseAppConfig);
      mockGetTenantId.mockReturnValue('fallback-tenant');
      const app = createApp(mockUser);

      await request(app).get('/api/config');

      expect(mockGetAppConfig).toHaveBeenCalledWith({
        role: 'USER',
        userId: 'user123',
        tenantId: 'fallback-tenant',
      });
    });

    it('should prefer user tenantId over getTenantId fallback', async () => {
      mockGetAppConfig.mockResolvedValue(baseAppConfig);
      mockGetTenantId.mockReturnValue('fallback-tenant');
      const app = createApp({ ...mockUser, tenantId: 'user-tenant' });

      await request(app).get('/api/config');

      expect(mockGetAppConfig).toHaveBeenCalledWith({
        role: 'USER',
        userId: 'user123',
        tenantId: 'user-tenant',
      });
    });

    it('should include modelSpecs, balance, and webSearch', async () => {
      mockGetAppConfig.mockResolvedValue(baseAppConfig);
      process.env.CHECK_BALANCE = 'true';
      process.env.START_BALANCE = '10000';
      const app = createApp(mockUser);

      const response = await request(app).get('/api/config');

      expect(response.body.modelSpecs).toEqual({ list: [{ name: 'test-spec' }] });
      expect(response.body.balance).toEqual({ enabled: true, startBalance: 10000 });
      expect(response.body.webSearch).toEqual({ searchProvider: 'tavily' });
    });

    it('should include full interface config', async () => {
      mockGetAppConfig.mockResolvedValue(baseAppConfig);
      const app = createApp(mockUser);

      const response = await request(app).get('/api/config');

      expect(response.body.interface).toEqual(baseAppConfig.interfaceConfig);
    });

    it('should include authenticated-only env var fields', async () => {
      mockGetAppConfig.mockResolvedValue(baseAppConfig);
      process.env.SANDPACK_BUNDLER_URL = 'https://bundler.test';
      process.env.SANDPACK_STATIC_BUNDLER_URL = 'https://static-bundler.test';
      process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES = '5000000';
      const app = createApp(mockUser);

      const response = await request(app).get('/api/config');

      expect(response.body.bundlerURL).toBe('https://bundler.test');
      expect(response.body.staticBundlerURL).toBe('https://static-bundler.test');
      expect(response.body.conversationImportMaxFileSize).toBe(5000000);
    });

    it('should merge per-user balance override into config', async () => {
      mockGetAppConfig.mockResolvedValue({
        ...baseAppConfig,
        balance: {
          enabled: true,
          startBalance: 50000,
        },
      });
      const app = createApp(mockUser);

      const response = await request(app).get('/api/config');

      expect(response.body.balance).toEqual(
        expect.objectContaining({
          enabled: true,
          startBalance: 50000,
        }),
      );
    });

    it('should return 500 when getAppConfig throws', async () => {
      mockGetAppConfig.mockRejectedValue(new Error('Config service failure'));
      const app = createApp(mockUser);

      const response = await request(app).get('/api/config');

      expect(response.statusCode).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });
});
