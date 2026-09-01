const express = require('express');
const request = require('supertest');

const mockGetAllUserMemories = jest.fn();
const mockGetUserMemories = jest.fn();
const mockCreateMemory = jest.fn();
const mockProjectStoredMemories = jest.fn((memories) => memories);
const mockSetMemoryById = jest.fn();
const mockDeleteMemoryById = jest.fn();
const mockGetAgent = jest.fn();
const mockCheckPermission = jest.fn();
const mockHasCapability = jest.fn();
const mockOpaqueUpdateById = jest.fn((_req, res) => res.status(202).json({ delegated: 'update' }));
const mockOpaqueDeleteById = jest.fn((_req, res) => res.status(202).json({ delegated: 'delete' }));
let mockFilters;

jest.mock('@librechat/api', () => ({
  Tokenizer: { getTokenCount: jest.fn(() => 1) },
  generateCheckAccess: jest.fn(() => (_req, _res, next) => next()),
  inspectContent: jest.fn(() => null),
  extractMemoryContent: jest.fn(() => []),
  projectStoredMemories: (...args) => mockProjectStoredMemories(...args),
  blockFilteredMemoryContent: jest.fn(() => false),
  createMemoryManagementHandlers: jest.fn(() => ({
    updateById: (...args) => mockOpaqueUpdateById(...args),
    deleteById: (...args) => mockOpaqueDeleteById(...args),
  })),
  contentFilterBlockResponse: jest.fn(),
}));

jest.mock('@librechat/data-schemas', () => ({
  ResourceCapabilityMap: { agent: 'manage:agents' },
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
  checkPermission: (...args) => mockCheckPermission(...args),
  findAccessibleResources: jest.fn().mockResolvedValue([]),
}));

jest.mock('~/server/middleware/roles/capabilities', () => ({
  hasCapability: (...args) => mockHasCapability(...args),
}));

jest.mock('~/models', () => ({
  getAllUserMemories: (...args) => mockGetAllUserMemories(...args),
  getUserMemories: (...args) => mockGetUserMemories(...args),
  toggleUserMemories: jest.fn(),
  getRoleByName: jest.fn(),
  createMemory: (...args) => mockCreateMemory(...args),
  deleteMemory: jest.fn(),
  setMemory: jest.fn(),
  setMemoryById: (...args) => mockSetMemoryById(...args),
  deleteMemoryById: (...args) => mockDeleteMemoryById(...args),
  getAgent: (...args) => mockGetAgent(...args),
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

describe('agent memory partition authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFilters = undefined;
    mockGetAgent.mockResolvedValue({ _id: 'agent-object-id', id: 'agent-1' });
    mockCheckPermission.mockResolvedValue(true);
    mockHasCapability.mockResolvedValue(false);
  });

  it('rejects a nonexistent client-selected agent partition', async () => {
    mockGetAgent.mockResolvedValue(null);

    const response = await request(buildApp())
      .post('/api/memories')
      .send({ key: 'timezone', value: 'UTC', agentId: ' attacker-partition ' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Agent not found.' });
    expect(mockGetAgent).toHaveBeenCalledWith({ id: 'attacker-partition' });
    expect(mockGetUserMemories).not.toHaveBeenCalled();
    expect(mockCreateMemory).not.toHaveBeenCalled();
  });

  it('rejects an agent partition the requester cannot view', async () => {
    mockCheckPermission.mockResolvedValue(false);

    const response = await request(buildApp())
      .post('/api/memories')
      .send({ key: 'timezone', value: 'UTC', agentId: 'agent-1' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Agent access denied.' });
    expect(mockCheckPermission).toHaveBeenCalledWith({
      userId: 'user-1',
      role: 'USER',
      resourceType: 'agent',
      resourceId: 'agent-object-id',
      requiredPermission: 1,
    });
    expect(mockGetUserMemories).not.toHaveBeenCalled();
    expect(mockCreateMemory).not.toHaveBeenCalled();
  });

  it('allows a partition for an agent the requester can view', async () => {
    mockGetUserMemories
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ key: 'timezone', value: 'UTC', agentId: 'agent-1' }]);
    mockCreateMemory.mockResolvedValue({ ok: true });

    const response = await request(buildApp())
      .post('/api/memories')
      .send({ key: 'timezone', value: 'UTC', agentId: 'agent-1' });

    expect(response.status).toBe(201);
    expect(mockCreateMemory).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', agentId: 'agent-1' }),
    );
  });
});

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
