const mongoose = require('mongoose');
const { RoleBits, createModels } = require('@librechat/data-schemas');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  ResourceType,
  AccessRoleIds,
  PrincipalType,
  PrincipalModel,
} = require('librechat-data-provider');
const {
  bulkUpdateResourcePermissions,
  getEffectivePermissions,
  findAccessibleResources,
  getAvailableRoles,
  grantPermission,
  checkPermission,
} = require('./PermissionService');
const { findRoleByIdentifier, getUserPrincipals, seedDefaultRoles } = require('~/models');

// Mock the getTransactionSupport function for testing
jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  getTransactionSupport: jest.fn().mockResolvedValue(false),
  createModels: jest.requireActual('@librechat/data-schemas').createModels,
}));

// Mock GraphApiService to prevent config loading issues
jest.mock('~/server/services/GraphApiService', () => ({
  getGroupMembers: jest.fn().mockResolvedValue([]),
}));

// Mock the logger
jest.mock('~/config', () => ({
  logger: {
    error: jest.fn(),
  },
}));

let mongoServer;
let AclEntry;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);

  // Initialize all models
  createModels(mongoose);

  // Register models on mongoose.models so methods can access them
  const dbModels = require('~/db/models');
  Object.assign(mongoose.models, dbModels);

  AclEntry = dbModels.AclEntry;

  // Seed default roles
  await seedDefaultRoles();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  // Clear test data but keep seeded roles
  await AclEntry.deleteMany({});
});

// Mock getUserPrincipals to avoid depending on the actual implementation
jest.mock('~/models', () => ({
  ...jest.requireActual('~/models'),
  getUserPrincipals: jest.fn(),
}));

