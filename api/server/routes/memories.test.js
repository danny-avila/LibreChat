const express = require('express');
const request = require('supertest');

const mockGetAllUserMemories = jest.fn();
const mockProjectStoredMemories = jest.fn((memories) => memories);
const mockSetMemoryById = jest.fn();
const mockDeleteMemoryById = jest.fn();
const mockOpaqueUpdateById = jest.fn((_req, res) => res.status(202).json({ delegated: 'update' }));
const mockOpaqueDeleteById = jest.fn((_req, res) => res.status(202).json({ delegated: 'delete' }));
let mockFilters;

jest.mock('@librechat/api', () => ({
  Tokenizer: { getTokenCount: jest.fn(() => 1) },
  generateCheckAccess: jest.fn(() => (_req, _res, next) => next()),
  inspectContent: jest.fn(() => null),
  extractMemoryContent: jest.fn(() => []),
  projectStoredMemories: (...args) => mockProjectStoredMemories(...args),
  createMemoryManagementHandlers: jest.fn(() => ({
    updateById: (...args) => mockOpaqueUpdateById(...args),
    deleteById: (...args) => mockOpaqueDeleteById(...args),
  })),
  contentFilterBlockResponse: jest.fn(),
}));

jest.mock('librechat-data-provider', () => ({
  PermissionTypes: { MEMORIES: 'MEMORIES' },
  Permissions: {
    USE: 'USE',
    READ: 'READ',
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    OPT_OUT: 'OPT_OUT',
  },
  ResourceType: { AGENT: 'agent' },
  PermissionBits: { VIEW: 1 },
}));

jest.mock('~/server/services/PermissionService', () => ({
  findAccessibleResources: jest.fn().mockResolvedValue([]),
}));

jest.mock('~/models', () => ({
  getAllUserMemories: (...args) => mockGetAllUserMemories(...args),
  getUserMemories: jest.fn(),
  toggleUserMemories: jest.fn(),
  getRoleByName: jest.fn(),
  createMemory: jest.fn(),
  deleteMemory: jest.fn(),
  setMemory: jest.fn(),
  setMemoryById: (...args) => mockSetMemoryById(...args),
  deleteMemoryById: (...args) => mockDeleteMemoryById(...args),
  getAgents: jest.fn(),
}));

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, _res, next) => {
    req.user = { id: 'user-1', role: 'USER' };
    next();
  },
  configMiddleware: (req, _res, next) => {
    req.config = {
      filters: mockFilters,
      memory: { tokenLimit: 100, charLimit: 10000 },
    };
    next();
  },
}));

const memoriesRouter = require('./memories');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/memories', memoriesRouter);
  return app;
};

describe('GET /api/memories content policy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFilters = {
      memories: {
        pii: {
          starterPatterns: [],
          customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE' }],
        },
      },
    };
    mockProjectStoredMemories.mockImplementation((memories) => memories);
  });

  it('returns a marked raw-free projection when current policy blocks a stored memory', async () => {
    const secret = 'PRIVATE-STORED';
    const stored = [
      {
        _id: 'memory-1',
        userId: 'user-1',
        key: 'safe key',
        value: secret,
        tokenCount: 7,
        updated_at: '2026-08-01T00:00:00.000Z',
      },
    ];
    mockGetAllUserMemories.mockResolvedValue(stored);
    mockProjectStoredMemories.mockReturnValue([
      {
        ...stored[0],
        value: '',
        contentFilterBlocked: true,
      },
    ]);

    const response = await request(buildApp()).get('/api/memories');

    expect(response.status).toBe(200);
    expect(mockProjectStoredMemories).toHaveBeenCalledWith(stored, mockFilters);
    expect(response.body.memories).toEqual([
      expect.objectContaining({
        _id: 'memory-1',
        key: 'safe key',
        value: '',
        contentFilterBlocked: true,
      }),
    ]);
    expect(response.body.totalTokens).toBe(7);
    expect(JSON.stringify(response.body)).not.toContain(secret);
  });

  it('preserves safe stored memories and their existing response metadata', async () => {
    const stored = [
      {
        _id: 'memory-safe',
        userId: 'user-1',
        key: 'timezone',
        value: 'UTC',
        tokenCount: 3,
        updated_at: '2026-08-02T00:00:00.000Z',
      },
    ];
    mockGetAllUserMemories.mockResolvedValue(stored);

    const response = await request(buildApp()).get('/api/memories');

    expect(response.status).toBe(200);
    expect(response.body.memories).toEqual(stored);
    expect(response.body).toMatchObject({
      totalTokens: 3,
      tokenLimit: 100,
      charLimit: 10000,
      usagePercentage: 3,
    });
  });

  it('does not expose stored content through projection errors', async () => {
    const secret = 'PRIVATE-ERROR-CONTEXT';
    mockGetAllUserMemories.mockResolvedValue([{ key: 'safe key', value: secret }]);
    mockProjectStoredMemories.mockImplementationOnce(() => {
      throw new Error(`projection failed for ${secret}`);
    });

    const response = await request(buildApp()).get('/api/memories');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to retrieve memories.' });
    expect(JSON.stringify(response.body)).not.toContain(secret);
  });
});

describe('opaque memory management routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFilters = {
      memories: {
        pii: {
          starterPatterns: [],
          customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE' }],
        },
      },
    };
  });

  it('delegates id updates to the typed handler after request middleware', async () => {
    const response = await request(buildApp())
      .patch('/api/memories/id/507f1f77bcf86cd799439011?agentId=agent-1')
      .send({ value: 'safe replacement' });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ delegated: 'update' });
    expect(mockOpaqueUpdateById).toHaveBeenCalledTimes(1);
    expect(mockOpaqueUpdateById.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        params: { id: '507f1f77bcf86cd799439011' },
        query: { agentId: 'agent-1' },
        body: { value: 'safe replacement' },
        user: { id: 'user-1', role: 'USER' },
        config: expect.objectContaining({ filters: mockFilters }),
      }),
    );
  });

  it('delegates id deletes to the typed handler', async () => {
    const response = await request(buildApp()).delete(
      '/api/memories/id/507f1f77bcf86cd799439011?agentId=agent-1',
    );

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ delegated: 'delete' });
    expect(mockOpaqueDeleteById).toHaveBeenCalledTimes(1);
    expect(mockOpaqueDeleteById.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        params: { id: '507f1f77bcf86cd799439011' },
        query: { agentId: 'agent-1' },
        user: { id: 'user-1', role: 'USER' },
      }),
    );
  });
});
