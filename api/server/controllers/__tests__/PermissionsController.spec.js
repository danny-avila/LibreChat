const mongoose = require('mongoose');

const mockLogger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };

jest.mock('@librechat/data-schemas', () => ({
  logger: mockLogger,
}));

const { ResourceType, PrincipalType } = jest.requireActual('librechat-data-provider');

jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
}));

jest.mock('@librechat/api', () => ({
  enrichRemoteAgentPrincipals: jest.fn(),
  backfillRemoteAgentPermissions: jest.fn(),
}));

const mockBulkUpdateResourcePermissions = jest.fn();

jest.mock('~/server/services/PermissionService', () => ({
  bulkUpdateResourcePermissions: (...args) => mockBulkUpdateResourcePermissions(...args),
  ensureGroupPrincipalExists: jest.fn(),
  getEffectivePermissions: jest.fn(),
  ensurePrincipalExists: jest.fn(),
  getAvailableRoles: jest.fn(),
  findAccessibleResources: jest.fn(),
  getResourcePermissionsMap: jest.fn(),
}));

jest.mock('~/models', () => ({
  searchPrincipals: jest.fn(),
  sortPrincipalsByRelevance: jest.fn(),
  calculateRelevanceScore: jest.fn(),
}));

jest.mock('~/server/services/GraphApiService', () => ({
  entraIdPrincipalFeatureEnabled: jest.fn(() => false),
  searchEntraIdPrincipals: jest.fn(),
}));

const mockAgentFindOne = jest.fn();
const mockUserUpdateMany = jest.fn();

jest.mock('~/db/models', () => ({
  Agent: {
    findOne: (...args) => mockAgentFindOne(...args),
  },
  AclEntry: {},
  AccessRole: {},
  User: {
    updateMany: (...args) => mockUserUpdateMany(...args),
  },
}));

const { updateResourcePermissions } = require('../PermissionsController');

const createMockReq = (overrides = {}) => ({
  params: { resourceType: ResourceType.AGENT, resourceId: '507f1f77bcf86cd799439011' },
  body: { updated: [], removed: [], public: false },
  user: { id: 'user-1', role: 'USER' },
  headers: { authorization: '' },
  ...overrides,
});

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

