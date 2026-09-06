const express = require('express');
const request = require('supertest');

const mockList = jest.fn((_req, res) => res.json({ object: 'list' }));
const mockWrite = jest.fn((_req, res) => res.json({ saved: true }));
const mockSync = jest.fn();
const mockIp = jest.fn((_req, _res, next) => next());
const mockUser = jest.fn((_req, _res, next) => next());
const mockAuth = jest.fn((_req, _res, next) => next());
jest.mock('@librechat/api', () => ({
  createSkillManagementHandlers: () => ({
    list: mockList,
    get: mockList,
    update: mockWrite,
    listFiles: mockList,
    getFile: mockList,
    updateFile: mockWrite,
  }),
  mapAgentManagementError: () => ({ status: 404, body: { error: { code: 'not_found' } } }),
}));
jest.mock('../middleware', () => ({ requireAgentManagementAuth: (...args) => mockAuth(...args) }));
jest.mock('~/server/middleware', () => ({
  checkBan: (_req, _res, next) => next(),
  configMiddleware: (req, _res, next) => {
    req.config = { tenantConfig: true };
    next();
  },
}));
jest.mock('~/server/middleware/roles/capabilities', () => ({ hasCapability: jest.fn() }));
jest.mock('~/server/services/PermissionService', () => ({ checkPermission: jest.fn() }));
jest.mock('~/server/services/Skills/handlers', () => ({ getSkillsHandlers: jest.fn() }));
jest.mock('~/server/services/Skills/sync', () => ({
  maybeRunGitHubSkillSyncForRequest: (...args) => mockSync(...args),
}));
jest.mock('~/server/services/Endpoints/agents/skillDeps', () => ({
  getSkillDbMethods: () => ({}),
  getSkillToolDeps: () => ({}),
}));
jest.mock('~/models', () => ({}));
jest.mock('~/server/middleware/limiters/uploadLimiters', () => ({
  createFileLimiters: () => ({
    fileUploadIpLimiter: (...args) => mockIp(...args),
    fileUploadUserLimiter: (...args) => mockUser(...args),
  }),
}));
const app = express();
app.use(express.json());
app.use('/skills', require('../skills'));

it('starts tenant-aware sync with effective config before listing', async () => {
  await request(app).get('/skills').expect(200);
  expect(mockSync).toHaveBeenCalledWith(
    expect.objectContaining({ config: { tenantConfig: true } }),
  );
  expect(mockSync.mock.invocationCallOrder[0]).toBeLessThan(mockList.mock.invocationCallOrder[0]);
});
it('continues listing if the background sync trigger fails', async () => {
  mockSync.mockRejectedValueOnce(new Error('sync unavailable'));
  await request(app).get('/skills').expect(200);
  expect(mockList).toHaveBeenCalledTimes(1);
});
it('does not start sync for unauthenticated requests', async () => {
  mockAuth.mockImplementationOnce((_req, res) => res.sendStatus(401));
  await request(app).get('/skills').expect(401);
  expect(mockSync).not.toHaveBeenCalled();
});
it.each(['ip', 'user'])('blocks storage writes at the %s limiter', async (kind) => {
  (kind === 'ip' ? mockIp : mockUser).mockImplementationOnce((_req, res) => res.sendStatus(429));
  await request(app).put('/skills/id/files/note.txt').send({ content: 'text' }).expect(429);
  expect(mockWrite).not.toHaveBeenCalled();
});
it('passes admitted file writes through both limiters', async () => {
  await request(app).put('/skills/id/files/note.txt').send({ content: 'text' }).expect(200);
  expect(mockIp).toHaveBeenCalledTimes(1);
  expect(mockUser).toHaveBeenCalledTimes(1);
  expect(mockWrite).toHaveBeenCalledTimes(1);
});
