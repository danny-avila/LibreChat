const express = require('express');
const request = require('supertest');

const mockHandleSteerRequest = jest.fn();
const mockCheckAccess = jest.fn();
const mockCheckPermission = jest.fn();
const mockHasCapability = jest.fn();
const mockGetAgent = jest.fn();
const mockLogger = { warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() };

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: mockLogger,
}));

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  handleSteerRequest: (...args) => mockHandleSteerRequest(...args),
  checkAccess: (...args) => mockCheckAccess(...args),
}));

jest.mock('~/server/services/PermissionService', () => ({
  checkPermission: (...args) => mockCheckPermission(...args),
}));

jest.mock('~/server/middleware/roles/capabilities', () => ({
  hasCapability: (...args) => mockHasCapability(...args),
}));

jest.mock('~/models', () => ({
  getRoleByName: jest.fn(),
  getAgent: (...args) => mockGetAgent(...args),
  getFiles: jest.fn(),
  updateFilesUsage: jest.fn(),
}));

const { Permissions, PermissionTypes, PermissionBits } = require('librechat-data-provider');
const SteerController = require('~/server/controllers/agents/steer');

/**
 * The guard ladder itself (validation, file sanitization, ownership, enqueue
 * codes) is typed logic in `@librechat/api` and is covered against the REAL
 * in-memory job manager by `packages/api/src/agents/steering/__tests__/request.spec.ts`.
 * This spec only pins the thin wrapper contract: pass-through of user/body,
 * verbatim status/body serialization, and the 500 failure envelope.
 */
function buildApp(user = { id: 'user-1', tenantId: 'tenant-1' }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  app.post('/chat/steer', SteerController);
  return app;
}

describe('SteerController (wrapper)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('serializes the handler result verbatim', async () => {
    mockHandleSteerRequest.mockResolvedValue({
      status: 202,
      body: { status: 'queued', steerId: 's1', position: 1, conversationId: 'c1' },
    });

    const res = await request(buildApp())
      .post('/chat/steer')
      .send({ conversationId: 'c1', text: 'hello', files: [{ file_id: 'f1' }] });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({
      status: 'queued',
      steerId: 's1',
      position: 1,
      conversationId: 'c1',
    });
    expect(mockHandleSteerRequest).toHaveBeenCalledWith(
      { id: 'user-1', tenantId: 'tenant-1' },
      { conversationId: 'c1', text: 'hello', files: [{ file_id: 'f1' }] },
      {
        getFiles: expect.any(Function),
        updateFilesUsage: expect.any(Function),
        checkAgentAccess: expect.any(Function),
      },
    );
  });

  it('passes rejection statuses through untouched', async () => {
    mockHandleSteerRequest.mockResolvedValue({ status: 409, body: { code: 'RUN_PAUSED' } });

    const res = await request(buildApp()).post('/chat/steer').send({ conversationId: 'c1' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('RUN_PAUSED');
  });

  it('500s with STEER_FAILED when the handler throws', async () => {
    mockHandleSteerRequest.mockRejectedValue(new Error('store down'));

    const res = await request(buildApp())
      .post('/chat/steer')
      .send({ conversationId: 'c1', text: 'x' });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('STEER_FAILED');
    expect(mockLogger.error).toHaveBeenCalled();
  });
});

describe('createAgentAccessCheck (chat-route parity via job identity)', () => {
  /** Posts a steer to capture the wired deps, then exercises the callback. */
  async function captureAccessCheck(user) {
    mockHandleSteerRequest.mockResolvedValue({ status: 202, body: {} });
    await request(buildApp(user)).post('/chat/steer').send({ conversationId: 'c1', text: 'x' });
    return mockHandleSteerRequest.mock.calls[0][2].checkAgentAccess;
  }

  const roleUser = { id: 'user-1', tenantId: 'tenant-1', role: 'USER' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckAccess.mockResolvedValue(true);
    mockHasCapability.mockResolvedValue(false);
    mockGetAgent.mockResolvedValue({ _id: 'oid-1', id: 'agent_abc' });
    mockCheckPermission.mockResolvedValue(true);
  });

  it('denies an agents run when the AGENTS:USE role gate fails, skipping resource calls', async () => {
    mockCheckAccess.mockResolvedValue(false);
    const check = await captureAccessCheck(roleUser);

    await expect(check({ agentId: 'agent_abc', endpoint: 'agents' })).resolves.toBe(false);
    expect(mockCheckAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        permissionType: PermissionTypes.AGENTS,
        permissions: [Permissions.USE],
      }),
    );
    expect(mockGetAgent).not.toHaveBeenCalled();
    expect(mockCheckPermission).not.toHaveBeenCalled();
  });

  it('runs the VIEW resource check against the resolved agent', async () => {
    const check = await captureAccessCheck(roleUser);

    await expect(check({ agentId: 'agent_abc', endpoint: 'agents' })).resolves.toBe(true);
    expect(mockGetAgent).toHaveBeenCalledWith({ id: 'agent_abc' });
    expect(mockCheckPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        resourceId: 'oid-1',
        requiredPermission: PermissionBits.VIEW,
      }),
    );
  });

  it('denies when the agent is gone or the ACL check fails', async () => {
    const check = await captureAccessCheck(roleUser);

    mockGetAgent.mockResolvedValueOnce(null);
    await expect(check({ agentId: 'agent_abc', endpoint: 'agents' })).resolves.toBe(false);

    mockCheckPermission.mockResolvedValueOnce(false);
    await expect(check({ agentId: 'agent_abc', endpoint: 'agents' })).resolves.toBe(false);
  });

  it('honors the capability bypass without touching the agent or ACL', async () => {
    mockHasCapability.mockResolvedValue(true);
    const check = await captureAccessCheck(roleUser);

    await expect(check({ agentId: 'agent_abc', endpoint: 'agents' })).resolves.toBe(true);
    expect(mockGetAgent).not.toHaveBeenCalled();
    expect(mockCheckPermission).not.toHaveBeenCalled();
  });

  it('allows ephemeral runs with no role gate (skipAgentCheck parity for non-agents endpoints)', async () => {
    const check = await captureAccessCheck(roleUser);

    await expect(check({ agentId: undefined, endpoint: 'openAI' })).resolves.toBe(true);
    expect(mockCheckAccess).not.toHaveBeenCalled();
    expect(mockCheckPermission).not.toHaveBeenCalled();
  });

  it('applies both gates when metadata has a real agent but no endpoint yet', async () => {
    const check = await captureAccessCheck(roleUser);

    await expect(check({ agentId: 'agent_abc', endpoint: undefined })).resolves.toBe(true);
    expect(mockCheckAccess).toHaveBeenCalled();
    expect(mockCheckPermission).toHaveBeenCalled();
  });
});
