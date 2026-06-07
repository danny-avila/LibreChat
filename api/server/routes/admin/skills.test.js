const express = require('express');
const request = require('supertest');

const mockRequireJwtAuth = jest.fn((req, res, next) => {
  req.user = { id: 'user-1', role: 'ADMIN', tenantId: 'tenant-a' };
  next();
});
const mockCapabilityMiddleware = jest.fn((req, res, next) => next());
const mockRequireCapability = jest.fn(() => mockCapabilityMiddleware);
const mockHasCapability = jest.fn().mockResolvedValue(true);
let mockResolvedConfig = { skillSync: { github: { enabled: false, sources: [] } } };
const mockConfigMiddleware = jest.fn((req, res, next) => {
  req.config = mockResolvedConfig;
  next();
});
const mockGetAppConfig = jest.fn();
const mockGetGitHubSkillSyncRunnerForRequest = jest.fn();
const mockHandlers = {
  getSyncStatus: jest.fn((req, res) => res.status(200).json({ ok: true })),
  runSync: jest.fn((req, res) => res.status(200).json({ ok: true })),
  setCredential: jest.fn((req, res) => res.status(200).json({ ok: true })),
  deleteCredential: jest.fn((req, res) => res.status(200).json({ ok: true })),
};

jest.mock('@librechat/data-schemas', () => ({
  SystemCapabilities: {
    ACCESS_ADMIN: 'access:admin',
    READ_SKILLS: 'read:skills',
    MANAGE_SKILLS: 'manage:skills',
  },
}));

jest.mock('@librechat/api', () => ({
  createAdminSkillsSyncHandlers: jest.fn(() => mockHandlers),
}));

jest.mock('~/server/middleware/roles/capabilities', () => ({
  hasCapability: mockHasCapability,
  requireCapability: mockRequireCapability,
}));

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: mockRequireJwtAuth,
}));

jest.mock('~/server/middleware/config/app', () => mockConfigMiddleware);

jest.mock('~/server/services/Config', () => ({
  getAppConfig: mockGetAppConfig,
}));

jest.mock('~/models', () => ({
  upsertSkillSyncCredential: jest.fn(),
  deleteSkillSyncCredential: jest.fn(),
}));

jest.mock('~/server/services/Skills/sync', () => ({
  getGitHubSkillSyncRunnerForRequest: mockGetGitHubSkillSyncRunnerForRequest,
}));

describe('admin skills sync routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasCapability.mockResolvedValue(true);
    mockResolvedConfig = { skillSync: { github: { enabled: false, sources: [] } } };
    mockGetAppConfig.mockResolvedValue({ skillSync: undefined });
  });

  function createApp() {
    const router = require('./skills');
    const app = express();
    app.use(express.json());
    app.use('/api/admin/skills', router);
    return app;
  }

  it('requires JWT auth and admin capabilities for sync endpoints', async () => {
    const app = createApp();

    await request(app).get('/api/admin/skills/sync/status').expect(200);
    await request(app).post('/api/admin/skills/sync/run').expect(200);
    await request(app).put('/api/admin/skills/sync/credentials/default').send({}).expect(200);
    await request(app).delete('/api/admin/skills/sync/credentials/default').expect(200);

    expect(mockRequireCapability).toHaveBeenCalledWith('access:admin');
    expect(mockRequireJwtAuth).toHaveBeenCalled();
    expect(mockCapabilityMiddleware).toHaveBeenCalled();
    expect(mockConfigMiddleware).toHaveBeenCalled();
    expect(mockHasCapability).toHaveBeenCalledTimes(5);
    expect(mockHasCapability).toHaveBeenCalledWith(
      { id: 'user-1', role: 'ADMIN', tenantId: 'tenant-a' },
      'read:skills',
    );
    expect(mockHasCapability).toHaveBeenCalledWith({ id: 'user-1', role: 'ADMIN' }, 'read:skills');
    expect(mockHasCapability).toHaveBeenCalledWith(
      { id: 'user-1', role: 'ADMIN' },
      'manage:skills',
    );
    const { createAdminSkillsSyncHandlers } = require('@librechat/api');
    expect(createAdminSkillsSyncHandlers).toHaveBeenCalledWith(
      expect.objectContaining({ getRunner: mockGetGitHubSkillSyncRunnerForRequest }),
    );
  });

  it('marks credential metadata hidden for tenant-scoped status reads', async () => {
    mockHasCapability.mockImplementation(async (user, capability) => {
      if (capability === 'read:skills') {
        return Boolean(user.tenantId);
      }
      return true;
    });
    const app = createApp();

    await request(app).get('/api/admin/skills/sync/status').expect(200);

    const req = mockHandlers.getSyncStatus.mock.calls[0][0];
    expect(req.skillSyncCanReadCredentials).toBe(false);
    expect(req.skillSyncAllowServerCredentials).toBe(false);
  });

  it('prevents tenant admins from running overrides that require server credentials', async () => {
    const skillSync = {
      github: {
        enabled: true,
        intervalMinutes: 60,
        runOnStartup: false,
        sources: [
          {
            id: 'tenant-skills',
            owner: 'LibreChat',
            repo: 'skills',
            ref: 'main',
            paths: ['skills'],
            token: '${GITHUB_SKILLS_TOKEN}',
          },
        ],
      },
    };
    mockResolvedConfig = { skillSync, config: {} };
    mockHasCapability.mockImplementation(async (user, capability) => {
      if (capability === 'manage:skills') {
        return Boolean(user.tenantId);
      }
      return true;
    });
    mockGetAppConfig.mockResolvedValue({ skillSync: undefined });
    const app = createApp();

    await request(app).post('/api/admin/skills/sync/run').expect(403);

    expect(mockHandlers.runSync).not.toHaveBeenCalled();
  });

  it('prevents tenant admins from manually running base skill sync config', async () => {
    const skillSync = {
      github: {
        enabled: true,
        intervalMinutes: 60,
        runOnStartup: false,
        sources: [
          {
            id: 'base-skills',
            owner: 'LibreChat',
            repo: 'skills',
            ref: 'main',
            paths: ['skills'],
            token: '${GITHUB_SKILLS_TOKEN}',
          },
        ],
      },
    };
    mockResolvedConfig = { skillSync };
    mockGetAppConfig.mockResolvedValue({ skillSync });
    mockHasCapability.mockImplementation(async (user, capability) => {
      if (capability === 'manage:skills') {
        return Boolean(user.tenantId);
      }
      return true;
    });
    const app = createApp();

    await request(app).post('/api/admin/skills/sync/run').expect(403);

    expect(mockHandlers.runSync).not.toHaveBeenCalled();
  });

  it('allows platform admins to manually run base skill sync config with server credentials', async () => {
    const skillSync = {
      github: {
        enabled: true,
        intervalMinutes: 60,
        runOnStartup: false,
        sources: [
          {
            id: 'base-skills',
            owner: 'LibreChat',
            repo: 'skills',
            ref: 'main',
            paths: ['skills'],
            token: '${GITHUB_SKILLS_TOKEN}',
          },
        ],
      },
    };
    mockResolvedConfig = { skillSync };
    mockGetAppConfig.mockResolvedValue({ skillSync });
    const app = createApp();

    await request(app).post('/api/admin/skills/sync/run').expect(200);

    const req = mockHandlers.runSync.mock.calls[0][0];
    expect(req.skillSyncAllowServerCredentials).toBe(true);
    expect(req.skillSyncCanReadCredentials).toBe(true);
    expect(req.config.config.skillSync).toEqual(skillSync);
  });
});
