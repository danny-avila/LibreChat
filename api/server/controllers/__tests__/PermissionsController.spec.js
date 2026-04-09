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

const mockRemoveAgentFromUserFavorites = jest.fn();

jest.mock('~/models', () => ({
  searchPrincipals: jest.fn(),
  sortPrincipalsByRelevance: jest.fn(),
  calculateRelevanceScore: jest.fn(),
  removeAgentFromUserFavorites: (...args) => mockRemoveAgentFromUserFavorites(...args),
}));

jest.mock('~/server/services/GraphApiService', () => ({
  entraIdPrincipalFeatureEnabled: jest.fn(() => false),
  searchEntraIdPrincipals: jest.fn(),
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

      mockRemoveAgentFromUserFavorites.mockResolvedValue(undefined);
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
      expect(mockRemoveAgentFromUserFavorites).toHaveBeenCalledWith(agentObjectId, [revokedUserId]);
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

      expect(mockRemoveAgentFromUserFavorites).toHaveBeenCalledWith(agentObjectId, [revokedUserId]);
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

      expect(mockRemoveAgentFromUserFavorites).toHaveBeenCalledWith(agentObjectId, [validId]);
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

      expect(mockRemoveAgentFromUserFavorites).not.toHaveBeenCalled();
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
      expect(mockRemoveAgentFromUserFavorites).not.toHaveBeenCalled();
    });

    it('handles agent not found gracefully', async () => {
      mockRemoveAgentFromUserFavorites.mockResolvedValue(undefined);

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

      expect(mockRemoveAgentFromUserFavorites).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('logs error when removeAgentFromUserFavorites fails without blocking response', async () => {
      mockRemoveAgentFromUserFavorites.mockRejectedValue(new Error('DB connection lost'));

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
