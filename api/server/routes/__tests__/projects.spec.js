const express = require('express');
const request = require('supertest');

const resolvedConfig = {
  projects: {
    maxFiles: 3,
    maxInstructionsLength: 120,
    maxDescriptionLength: 80,
  },
};
const mockHandler = jest.fn((req, res) => {
  res.status(200).json({ config: req.config });
});
const mockCreateProjectHandlers = jest.fn(() => ({
  listProjects: mockHandler,
  createProject: mockHandler,
  assignConversationToProject: mockHandler,
  getProject: mockHandler,
  updateProject: mockHandler,
  deleteProject: mockHandler,
  listProjectFiles: mockHandler,
  listAvailableProjectFiles: mockHandler,
  addProjectFile: mockHandler,
  removeProjectFile: mockHandler,
}));
const mockRequireJwtAuth = jest.fn((req, _res, next) => {
  req.user = { id: 'project-user', tenantId: 'tenant-a' };
  next();
});
const mockConfigMiddleware = jest.fn((req, _res, next) => {
  req.config = resolvedConfig;
  next();
});

jest.mock('@librechat/api', () => ({ createProjectHandlers: mockCreateProjectHandlers }));
jest.mock('~/models', () => ({
  listChatProjects: jest.fn(),
  createChatProject: jest.fn(),
  getChatProject: jest.fn(),
  updateChatProject: jest.fn(),
  deleteChatProject: jest.fn(),
  assignConversationToProject: jest.fn(),
  addChatProjectFile: jest.fn(),
  removeChatProjectFile: jest.fn(),
  getProjectFiles: jest.fn(),
  getAvailableProjectFiles: jest.fn(),
}));
jest.mock('~/server/middleware', () => ({
  requireJwtAuth: mockRequireJwtAuth,
  configMiddleware: mockConfigMiddleware,
}));

const projectsRouter = require('../projects');

const app = express();
app.use(express.json());
app.use('/api/projects', projectsRouter);

describe('Projects route middleware', () => {
  beforeEach(() => {
    mockRequireJwtAuth.mockClear();
    mockConfigMiddleware.mockClear();
    mockHandler.mockClear();
  });

  it('resolves the authenticated user config before project mutation handlers', async () => {
    const response = await request(app)
      .post('/api/projects')
      .send({ name: 'Configured project', instructions: 'Use the configured limits.' });

    expect(response.status).toBe(200);
    expect(response.body.config).toEqual(resolvedConfig);
    expect(mockRequireJwtAuth).toHaveBeenCalledTimes(1);
    expect(mockConfigMiddleware).toHaveBeenCalledTimes(1);
    expect(mockHandler).toHaveBeenCalledTimes(1);
    expect(mockHandler.mock.calls[0][0].config).toEqual(resolvedConfig);
    expect(mockRequireJwtAuth.mock.invocationCallOrder[0]).toBeLessThan(
      mockConfigMiddleware.mock.invocationCallOrder[0],
    );
    expect(mockConfigMiddleware.mock.calls[0][0].user).toEqual({
      id: 'project-user',
      tenantId: 'tenant-a',
    });
    expect(mockConfigMiddleware.mock.invocationCallOrder[0]).toBeLessThan(
      mockHandler.mock.invocationCallOrder[0],
    );
  });
});