describe('PermissionsController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('updateResourcePermissions — favorites cleanup', () => {
    const agentObjectId = new mongoose.Types.ObjectId().toString();
    const revokedUserId = new mongoose.Types.ObjectId().toString();

    beforeEach(() => {
      mockBulkUpdateResourcePermissions.mockResolvedValue({
        granted: [],
        updated: [],
        revoked: [{ type: PrincipalType.USER, id: revokedUserId, name: 'Revoked User' }],
        errors: [],
      });

      mockAgentFindOne.mockReturnValue({
        lean: () => Promise.resolve({ _id: agentObjectId, id: 'agent_abc123' }),
      });
      mockUserUpdateMany.mockResolvedValue({ modifiedCount: 1 });
    });

    it('removes agent from revoked users favorites on AGENT resource type', async () => {
      const req = createMockReq({
        params: { resourceType: ResourceType.AGENT, resourceId: agentObjectId },
        body: {
          updated: [],
          removed: [{ type: PrincipalType.USER, id: revokedUserId }],
          public: false,
        },
      });
      const res = createMockRes();

      await updateResourcePermissions(req, res);
      await flushPromises();

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockAgentFindOne).toHaveBeenCalledWith({ _id: agentObjectId }, { id: 1 });
      expect(mockUserUpdateMany).toHaveBeenCalledWith(
        { _id: { $in: [revokedUserId] }, 'favorites.agentId': 'agent_abc123' },
        { $pull: { favorites: { agentId: 'agent_abc123' } } },
      );
    });

    it('removes agent from revoked users favorites on REMOTE_AGENT resource type', async () => {
      const req = createMockReq({
        params: { resourceType: ResourceType.REMOTE_AGENT, resourceId: agentObjectId },
        body: {
          updated: [],
          removed: [{ type: PrincipalType.USER, id: revokedUserId }],
          public: false,
        },
      });
      const res = createMockRes();

      await updateResourcePermissions(req, res);
      await flushPromises();

      expect(mockAgentFindOne).toHaveBeenCalledWith({ _id: agentObjectId }, { id: 1 });
      expect(mockUserUpdateMany).toHaveBeenCalled();
    });

    it('uses results.revoked (validated) not raw request payload', async () => {
      const validId = new mongoose.Types.ObjectId().toString();
      const invalidId = 'not-a-valid-id';

      mockBulkUpdateResourcePermissions.mockResolvedValue({
        granted: [],
        updated: [],
        revoked: [{ type: PrincipalType.USER, id: validId }],
        errors: [{ principal: { type: PrincipalType.USER, id: invalidId }, error: 'Invalid ID' }],
      });

      const req = createMockReq({
        params: { resourceType: ResourceType.AGENT, resourceId: agentObjectId },
        body: {
          updated: [],
          removed: [
            { type: PrincipalType.USER, id: validId },
            { type: PrincipalType.USER, id: invalidId },
          ],
          public: false,
        },
      });
      const res = createMockRes();

      await updateResourcePermissions(req, res);
      await flushPromises();

      expect(mockUserUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({ _id: { $in: [validId] } }),
        expect.any(Object),
      );
    });

    it('skips cleanup when no USER principals are revoked', async () => {
      mockBulkUpdateResourcePermissions.mockResolvedValue({
        granted: [],
        updated: [],
        revoked: [{ type: PrincipalType.GROUP, id: 'group-1' }],
        errors: [],
      });

      const req = createMockReq({
        params: { resourceType: ResourceType.AGENT, resourceId: agentObjectId },
        body: {
          updated: [],
          removed: [{ type: PrincipalType.GROUP, id: 'group-1' }],
          public: false,
        },
      });
      const res = createMockRes();

      await updateResourcePermissions(req, res);
      await flushPromises();

      expect(mockAgentFindOne).not.toHaveBeenCalled();
      expect(mockUserUpdateMany).not.toHaveBeenCalled();
    });

    it('skips cleanup for non-agent resource types', async () => {
      mockBulkUpdateResourcePermissions.mockResolvedValue({
        granted: [],
        updated: [],
        revoked: [{ type: PrincipalType.USER, id: revokedUserId }],
        errors: [],
      });

      const req = createMockReq({
        params: { resourceType: ResourceType.PROMPTGROUP, resourceId: agentObjectId },
        body: {
          updated: [],
          removed: [{ type: PrincipalType.USER, id: revokedUserId }],
          public: false,
        },
      });
      const res = createMockRes();

      await updateResourcePermissions(req, res);
      await flushPromises();

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockAgentFindOne).not.toHaveBeenCalled();
    });

    it('handles agent not found gracefully', async () => {
      mockAgentFindOne.mockReturnValue({
        lean: () => Promise.resolve(null),
      });

      const req = createMockReq({
        params: { resourceType: ResourceType.AGENT, resourceId: agentObjectId },
        body: {
          updated: [],
          removed: [{ type: PrincipalType.USER, id: revokedUserId }],
          public: false,
        },
      });
      const res = createMockRes();

      await updateResourcePermissions(req, res);
      await flushPromises();

      expect(mockAgentFindOne).toHaveBeenCalled();
      expect(mockUserUpdateMany).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('logs error when User.updateMany fails without blocking response', async () => {
      mockUserUpdateMany.mockRejectedValue(new Error('DB connection lost'));

      const req = createMockReq({
        params: { resourceType: ResourceType.AGENT, resourceId: agentObjectId },
        body: {
          updated: [],
          removed: [{ type: PrincipalType.USER, id: revokedUserId }],
          public: false,
        },
      });
      const res = createMockRes();

      await updateResourcePermissions(req, res);
      await flushPromises();

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[removeRevokedAgentFromFavorites] Error cleaning up favorites',
        expect.any(Error),
      );
    });
  });
});