describe('PermissionService', () => {
  // Common test data
  const userId = new mongoose.Types.ObjectId();
  const groupId = new mongoose.Types.ObjectId();
  const resourceId = new mongoose.Types.ObjectId();
  const grantedById = new mongoose.Types.ObjectId();
  const roleResourceId = new mongoose.Types.ObjectId();

  describe('grantPermission', () => {
    test('should grant permission to a user with a role', async () => {
      const entry = await grantPermission({
        principalType: PrincipalType.USER,
        principalId: userId,
        resourceType: ResourceType.AGENT,
        resourceId,
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        grantedBy: grantedById,
      });

      expect(entry).toBeDefined();
      expect(entry.principalType).toBe(PrincipalType.USER);
      expect(entry.principalId.toString()).toBe(userId.toString());
      expect(entry.principalModel).toBe(PrincipalModel.USER);
      expect(entry.resourceType).toBe(ResourceType.AGENT);
      expect(entry.resourceId.toString()).toBe(resourceId.toString());

      // Get the role to verify the permission bits are correctly set
      const role = await findRoleByIdentifier(AccessRoleIds.AGENT_VIEWER);
      expect(entry.permBits).toBe(role.permBits);
      expect(entry.roleId.toString()).toBe(role._id.toString());
      expect(entry.grantedBy.toString()).toBe(grantedById.toString());
      expect(entry.grantedAt).toBeInstanceOf(Date);
    });

    test('should grant permission to a group with a role', async () => {
      const entry = await grantPermission({
        principalType: PrincipalType.GROUP,
        principalId: groupId,
        resourceType: ResourceType.AGENT,
        resourceId,
        accessRoleId: AccessRoleIds.AGENT_EDITOR,
        grantedBy: grantedById,
      });

      expect(entry).toBeDefined();
      expect(entry.principalType).toBe(PrincipalType.GROUP);
      expect(entry.principalId.toString()).toBe(groupId.toString());
      expect(entry.principalModel).toBe(PrincipalModel.GROUP);

      // Get the role to verify the permission bits are correctly set
      const role = await findRoleByIdentifier(AccessRoleIds.AGENT_EDITOR);
      expect(entry.permBits).toBe(role.permBits);
      expect(entry.roleId.toString()).toBe(role._id.toString());
    });

    test('should grant public permission with a role', async () => {
      const entry = await grantPermission({
        principalType: PrincipalType.PUBLIC,
        principalId: null,
        resourceType: ResourceType.AGENT,
        resourceId,
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        grantedBy: grantedById,
      });

      expect(entry).toBeDefined();
      expect(entry.principalType).toBe(PrincipalType.PUBLIC);
      expect(entry.principalId).toBeUndefined();
      expect(entry.principalModel).toBeUndefined();

      // Get the role to verify the permission bits are correctly set
      const role = await findRoleByIdentifier(AccessRoleIds.AGENT_VIEWER);
      expect(entry.permBits).toBe(role.permBits);
      expect(entry.roleId.toString()).toBe(role._id.toString());
    });

    test('should throw error for invalid principal type', async () => {
      await expect(
        grantPermission({
          principalType: 'invalid',
          principalId: userId,
          resourceType: ResourceType.AGENT,
          resourceId,
          accessRoleId: AccessRoleIds.AGENT_VIEWER,
          grantedBy: grantedById,
        }),
      ).rejects.toThrow('Invalid principal type: invalid');
    });

    test('should throw error for missing principalId with user type', async () => {
      await expect(
        grantPermission({
          principalType: PrincipalType.USER,
          principalId: null,
          resourceType: ResourceType.AGENT,
          resourceId,
          accessRoleId: AccessRoleIds.AGENT_VIEWER,
          grantedBy: grantedById,
        }),
      ).rejects.toThrow('Principal ID is required for user, group, and role principals');
    });

    test('should throw error for non-existent role', async () => {
      await expect(
        grantPermission({
          principalType: PrincipalType.USER,
          principalId: userId,
          resourceType: ResourceType.AGENT,
          resourceId,
          accessRoleId: 'non_existent_role',
          grantedBy: grantedById,
        }),
      ).rejects.toThrow('Role non_existent_role not found');
    });

    test('should throw error for role-resource type mismatch', async () => {
      await expect(
        grantPermission({
          principalType: PrincipalType.USER,
          principalId: userId,
          resourceType: ResourceType.AGENT,
          resourceId,
          accessRoleId: AccessRoleIds.PROMPTGROUP_VIEWER, // PromptGroup role for agent resource
          grantedBy: grantedById,
        }),
      ).rejects.toThrow('Role promptGroup_viewer is for promptGroup resources, not agent');
    });

    test('should update existing permission when granting to same principal and resource', async () => {
      // First grant with viewer role
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: userId,
        resourceType: ResourceType.AGENT,
        resourceId,
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        grantedBy: grantedById,
      });

      // Then update to editor role
      const updated = await grantPermission({
        principalType: PrincipalType.USER,
        principalId: userId,
        resourceType: ResourceType.AGENT,
        resourceId,
        accessRoleId: AccessRoleIds.AGENT_EDITOR,
        grantedBy: grantedById,
      });

      const editorRole = await findRoleByIdentifier(AccessRoleIds.AGENT_EDITOR);
      expect(updated.permBits).toBe(editorRole.permBits);
      expect(updated.roleId.toString()).toBe(editorRole._id.toString());

      // Verify there's only one entry
      const entries = await AclEntry.find({
        principalType: PrincipalType.USER,
        principalId: userId,
        resourceType: ResourceType.AGENT,
        resourceId,
      });
      expect(entries).toHaveLength(1);
    });
  });

  describe('checkPermission', () => {
    let otherResourceId;

    beforeEach(async () => {
      // Reset the mock implementation for getUserPrincipals
      getUserPrincipals.mockReset();

      // Setup test data
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: userId,
        resourceType: ResourceType.AGENT,
        resourceId,
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        grantedBy: grantedById,
      });

      otherResourceId = new mongoose.Types.ObjectId();
      await grantPermission({
        principalType: PrincipalType.GROUP,
        principalId: groupId,
        resourceType: ResourceType.AGENT,
        resourceId: otherResourceId,
        accessRoleId: AccessRoleIds.AGENT_EDITOR,
        grantedBy: grantedById,
      });
    });

    test('should check permission for user principal', async () => {
      // Mock getUserPrincipals to return just the user principal
      getUserPrincipals.mockResolvedValue([
        { principalType: PrincipalType.USER, principalId: userId },
      ]);

      const hasViewPermission = await checkPermission({
        userId,
        resourceType: ResourceType.AGENT,
        resourceId,
        requiredPermission: 1, // RoleBits.VIEWER // 1 = VIEW
      });

      expect(hasViewPermission).toBe(true);

      // Check higher permission level that user doesn't have
      const hasEditPermission = await checkPermission({
        userId,
        resourceType: ResourceType.AGENT,
        resourceId,
        requiredPermission: 3, // RoleBits.EDITOR = VIEW + EDIT
      });

      expect(hasEditPermission).toBe(false);
    });

    test('should check permission for user and group principals', async () => {
      // Mock getUserPrincipals to return both user and group principals
      getUserPrincipals.mockResolvedValue([
        { principalType: PrincipalType.USER, principalId: userId },
        { principalType: PrincipalType.GROUP, principalId: groupId },
      ]);

      // Check original resource (user has access)
      const hasViewOnOriginal = await checkPermission({
        userId,
        resourceType: ResourceType.AGENT,
        resourceId,
        requiredPermission: 1, // RoleBits.VIEWER // 1 = VIEW
      });

      expect(hasViewOnOriginal).toBe(true);

      // Check other resource (group has access)
      const hasViewOnOther = await checkPermission({
        userId,
        resourceType: ResourceType.AGENT,
        resourceId: otherResourceId,
        requiredPermission: 1, // RoleBits.VIEWER // 1 = VIEW
      });

      // Group has agent_editor role which includes viewer permissions
      expect(hasViewOnOther).toBe(true);
    });

    test('should check permission for public access', async () => {
      const publicResourceId = new mongoose.Types.ObjectId();

      // Grant public access to a resource
      await grantPermission({
        principalType: PrincipalType.PUBLIC,
        principalId: null,
        resourceType: ResourceType.AGENT,
        resourceId: publicResourceId,
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        grantedBy: grantedById,
      });

      // Mock getUserPrincipals to return user, group, and public principals
      getUserPrincipals.mockResolvedValue([
        { principalType: PrincipalType.USER, principalId: userId },
        { principalType: PrincipalType.GROUP, principalId: groupId },
        { principalType: PrincipalType.PUBLIC },
      ]);

      const hasPublicAccess = await checkPermission({
        userId,
        resourceType: ResourceType.AGENT,
        resourceId: publicResourceId,
        requiredPermission: 1, // RoleBits.VIEWER // 1 = VIEW
      });

      expect(hasPublicAccess).toBe(true);
    });

    test('should return false for invalid permission bits', async () => {
      getUserPrincipals.mockResolvedValue([
        { principalType: PrincipalType.USER, principalId: userId },
      ]);

      await expect(
        checkPermission({
          userId,
          resourceType: ResourceType.AGENT,
          resourceId,
          requiredPermission: 'invalid',
        }),
      ).rejects.toThrow('requiredPermission must be a positive number');

      const nonExistentResource = await checkPermission({
        userId,
        resourceType: ResourceType.AGENT,
        resourceId: new mongoose.Types.ObjectId(),
        requiredPermission: 1, // RoleBits.VIEWER
      });

      expect(nonExistentResource).toBe(false);
    });

    test('should return false if user has no principals', async () => {
      getUserPrincipals.mockResolvedValue([]);

      const hasPermission = await checkPermission({
        userId,
        resourceType: ResourceType.AGENT,
        resourceId,
        requiredPermission: 1, // RoleBits.VIEWER
      });

      expect(hasPermission).toBe(false);
    });
  });

  describe('getEffectivePermissions', () => {
    beforeEach(async () => {
      // Reset the mock implementation for getUserPrincipals
      getUserPrincipals.mockReset();

      // Setup test data with multiple permissions from different sources
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: userId,
        resourceType: ResourceType.AGENT,
        resourceId,
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        grantedBy: grantedById,
      });

      await grantPermission({
        principalType: PrincipalType.GROUP,
        principalId: groupId,
        resourceType: ResourceType.AGENT,
        resourceId,
        accessRoleId: AccessRoleIds.AGENT_EDITOR,
        grantedBy: grantedById,
      });

      // Create another resource with public permission
      const publicResourceId = new mongoose.Types.ObjectId();
      await grantPermission({
        principalType: PrincipalType.PUBLIC,
        principalId: null,
        resourceType: ResourceType.AGENT,
        resourceId: publicResourceId,
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        grantedBy: grantedById,
      });

      // Setup a resource with inherited permission
      const parentResourceId = new mongoose.Types.ObjectId();
      const childResourceId = new mongoose.Types.ObjectId();

      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: userId,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: parentResourceId,
        accessRoleId: AccessRoleIds.PROMPTGROUP_VIEWER,
        grantedBy: grantedById,
      });

      await AclEntry.create({
        principalType: PrincipalType.USER,
        principalId: userId,
        principalModel: PrincipalModel.USER,
        resourceType: ResourceType.AGENT,
        resourceId: childResourceId,
        permBits: RoleBits.VIEWER,
        roleId: (await findRoleByIdentifier(AccessRoleIds.AGENT_VIEWER))._id,
        grantedBy: grantedById,
        grantedAt: new Date(),
        inheritedFrom: parentResourceId,
      });
    });

    test('should get effective permissions from multiple sources', async () => {
      // Mock getUserPrincipals to return both user and group principals
      getUserPrincipals.mockResolvedValue([
        { principalType: PrincipalType.USER, principalId: userId },
        { principalType: PrincipalType.GROUP, principalId: groupId },
      ]);

      const effective = await getEffectivePermissions({
        userId,
        resourceType: ResourceType.AGENT,
        resourceId,
      });

      // Should return the combined permission bits from both user (VIEWER=1) and group (EDITOR=3)
      // EDITOR includes VIEWER, so result should be 3 (VIEW + EDIT)
      expect(effective).toBe(RoleBits.EDITOR); // 3 = VIEW + EDIT
    });

    test('should get effective permissions from inherited permissions', async () => {
      // Find the child resource ID
      const inheritedEntry = await AclEntry.findOne({ inheritedFrom: { $exists: true } });
      const childResourceId = inheritedEntry.resourceId;

      // Mock getUserPrincipals to return user principal
      getUserPrincipals.mockResolvedValue([
        { principalType: PrincipalType.USER, principalId: userId },
      ]);

      const effective = await getEffectivePermissions({
        userId,
        resourceType: ResourceType.AGENT,
        resourceId: childResourceId,
      });

      // Should return VIEWER permission bits from inherited permission
      expect(effective).toBe(RoleBits.VIEWER); // 1 = VIEW
    });

    test('should return 0 for non-existent permissions', async () => {
      getUserPrincipals.mockResolvedValue([{ principalType: 'user', principalId: userId }]);

      const nonExistentResource = new mongoose.Types.ObjectId();
      const effective = await getEffectivePermissions({
        userId,
        resourceType: ResourceType.AGENT,
        resourceId: nonExistentResource,
      });

      // Should return 0 for no permissions
      expect(effective).toBe(0);
    });

    test('should return 0 if user has no principals', async () => {
      getUserPrincipals.mockResolvedValue([]);

      const effective = await getEffectivePermissions({
        userId,
        resourceType: ResourceType.AGENT,
        resourceId,
      });

      // Should return 0 for no permissions
      expect(effective).toBe(0);
    });
  });

  describe('findAccessibleResources', () => {
    beforeEach(async () => {
      // Reset the mock implementation for getUserPrincipals
      getUserPrincipals.mockReset();

      // Setup test data with multiple resources
      const resource1 = new mongoose.Types.ObjectId();
      const resource2 = new mongoose.Types.ObjectId();
      const resource3 = new mongoose.Types.ObjectId();

      // User can view resource 1
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: userId,
        resourceType: ResourceType.AGENT,
        resourceId: resource1,
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        grantedBy: grantedById,
      });

      // User can edit resource 2
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: userId,
        resourceType: ResourceType.AGENT,
        resourceId: resource2,
        accessRoleId: AccessRoleIds.AGENT_EDITOR,
        grantedBy: grantedById,
      });

      // Group can view resource 3
      await grantPermission({
        principalType: PrincipalType.GROUP,
        principalId: groupId,
        resourceType: ResourceType.AGENT,
        resourceId: resource3,
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        grantedBy: grantedById,
      });
    });

    test('should find resources user can view', async () => {
      // Mock getUserPrincipals to return user principal
      getUserPrincipals.mockResolvedValue([
        { principalType: PrincipalType.USER, principalId: userId },
      ]);

      const viewableResources = await findAccessibleResources({
        userId,
        resourceType: ResourceType.AGENT,
        requiredPermissions: 1, // RoleBits.VIEWER // 1 = VIEW
      });

      // Should find both resources (viewer role is included in editor role)
      expect(viewableResources).toHaveLength(2);
    });

    test('should find resources user can edit', async () => {
      // Mock getUserPrincipals to return user principal
      getUserPrincipals.mockResolvedValue([
        { principalType: PrincipalType.USER, principalId: userId },
      ]);

      const editableResources = await findAccessibleResources({
        userId,
        resourceType: ResourceType.AGENT,
        requiredPermissions: 3, // RoleBits.EDITOR = VIEW + EDIT
      });

      // Should find only one resource (only the editor resource has EDIT permission)
      expect(editableResources).toHaveLength(1);
    });

    test('should find resources accessible via group membership', async () => {
      // Mock getUserPrincipals to return user and group principals
      getUserPrincipals.mockResolvedValue([
        { principalType: PrincipalType.USER, principalId: userId },
        { principalType: PrincipalType.GROUP, principalId: groupId },
      ]);

      const viewableResources = await findAccessibleResources({
        userId,
        resourceType: ResourceType.AGENT,
        requiredPermissions: 1, // RoleBits.VIEWER // 1 = VIEW
      });

      // Should find all three resources
      expect(viewableResources).toHaveLength(3);
    });

    test('should return empty array for invalid permissions', async () => {
      getUserPrincipals.mockResolvedValue([
        { principalType: PrincipalType.USER, principalId: userId },
      ]);

      await expect(
        findAccessibleResources({
          userId,
          resourceType: ResourceType.AGENT,
          requiredPermissions: 'invalid',
        }),
      ).rejects.toThrow('requiredPermissions must be a positive number');

      const nonExistentType = await findAccessibleResources({
        userId,
        resourceType: 'non_existent_type',
        requiredPermissions: 1, // RoleBits.VIEWER
      });

      expect(nonExistentType).toEqual([]);
    });

    test('should return empty array if user has no principals', async () => {
      getUserPrincipals.mockResolvedValue([]);

      const resources = await findAccessibleResources({
        userId,
        resourceType: ResourceType.AGENT,
        requiredPermissions: 1, // RoleBits.VIEWER
      });

      expect(resources).toEqual([]);
    });
  });

  describe('getAvailableRoles', () => {
    test('should get all roles for a resource type', async () => {
      const roles = await getAvailableRoles({
        resourceType: ResourceType.AGENT,
      });

      expect(roles).toHaveLength(3);
      expect(roles.map((r) => r.accessRoleId).sort()).toEqual(
        [AccessRoleIds.AGENT_EDITOR, AccessRoleIds.AGENT_OWNER, AccessRoleIds.AGENT_VIEWER].sort(),
      );
    });

    test('should throw error for non-existent resource type', async () => {
      await expect(
        getAvailableRoles({
          resourceType: 'non_existent_type',
        }),
      ).rejects.toThrow('Invalid resourceType: non_existent_type. Valid types: agent, promptGroup');
    });
  });

  describe('bulkUpdateResourcePermissions', () => {
    const otherUserId = new mongoose.Types.ObjectId();

    beforeEach(async () => {
      // Ensure roles are properly seeded
      await seedDefaultRoles();
      // Setup existing permissions for testing
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: userId,
        resourceType: ResourceType.AGENT,
        resourceId,
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        grantedBy: grantedById,
      });

      await grantPermission({
        principalType: PrincipalType.GROUP,
        principalId: groupId,
        resourceType: ResourceType.AGENT,
        resourceId,
        accessRoleId: AccessRoleIds.AGENT_EDITOR,
        grantedBy: grantedById,
      });

      await grantPermission({
        principalType: PrincipalType.PUBLIC,
        principalId: null,
        resourceType: ResourceType.AGENT,
        resourceId,
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        grantedBy: grantedById,
      });
    });

    test('should grant new permissions in bulk', async () => {
      const newResourceId = new mongoose.Types.ObjectId();
      const updatedPrincipals = [
        {
          type: PrincipalType.USER,
          id: userId,
          accessRoleId: AccessRoleIds.AGENT_VIEWER,
        },
        {
          type: PrincipalType.USER,
          id: otherUserId,
          accessRoleId: AccessRoleIds.AGENT_EDITOR,
        },
        {
          type: PrincipalType.GROUP,
          id: groupId,
          accessRoleId: AccessRoleIds.AGENT_OWNER,
        },
      ];

      const results = await bulkUpdateResourcePermissions({
        resourceType: ResourceType.AGENT,
        resourceId: newResourceId,
        updatedPrincipals,
        grantedBy: grantedById,
      });

      expect(results.granted).toHaveLength(3);
      expect(results.updated).toHaveLength(0);
      expect(results.revoked).toHaveLength(0);
      expect(results.errors).toHaveLength(0);

      // Verify permissions were created
      const aclEntries = await AclEntry.find({
        resourceType: ResourceType.AGENT,
        resourceId: newResourceId,
      });
      expect(aclEntries).toHaveLength(3);
    });

    test('should update existing permissions in bulk', async () => {
      const updatedPrincipals = [
        {
          type: PrincipalType.USER,
          id: userId,
          accessRoleId: AccessRoleIds.AGENT_EDITOR, // Upgrade from viewer to editor
        },
        {
          type: PrincipalType.GROUP,
          id: groupId,
          accessRoleId: AccessRoleIds.AGENT_OWNER, // Upgrade from editor to owner
        },
        {
          type: PrincipalType.PUBLIC,
          accessRoleId: AccessRoleIds.AGENT_VIEWER, // Keep same role
        },
      ];

      const results = await bulkUpdateResourcePermissions({
        resourceType: ResourceType.AGENT,
        resourceId,
        updatedPrincipals,
        grantedBy: grantedById,
      });

      // Function puts all updatedPrincipals in granted array since it uses upserts
      expect(results.granted).toHaveLength(3);
      expect(results.updated).toHaveLength(0);
      expect(results.revoked).toHaveLength(0);
      expect(results.errors).toHaveLength(0);

      // Verify updates
      const userEntry = await AclEntry.findOne({
        principalType: PrincipalType.USER,
        principalId: userId,
        resourceType: ResourceType.AGENT,
        resourceId,
      }).populate('roleId', 'accessRoleId');
      expect(userEntry.roleId.accessRoleId).toBe(AccessRoleIds.AGENT_EDITOR);

      const groupEntry = await AclEntry.findOne({
        principalType: PrincipalType.GROUP,
        principalId: groupId,
        resourceType: ResourceType.AGENT,
        resourceId,
      }).populate('roleId', 'accessRoleId');
      expect(groupEntry.roleId.accessRoleId).toBe(AccessRoleIds.AGENT_OWNER);
    });

    test('should revoke specified permissions', async () => {
      const revokedPrincipals = [
        {
          type: PrincipalType.GROUP,
          id: groupId,
        },
        {
          type: PrincipalType.PUBLIC,
        },
      ];

      const results = await bulkUpdateResourcePermissions({
        resourceType: ResourceType.AGENT,
        resourceId,
        revokedPrincipals,
        grantedBy: grantedById,
      });

      expect(results.granted).toHaveLength(0);
      expect(results.updated).toHaveLength(0);
      expect(results.revoked).toHaveLength(2); // Group and public revoked
      expect(results.errors).toHaveLength(0);

      // Verify only user permission remains
      const remainingEntries = await AclEntry.find({
        resourceType: ResourceType.AGENT,
        resourceId,
      });
      expect(remainingEntries).toHaveLength(1);
      expect(remainingEntries[0].principalType).toBe(PrincipalType.USER);
      expect(remainingEntries[0].principalId.toString()).toBe(userId.toString());
    });

    test('should handle mixed operations (grant, update, revoke)', async () => {
      const updatedPrincipals = [
        {
          type: PrincipalType.USER,
          id: userId,
          accessRoleId: AccessRoleIds.AGENT_OWNER, // Update existing
        },
        {
          type: PrincipalType.USER,
          id: otherUserId,
          accessRoleId: AccessRoleIds.AGENT_VIEWER, // New permission
        },
      ];

      const revokedPrincipals = [
        {
          type: PrincipalType.GROUP,
          id: groupId,
        },
        {
          type: PrincipalType.PUBLIC,
        },
      ];

      const results = await bulkUpdateResourcePermissions({
        resourceType: ResourceType.AGENT,
        resourceId,
        updatedPrincipals,
        revokedPrincipals,
        grantedBy: grantedById,
      });

      expect(results.granted).toHaveLength(2); // Both users granted (function uses upserts)
      expect(results.updated).toHaveLength(0);
      expect(results.revoked).toHaveLength(2); // Group and public revoked
      expect(results.errors).toHaveLength(0);

      // Verify final state
      const finalEntries = await AclEntry.find({
        resourceType: ResourceType.AGENT,
        resourceId,
      }).populate('roleId', 'accessRoleId');

      expect(finalEntries).toHaveLength(2);

      const userEntry = finalEntries.find((e) => e.principalId.toString() === userId.toString());
      expect(userEntry.roleId.accessRoleId).toBe(AccessRoleIds.AGENT_OWNER);

      const otherUserEntry = finalEntries.find(
        (e) => e.principalId.toString() === otherUserId.toString(),
      );
      expect(otherUserEntry.roleId.accessRoleId).toBe(AccessRoleIds.AGENT_VIEWER);
    });

    test('should handle errors for invalid roles gracefully', async () => {
      const updatedPrincipals = [
        {
          type: PrincipalType.USER,
          id: userId,
          accessRoleId: AccessRoleIds.AGENT_VIEWER, // Valid
        },
        {
          type: PrincipalType.USER,
          id: otherUserId,
          accessRoleId: 'non_existent_role', // Invalid
        },
        {
          type: PrincipalType.GROUP,
          id: groupId,
          accessRoleId: AccessRoleIds.PROMPTGROUP_VIEWER, // Wrong resource type
        },
      ];

      const results = await bulkUpdateResourcePermissions({
        resourceType: ResourceType.AGENT,
        resourceId,
        updatedPrincipals,
        grantedBy: grantedById,
      });

      expect(results.granted).toHaveLength(1); // Only valid user permission
      expect(results.updated).toHaveLength(0);
      expect(results.revoked).toHaveLength(0);
      expect(results.errors).toHaveLength(2); // Two invalid permissions

      // Check error details
      expect(results.errors[0].error).toContain('Role non_existent_role not found');
      expect(results.errors[1].error).toContain('Role promptGroup_viewer not found');
    });

    test('should handle empty arrays (no operations)', async () => {
      const results = await bulkUpdateResourcePermissions({
        resourceType: ResourceType.AGENT,
        resourceId,
        updatedPrincipals: [],
        revokedPrincipals: [],
        grantedBy: grantedById,
      });

      expect(results.granted).toHaveLength(0);
      expect(results.updated).toHaveLength(0);
      expect(results.revoked).toHaveLength(0);
      expect(results.errors).toHaveLength(0);

      // Verify no changes to existing permissions (since no operations were performed)
      const remainingEntries = await AclEntry.find({
        resourceType: ResourceType.AGENT,
        resourceId,
      });
      expect(remainingEntries).toHaveLength(3); // Original permissions still exist
    });

    test('should throw error for invalid updatedPrincipals array', async () => {
      await expect(
        bulkUpdateResourcePermissions({
          resourceType: ResourceType.AGENT,
          resourceId,
          updatedPrincipals: 'not an array',
          grantedBy: grantedById,
        }),
      ).rejects.toThrow('updatedPrincipals must be an array');
    });

    test('should throw error for invalid resource ID', async () => {
      await expect(
        bulkUpdateResourcePermissions({
          resourceType: ResourceType.AGENT,
          resourceId: 'invalid-id',
          permissions: [],
          grantedBy: grantedById,
        }),
      ).rejects.toThrow('Invalid resource ID: invalid-id');
    });

    test('should handle public permissions correctly', async () => {
      const updatedPrincipals = [
        {
          type: PrincipalType.PUBLIC,
          accessRoleId: AccessRoleIds.AGENT_EDITOR, // Update public permission
        },
        {
          type: PrincipalType.USER,
          id: otherUserId,
          accessRoleId: AccessRoleIds.AGENT_VIEWER, // New user permission
        },
      ];

      const revokedPrincipals = [
        {
          type: PrincipalType.USER,
          id: userId,
        },
        {
          type: PrincipalType.GROUP,
          id: groupId,
        },
      ];

      const results = await bulkUpdateResourcePermissions({
        resourceType: ResourceType.AGENT,
        resourceId,
        updatedPrincipals,
        revokedPrincipals,
        grantedBy: grantedById,
      });

      expect(results.granted).toHaveLength(2); // Public and new user
      expect(results.updated).toHaveLength(0);
      expect(results.revoked).toHaveLength(2); // Existing user and group revoked
      expect(results.errors).toHaveLength(0);

      // Verify public permission was updated
      const publicEntry = await AclEntry.findOne({
        principalType: PrincipalType.PUBLIC,
        resourceType: ResourceType.AGENT,
        resourceId,
      }).populate('roleId', 'accessRoleId');

      expect(publicEntry).toBeDefined();
      expect(publicEntry.roleId.accessRoleId).toBe(AccessRoleIds.AGENT_EDITOR);
    });

    test('should grant permission to a role', async () => {
      const entry = await grantPermission({
        principalType: PrincipalType.ROLE,
        principalId: 'admin',
        resourceType: ResourceType.AGENT,
        resourceId: roleResourceId,
        accessRoleId: AccessRoleIds.AGENT_EDITOR,
        grantedBy: grantedById,
      });

      expect(entry).toBeDefined();
      expect(entry.principalType).toBe(PrincipalType.ROLE);
      expect(entry.principalId).toBe('admin');
      expect(entry.principalModel).toBe(PrincipalModel.ROLE);
      expect(entry.resourceType).toBe(ResourceType.AGENT);
      expect(entry.resourceId.toString()).toBe(roleResourceId.toString());

      // Get the role to verify the permission bits are correctly set
      const role = await findRoleByIdentifier(AccessRoleIds.AGENT_EDITOR);
      expect(entry.permBits).toBe(role.permBits);
      expect(entry.roleId.toString()).toBe(role._id.toString());
    });

    test('should check permissions for user with role', async () => {
      // Grant permission to admin role
      await grantPermission({
        principalType: PrincipalType.ROLE,
        principalId: 'admin',
        resourceType: ResourceType.AGENT,
        resourceId: roleResourceId,
        accessRoleId: AccessRoleIds.AGENT_EDITOR,
        grantedBy: grantedById,
      });

      // Mock getUserPrincipals to return user with admin role
      getUserPrincipals.mockResolvedValue([
        { principalType: PrincipalType.USER, principalId: userId },
        { principalType: PrincipalType.ROLE, principalId: 'admin' },
        { principalType: PrincipalType.PUBLIC },
      ]);

      const hasPermission = await checkPermission({
        userId,
        resourceType: ResourceType.AGENT,
        resourceId: roleResourceId,
        requiredPermission: 1, // VIEW
      });

      expect(hasPermission).toBe(true);

      // Check that user without admin role cannot access
      getUserPrincipals.mockResolvedValue([
        { principalType: PrincipalType.USER, principalId: userId },
        { principalType: PrincipalType.PUBLIC },
      ]);

      const hasNoPermission = await checkPermission({
        userId,
        resourceType: ResourceType.AGENT,
        resourceId: roleResourceId,
        requiredPermission: 1, // VIEW
      });

      expect(hasNoPermission).toBe(false);
    });

    test('should optimize permission checks when role is provided', async () => {
      const testUserId = new mongoose.Types.ObjectId();
      const testResourceId = new mongoose.Types.ObjectId();

      // Create a user with EDITOR role
      const User = mongoose.models.User;
      await User.create({
        _id: testUserId,
        email: 'editor@test.com',
        emailVerified: true,
        provider: 'local',
        role: 'EDITOR',
      });

      // Grant permission to EDITOR role
      await grantPermission({
        principalType: PrincipalType.ROLE,
        principalId: 'EDITOR',
        resourceType: ResourceType.AGENT,
        resourceId: testResourceId,
        accessRoleId: AccessRoleIds.AGENT_EDITOR,
        grantedBy: grantedById,
      });

      // Mock getUserPrincipals to return user with EDITOR role when called
      getUserPrincipals.mockResolvedValue([
        { principalType: PrincipalType.USER, principalId: testUserId },
        { principalType: PrincipalType.ROLE, principalId: 'EDITOR' },
        { principalType: PrincipalType.PUBLIC },
      ]);

      // Test 1: Check permission with role provided (optimization should be used)
      const hasPermissionWithRole = await checkPermission({
        userId: testUserId,
        role: 'EDITOR',
        resourceType: ResourceType.AGENT,
        resourceId: testResourceId,
        requiredPermission: 1, // VIEW
      });

      expect(hasPermissionWithRole).toBe(true);
      expect(getUserPrincipals).toHaveBeenCalledWith({ userId: testUserId, role: 'EDITOR' });

      // Test 2: Check permission without role (should call getUserPrincipals)
      getUserPrincipals.mockResolvedValue([
        { principalType: PrincipalType.USER, principalId: testUserId },
        { principalType: PrincipalType.ROLE, principalId: 'EDITOR' },
        { principalType: PrincipalType.PUBLIC },
      ]);

      const hasPermissionWithoutRole = await checkPermission({
        userId: testUserId,
        resourceType: ResourceType.AGENT,
        resourceId: testResourceId,
        requiredPermission: 1, // VIEW
      });

      expect(hasPermissionWithoutRole).toBe(true);
      expect(getUserPrincipals).toHaveBeenCalledWith({ userId: testUserId, role: undefined });

      // Test 3: Verify getEffectivePermissions also uses the optimization
      getUserPrincipals.mockClear();

      const effectiveWithRole = await getEffectivePermissions({
        userId: testUserId,
        role: 'EDITOR',
        resourceType: ResourceType.AGENT,
        resourceId: testResourceId,
      });

      expect(effectiveWithRole).toBe(3); // EDITOR = VIEW + EDIT
      expect(getUserPrincipals).toHaveBeenCalledWith({ userId: testUserId, role: 'EDITOR' });

      // Test 4: Verify findAccessibleResources also uses the optimization
      getUserPrincipals.mockClear();

      const accessibleWithRole = await findAccessibleResources({
        userId: testUserId,
        role: 'EDITOR',
        resourceType: ResourceType.AGENT,
        requiredPermissions: 1, // VIEW
      });

      expect(accessibleWithRole.map((id) => id.toString())).toContain(testResourceId.toString());
      expect(getUserPrincipals).toHaveBeenCalledWith({ userId: testUserId, role: 'EDITOR' });
    });

    test('should handle role changes dynamically', async () => {
      const testUserId = new mongoose.Types.ObjectId();
      const testResourceId = new mongoose.Types.ObjectId();

      // Grant permission to ADMIN role only
      await grantPermission({
        principalType: PrincipalType.ROLE,
        principalId: 'ADMIN',
        resourceType: ResourceType.AGENT,
        resourceId: testResourceId,
        accessRoleId: AccessRoleIds.AGENT_OWNER,
        grantedBy: grantedById,
      });

      // Test with ADMIN role - should have access
      getUserPrincipals.mockResolvedValue([
        { principalType: PrincipalType.USER, principalId: testUserId },
        { principalType: PrincipalType.ROLE, principalId: 'ADMIN' },
        { principalType: PrincipalType.PUBLIC },
      ]);

      const hasAdminAccess = await checkPermission({
        userId: testUserId,
        role: 'ADMIN',
        resourceType: ResourceType.AGENT,
        resourceId: testResourceId,
        requiredPermission: 7, // Full permissions
      });

      expect(hasAdminAccess).toBe(true);
      expect(getUserPrincipals).toHaveBeenCalledWith({ userId: testUserId, role: 'ADMIN' });

      // Test with USER role - should NOT have access
      getUserPrincipals.mockClear();
      getUserPrincipals.mockResolvedValue([
        { principalType: PrincipalType.USER, principalId: testUserId },
        { principalType: PrincipalType.ROLE, principalId: 'USER' },
        { principalType: PrincipalType.PUBLIC },
      ]);

      const hasUserAccess = await checkPermission({
        userId: testUserId,
        role: 'USER',
        resourceType: ResourceType.AGENT,
        resourceId: testResourceId,
        requiredPermission: 1, // Even VIEW
      });

      expect(hasUserAccess).toBe(false);
      expect(getUserPrincipals).toHaveBeenCalledWith({ userId: testUserId, role: 'USER' });

      // Test with EDITOR role - should NOT have access
      getUserPrincipals.mockClear();
      getUserPrincipals.mockResolvedValue([
        { principalType: PrincipalType.USER, principalId: testUserId },
        { principalType: PrincipalType.ROLE, principalId: 'EDITOR' },
        { principalType: PrincipalType.PUBLIC },
      ]);

      const hasEditorAccess = await checkPermission({
        userId: testUserId,
        role: 'EDITOR',
        resourceType: ResourceType.AGENT,
        resourceId: testResourceId,
        requiredPermission: 1, // VIEW
      });

      expect(hasEditorAccess).toBe(false);
      expect(getUserPrincipals).toHaveBeenCalledWith({ userId: testUserId, role: 'EDITOR' });
    });

    test('should work with different resource types', async () => {
      // Test with promptGroup resources
      const promptGroupResourceId = new mongoose.Types.ObjectId();
      const updatedPrincipals = [
        {
          type: PrincipalType.USER,
          id: userId,
          accessRoleId: AccessRoleIds.PROMPTGROUP_VIEWER,
        },
        {
          type: PrincipalType.GROUP,
          id: groupId,
          accessRoleId: AccessRoleIds.PROMPTGROUP_EDITOR,
        },
      ];

      const results = await bulkUpdateResourcePermissions({
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: promptGroupResourceId,
        updatedPrincipals,
        grantedBy: grantedById,
      });

      expect(results.granted).toHaveLength(2);
      expect(results.updated).toHaveLength(0);
      expect(results.revoked).toHaveLength(0);
      expect(results.errors).toHaveLength(0);

      // Verify permissions were created with correct resource type
      const promptGroupEntries = await AclEntry.find({
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: promptGroupResourceId,
      });
      expect(promptGroupEntries).toHaveLength(2);
      expect(promptGroupEntries.every((e) => e.resourceType === ResourceType.PROMPTGROUP)).toBe(
        true,
      );
    });
  });

  describe('String vs ObjectId Edge Cases', () => {
    const stringUserId = new mongoose.Types.ObjectId().toString();
    const objectIdUserId = new mongoose.Types.ObjectId();
    const stringGroupId = new mongoose.Types.ObjectId().toString();
    const objectIdGroupId = new mongoose.Types.ObjectId();
    const testResourceId = new mongoose.Types.ObjectId();

    beforeEach(async () => {
      // Clear any existing ACL entries
      await AclEntry.deleteMany({});
      getUserPrincipals.mockReset();
    });

    test('should handle string userId in grantPermission', async () => {
      const entry = await grantPermission({
        principalType: PrincipalType.USER,
        principalId: stringUserId, // Pass string
        resourceType: ResourceType.AGENT,
        resourceId: testResourceId,
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        grantedBy: grantedById,
      });

      expect(entry).toBeDefined();
      expect(entry.principalType).toBe(PrincipalType.USER);
      // Should be stored as ObjectId
      expect(entry.principalId).toBeInstanceOf(mongoose.Types.ObjectId);
      expect(entry.principalId.toString()).toBe(stringUserId);
    });

    test('should handle string groupId in grantPermission', async () => {
      const entry = await grantPermission({
        principalType: PrincipalType.GROUP,
        principalId: stringGroupId, // Pass string
        resourceType: ResourceType.AGENT,
        resourceId: testResourceId,
        accessRoleId: AccessRoleIds.AGENT_EDITOR,
        grantedBy: grantedById,
      });

      expect(entry).toBeDefined();
      expect(entry.principalType).toBe(PrincipalType.GROUP);
      // Should be stored as ObjectId
      expect(entry.principalId).toBeInstanceOf(mongoose.Types.ObjectId);
      expect(entry.principalId.toString()).toBe(stringGroupId);
    });

    test('should handle string roleId in grantPermission for ROLE type', async () => {
      const roleString = 'moderator';

      const entry = await grantPermission({
        principalType: PrincipalType.ROLE,
        principalId: roleString,
        resourceType: ResourceType.AGENT,
        resourceId: testResourceId,
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        grantedBy: grantedById,
      });

      expect(entry).toBeDefined();
      expect(entry.principalType).toBe(PrincipalType.ROLE);
      // Should remain as string for ROLE type
      expect(typeof entry.principalId).toBe('string');
      expect(entry.principalId).toBe(roleString);
      expect(entry.principalModel).toBe(PrincipalModel.ROLE);
    });

    test('should check permissions correctly when permission granted with string userId', async () => {
      // Grant permission with string userId
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: stringUserId,
        resourceType: ResourceType.AGENT,
        resourceId: testResourceId,
        accessRoleId: AccessRoleIds.AGENT_EDITOR,
        grantedBy: grantedById,
      });

      // Mock getUserPrincipals to return ObjectId (as it should after our fix)
      getUserPrincipals.mockResolvedValue([
        {
          principalType: PrincipalType.USER,
          principalId: new mongoose.Types.ObjectId(stringUserId),
        },
        { principalType: PrincipalType.PUBLIC },
      ]);

      // Check permission with string userId
      const hasPermission = await checkPermission({
        userId: stringUserId,
        resourceType: ResourceType.AGENT,
        resourceId: testResourceId,
        requiredPermission: 1, // VIEW
      });

      expect(hasPermission).toBe(true);
      expect(getUserPrincipals).toHaveBeenCalledWith({ userId: stringUserId, role: undefined });
    });

    test('should check permissions correctly when permission granted with ObjectId', async () => {
      // Grant permission with ObjectId
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: objectIdUserId,
        resourceType: ResourceType.AGENT,
        resourceId: testResourceId,
        accessRoleId: AccessRoleIds.AGENT_OWNER,
        grantedBy: grantedById,
      });

      // Mock getUserPrincipals to return ObjectId
      getUserPrincipals.mockResolvedValue([
        { principalType: PrincipalType.USER, principalId: objectIdUserId },
        { principalType: PrincipalType.PUBLIC },
      ]);

      // Check permission with ObjectId
      const hasPermission = await checkPermission({
        userId: objectIdUserId,
        resourceType: ResourceType.AGENT,
        resourceId: testResourceId,
        requiredPermission: 7, // Full permissions
      });

      expect(hasPermission).toBe(true);
      expect(getUserPrincipals).toHaveBeenCalledWith({ userId: objectIdUserId, role: undefined });
    });

    test('should handle bulkUpdateResourcePermissions with string IDs', async () => {
      const updatedPrincipals = [
        {
          type: PrincipalType.USER,
          id: stringUserId, // String ID
          accessRoleId: AccessRoleIds.AGENT_VIEWER,
        },
        {
          type: PrincipalType.GROUP,
          id: stringGroupId, // String ID
          accessRoleId: AccessRoleIds.AGENT_EDITOR,
        },
        {
          type: PrincipalType.ROLE,
          id: 'admin', // String ID (should remain string)
          accessRoleId: AccessRoleIds.AGENT_OWNER,
        },
      ];

      const results = await bulkUpdateResourcePermissions({
        resourceType: ResourceType.AGENT,
        resourceId: testResourceId,
        updatedPrincipals,
        grantedBy: grantedById,
      });

      expect(results.granted).toHaveLength(3);
      expect(results.errors).toHaveLength(0);

      // Verify USER entry has ObjectId
      const userEntry = await AclEntry.findOne({
        principalType: PrincipalType.USER,
        resourceType: ResourceType.AGENT,
        resourceId: testResourceId,
      });
      expect(userEntry.principalId).toBeInstanceOf(mongoose.Types.ObjectId);
      expect(userEntry.principalId.toString()).toBe(stringUserId);

      // Verify GROUP entry has ObjectId
      const groupEntry = await AclEntry.findOne({
        principalType: PrincipalType.GROUP,
        resourceType: ResourceType.AGENT,
        resourceId: testResourceId,
      });
      expect(groupEntry.principalId).toBeInstanceOf(mongoose.Types.ObjectId);
      expect(groupEntry.principalId.toString()).toBe(stringGroupId);

      // Verify ROLE entry has string
      const roleEntry = await AclEntry.findOne({
        principalType: PrincipalType.ROLE,
        resourceType: ResourceType.AGENT,
        resourceId: testResourceId,
      });
      expect(typeof roleEntry.principalId).toBe('string');
      expect(roleEntry.principalId).toBe('admin');
    });

    test('should handle revoking permissions with string IDs in bulkUpdateResourcePermissions', async () => {
      // First grant permissions with ObjectIds
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: objectIdUserId,
        resourceType: ResourceType.AGENT,
        resourceId: testResourceId,
        accessRoleId: AccessRoleIds.AGENT_OWNER,
        grantedBy: grantedById,
      });

      await grantPermission({
        principalType: PrincipalType.GROUP,
        principalId: objectIdGroupId,
        resourceType: ResourceType.AGENT,
        resourceId: testResourceId,
        accessRoleId: AccessRoleIds.AGENT_EDITOR,
        grantedBy: grantedById,
      });

      // Revoke using string IDs
      const revokedPrincipals = [
        {
          type: PrincipalType.USER,
          id: objectIdUserId.toString(), // String version of ObjectId
        },
        {
          type: PrincipalType.GROUP,
          id: objectIdGroupId.toString(), // String version of ObjectId
        },
      ];

      const results = await bulkUpdateResourcePermissions({
        resourceType: ResourceType.AGENT,
        resourceId: testResourceId,
        revokedPrincipals,
        grantedBy: grantedById,
      });

      expect(results.revoked).toHaveLength(2);
      expect(results.errors).toHaveLength(0);

      // Verify permissions were actually revoked
      const remainingEntries = await AclEntry.find({
        resourceType: ResourceType.AGENT,
        resourceId: testResourceId,
      });
      expect(remainingEntries).toHaveLength(0);
    });

    test('should find accessible resources when permissions granted with mixed ID types', async () => {
      const resource1 = new mongoose.Types.ObjectId();
      const resource2 = new mongoose.Types.ObjectId();
      const resource3 = new mongoose.Types.ObjectId();

      // Grant with string userId
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: stringUserId,
        resourceType: ResourceType.AGENT,
        resourceId: resource1,
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        grantedBy: grantedById,
      });

      // Grant with ObjectId userId (same user)
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: new mongoose.Types.ObjectId(stringUserId),
        resourceType: ResourceType.AGENT,
        resourceId: resource2,
        accessRoleId: AccessRoleIds.AGENT_EDITOR,
        grantedBy: grantedById,
      });

      // Grant to role
      await grantPermission({
        principalType: PrincipalType.ROLE,
        principalId: 'admin',
        resourceType: ResourceType.AGENT,
        resourceId: resource3,
        accessRoleId: AccessRoleIds.AGENT_OWNER,
        grantedBy: grantedById,
      });

      // Mock getUserPrincipals to return user with admin role
      getUserPrincipals.mockResolvedValue([
        {
          principalType: PrincipalType.USER,
          principalId: new mongoose.Types.ObjectId(stringUserId),
        },
        { principalType: PrincipalType.ROLE, principalId: 'admin' },
        { principalType: PrincipalType.PUBLIC },
      ]);

      const accessibleResources = await findAccessibleResources({
        userId: stringUserId,
        role: 'admin',
        resourceType: ResourceType.AGENT,
        requiredPermissions: 1, // VIEW
      });

      // Should find all three resources
      expect(accessibleResources).toHaveLength(3);
      const resourceIds = accessibleResources.map((id) => id.toString());
      expect(resourceIds).toContain(resource1.toString());
      expect(resourceIds).toContain(resource2.toString());
      expect(resourceIds).toContain(resource3.toString());
    });

    test('should get effective permissions with mixed ID types', async () => {
      // Grant VIEW permission with string userId
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: stringUserId,
        resourceType: ResourceType.AGENT,
        resourceId: testResourceId,
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        grantedBy: grantedById,
      });

      // Grant EDIT permission to a group with string groupId
      await grantPermission({
        principalType: PrincipalType.GROUP,
        principalId: stringGroupId,
        resourceType: ResourceType.AGENT,
        resourceId: testResourceId,
        accessRoleId: AccessRoleIds.AGENT_EDITOR,
        grantedBy: grantedById,
      });

      // Mock getUserPrincipals to return ObjectIds (as it should after our fix)
      getUserPrincipals.mockResolvedValue([
        {
          principalType: PrincipalType.USER,
          principalId: new mongoose.Types.ObjectId(stringUserId),
        },
        {
          principalType: PrincipalType.GROUP,
          principalId: new mongoose.Types.ObjectId(stringGroupId),
        },
        { principalType: PrincipalType.PUBLIC },
      ]);

      const effectivePermissions = await getEffectivePermissions({
        userId: stringUserId,
        resourceType: ResourceType.AGENT,
        resourceId: testResourceId,
      });

      // Should combine VIEW (1) and EDIT (3) permissions
      expect(effectivePermissions).toBe(3); // EDITOR includes VIEW
    });
  });
});
