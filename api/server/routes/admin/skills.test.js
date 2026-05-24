const express = require('express');
const request = require('supertest');

const mockRequireJwtAuth = jest.fn((req, res, next) => next());
const mockRequireAdminAccess = jest.fn((req, res, next) => next());
const mockRequireCapability = jest.fn(() => mockRequireAdminAccess);

jest.mock('@librechat/data-schemas', () => ({
  SystemCapabilities: { ACCESS_ADMIN: 'ACCESS_ADMIN' },
}));

jest.mock('@librechat/api', () => ({
  createAdminSkillsSyncHandlers: jest.fn(() => ({
    getSyncStatus: jest.fn((req, res) => res.status(200).json({ ok: true })),
    runSync: jest.fn((req, res) => res.status(200).json({ ok: true })),
    setCredential: jest.fn((req, res) => res.status(200).json({ ok: true })),
    deleteCredential: jest.fn((req, res) => res.status(200).json({ ok: true })),
  })),
}));

jest.mock('~/server/middleware/roles/capabilities', () => ({
  requireCapability: mockRequireCapability,
}));

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: mockRequireJwtAuth,
}));

jest.mock('~/models', () => ({
  upsertSkillSyncCredential: jest.fn(),
  deleteSkillSyncCredential: jest.fn(),
}));

jest.mock('~/server/services/Skills/sync', () => ({
  getGitHubSkillSyncRunner: jest.fn(() => ({
    getStatus: jest.fn(),
    runOnce: jest.fn(),
  })),
}));

describe('admin skills sync routes', () => {
  it('requires JWT auth and ACCESS_ADMIN for sync endpoints', async () => {
    const router = require('./skills');
    const app = express();
    app.use(express.json());
    app.use('/api/admin/skills', router);

    await request(app).get('/api/admin/skills/sync/status').expect(200);

    expect(mockRequireCapability).toHaveBeenCalledWith('ACCESS_ADMIN');
    expect(mockRequireJwtAuth).toHaveBeenCalled();
    expect(mockRequireAdminAccess).toHaveBeenCalled();
  });
});
