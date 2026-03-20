import mongoose from 'mongoose';
import {
  ResourceType,
  PrincipalType,
  PrincipalModel,
  PermissionBits,
} from 'librechat-data-provider';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type * as t from '~/types';
import { createAclEntryMethods } from './aclEntry';
import aclEntrySchema from '~/schema/aclEntry';

let mongoServer: MongoMemoryServer;
let AclEntry: mongoose.Model<t.IAclEntry>;
let methods: ReturnType<typeof createAclEntryMethods>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  AclEntry = mongoose.models.AclEntry || mongoose.model('AclEntry', aclEntrySchema);
  methods = createAclEntryMethods(mongoose);
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

describe('AclEntry Model Tests', () => {
  /** Common test data */
  const userId = new mongoose.Types.ObjectId();
  const groupId = new mongoose.Types.ObjectId();
  const resourceId = new mongoose.Types.ObjectId();
  const grantedById = new mongoose.Types.ObjectId();

  describe('Permission Grant and Query', () => {
    test('should grant permission to a user', async () => {
      const entry = await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );

      expect(entry).toBeDefined();
      expect(entry?.principalType).toBe(PrincipalType.USER);
      expect(entry?.principalId?.toString()).toBe(userId.toString());
      expect(entry?.principalModel).toBe(PrincipalModel.USER);
      expect(entry?.resourceType).toBe(ResourceType.AGENT);
      expect(entry?.resourceId.toString()).toBe(resourceId.toString());
      expect(entry?.permBits).toBe(PermissionBits.VIEW);
      expect(entry?.grantedBy?.toString()).toBe(grantedById.toString());
      expect(entry?.grantedAt).toBeInstanceOf(Date);
    });

    test('should grant permission to a group', async () => {
      const entry = await methods.grantPermission(
        PrincipalType.GROUP,
        groupId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW | PermissionBits.EDIT,
        grantedById,
      );

      expect(entry).toBeDefined();
      expect(entry?.principalType).toBe(PrincipalType.GROUP);
      expect(entry?.principalId?.toString()).toBe(groupId.toString());
      expect(entry?.principalModel).toBe(PrincipalModel.GROUP);
      expect(entry?.permBits).toBe(PermissionBits.VIEW | PermissionBits.EDIT);
    });

    test('should grant public permission', async () => {
      const entry = await methods.grantPermission(
        PrincipalType.PUBLIC,
        null,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );

      expect(entry).toBeDefined();
      expect(entry?.principalType).toBe(PrincipalType.PUBLIC);
      expect(entry?.principalId).toBeUndefined();
      expect(entry?.principalModel).toBeUndefined();
    });

    test('should find entries by principal', async () => {
      /** Create two different permissions for the same user */
      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );
      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        'project',
        new mongoose.Types.ObjectId(),
        PermissionBits.EDIT,
        grantedById,
      );

      /** Find all entries for the user */
      const entries = await methods.findEntriesByPrincipal(PrincipalType.USER, userId);
      expect(entries).toHaveLength(2);

      /** Find entries filtered by resource type */
      const agentEntries = await methods.findEntriesByPrincipal(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
      );
      expect(agentEntries).toHaveLength(1);
      expect(agentEntries[0].resourceType).toBe(ResourceType.AGENT);
    });

    test('should find entries by resource', async () => {
      /** Grant permissions to different principals for the same resource */
      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );
      await methods.grantPermission(
        PrincipalType.GROUP,
        groupId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.EDIT,
        grantedById,
      );
      await methods.grantPermission(
        PrincipalType.PUBLIC,
        null,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );

      const entries = await methods.findEntriesByResource(ResourceType.AGENT, resourceId);
      expect(entries).toHaveLength(3);
    });
  });

  describe('Permission Checks', () => {
    beforeEach(async () => {
      /** Setup test data with various permissions */
      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );
      await methods.grantPermission(
        PrincipalType.GROUP,
        groupId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.EDIT,
        grantedById,
      );

      const otherResourceId = new mongoose.Types.ObjectId();
      await methods.grantPermission(
        PrincipalType.PUBLIC,
        null,
        ResourceType.AGENT,
        otherResourceId,
        PermissionBits.VIEW,
        grantedById,
      );
    });

    test('should find entries by principals and resource', async () => {
      const principalsList = [
        { principalType: PrincipalType.USER, principalId: userId },
        { principalType: PrincipalType.GROUP, principalId: groupId },
      ];

      const entries = await methods.findEntriesByPrincipalsAndResource(
        principalsList,
        ResourceType.AGENT,
        resourceId,
      );
      expect(entries).toHaveLength(2);
    });

    test('should check if user has permission', async () => {
      const principalsList = [{ principalType: PrincipalType.USER, principalId: userId }];

      /** User has VIEW permission */
      const hasViewPermission = await methods.hasPermission(
        principalsList,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
      );
      expect(hasViewPermission).toBe(true);

      /** User doesn't have EDIT permission */
      const hasEditPermission = await methods.hasPermission(
        principalsList,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.EDIT,
      );
      expect(hasEditPermission).toBe(false);
    });

    test('should check if group has permission', async () => {
      const principalsList = [{ principalType: PrincipalType.GROUP, principalId: groupId }];

      /** Group has EDIT permission */
      const hasEditPermission = await methods.hasPermission(
        principalsList,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.EDIT,
      );
      expect(hasEditPermission).toBe(true);
    });

    test('should check permission for multiple principals', async () => {
      const principalsList = [
        { principalType: PrincipalType.USER, principalId: userId },
        { principalType: PrincipalType.GROUP, principalId: groupId },
      ];

      /** User has VIEW and group has EDIT, together they should have both */
      const hasViewPermission = await methods.hasPermission(
        principalsList,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
      );
      expect(hasViewPermission).toBe(true);

      const hasEditPermission = await methods.hasPermission(
        principalsList,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.EDIT,
      );
      expect(hasEditPermission).toBe(true);

      /** Neither has DELETE permission */
      const hasDeletePermission = await methods.hasPermission(
        principalsList,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.DELETE,
      );
      expect(hasDeletePermission).toBe(false);
    });

    test('should get effective permissions', async () => {
      const principalsList = [
        { principalType: PrincipalType.USER, principalId: userId },
        { principalType: PrincipalType.GROUP, principalId: groupId },
      ];

      const effective = await methods.getEffectivePermissions(
        principalsList,
        ResourceType.AGENT,
        resourceId,
      );

      /** Combined permissions should be VIEW | EDIT */
      expect(effective).toBe(PermissionBits.VIEW | PermissionBits.EDIT);
    });
  });

  describe('Permission Modification', () => {
    test('should revoke permission', async () => {
      /** Grant permission first */
      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );

      /** Check it exists */
      const entriesBefore = await methods.findEntriesByPrincipal(PrincipalType.USER, userId);
      expect(entriesBefore).toHaveLength(1);

      /** Revoke it */
      const result = await methods.revokePermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
      );
      expect(result.deletedCount).toBe(1);

      /** Verify it's gone */
      const entriesAfter = await methods.findEntriesByPrincipal(PrincipalType.USER, userId);
      expect(entriesAfter).toHaveLength(0);
    });

    test('should modify permission bits - add permissions', async () => {
      /** Start with VIEW permission */
      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );

      /** Add EDIT permission */
      const updated = await methods.modifyPermissionBits(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.EDIT,
        null,
      );

      expect(updated).toBeDefined();
      expect(updated?.permBits).toBe(PermissionBits.VIEW | PermissionBits.EDIT);
    });

    test('should modify permission bits - remove permissions', async () => {
      /** Start with VIEW | EDIT permissions */
      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW | PermissionBits.EDIT,
        grantedById,
      );

      /** Remove EDIT permission */
      const updated = await methods.modifyPermissionBits(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        null,
        PermissionBits.EDIT,
      );

      expect(updated).toBeDefined();
      expect(updated?.permBits).toBe(PermissionBits.VIEW);
    });

    test('should modify permission bits - add and remove at once', async () => {
      /** Start with VIEW permission */
      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );

      /** Add EDIT and remove VIEW in one operation */
      const updated = await methods.modifyPermissionBits(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.EDIT,
        PermissionBits.VIEW,
      );

      expect(updated).toBeDefined();
      expect(updated?.permBits).toBe(PermissionBits.EDIT);
    });
  });

  describe('String vs ObjectId Edge Cases', () => {
    test('should handle string userId in grantPermission', async () => {
      const userIdString = userId.toString();

      const entry = await methods.grantPermission(
        PrincipalType.USER,
        userIdString, // Pass string instead of ObjectId
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );

      expect(entry).toBeDefined();
      expect(entry?.principalType).toBe(PrincipalType.USER);
      // Should be stored as ObjectId
      expect(entry?.principalId).toBeInstanceOf(mongoose.Types.ObjectId);
      expect(entry?.principalId?.toString()).toBe(userIdString);
    });

    test('should handle string groupId in grantPermission', async () => {
      const groupIdString = groupId.toString();

      const entry = await methods.grantPermission(
        PrincipalType.GROUP,
        groupIdString, // Pass string instead of ObjectId
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );

      expect(entry).toBeDefined();
      expect(entry?.principalType).toBe(PrincipalType.GROUP);
      // Should be stored as ObjectId
      expect(entry?.principalId).toBeInstanceOf(mongoose.Types.ObjectId);
      expect(entry?.principalId?.toString()).toBe(groupIdString);
    });

    test('should handle string roleId in grantPermission for ROLE type', async () => {
      const roleString = 'admin';

      const entry = await methods.grantPermission(
        PrincipalType.ROLE,
        roleString,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );

      expect(entry).toBeDefined();
      expect(entry?.principalType).toBe(PrincipalType.ROLE);
      // Should remain as string for ROLE type
      expect(typeof entry?.principalId).toBe('string');
      expect(entry?.principalId).toBe(roleString);
      expect(entry?.principalModel).toBe(PrincipalModel.ROLE);
    });

    test('should handle string principalId in revokePermission', async () => {
      // First grant permission with ObjectId
      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );

      // Then revoke with string ID
      const result = await methods.revokePermission(
        PrincipalType.USER,
        userId.toString(), // Pass string
        ResourceType.AGENT,
        resourceId,
      );

      expect(result.deletedCount).toBe(1);

      // Verify it's actually deleted
      const entries = await methods.findEntriesByPrincipal(PrincipalType.USER, userId);
      expect(entries).toHaveLength(0);
    });

    test('should handle string principalId in modifyPermissionBits', async () => {
      // First grant permission with ObjectId
      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );

      // Then modify with string ID
      const updated = await methods.modifyPermissionBits(
        PrincipalType.USER,
        userId.toString(), // Pass string
        ResourceType.AGENT,
        resourceId,
        PermissionBits.EDIT,
        null,
      );

      expect(updated).toBeDefined();
      expect(updated?.permBits).toBe(PermissionBits.VIEW | PermissionBits.EDIT);
    });

    test('should handle mixed string and ObjectId in hasPermission', async () => {
      // Grant permission with string ID
      await methods.grantPermission(
        PrincipalType.USER,
        userId.toString(),
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );

      // Check permission with ObjectId in principals list
      const hasPermWithObjectId = await methods.hasPermission(
        [{ principalType: PrincipalType.USER, principalId: userId }],
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
      );
      expect(hasPermWithObjectId).toBe(true);

      // Check permission with string in principals list
      const hasPermWithString = await methods.hasPermission(
        [{ principalType: PrincipalType.USER, principalId: userId.toString() }],
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
      );
      expect(hasPermWithString).toBe(false); // This should fail because hasPermission doesn't convert

      // Check with converted ObjectId
      const hasPermWithConvertedId = await methods.hasPermission(
        [
          {
            principalType: PrincipalType.USER,
            principalId: new mongoose.Types.ObjectId(userId.toString()),
          },
        ],
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
      );
      expect(hasPermWithConvertedId).toBe(true);
    });

    test('should update existing permission when granting with string ID', async () => {
      // First grant with ObjectId
      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );

      // Grant again with string ID and different permissions
      const updated = await methods.grantPermission(
        PrincipalType.USER,
        userId.toString(),
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW | PermissionBits.EDIT | PermissionBits.DELETE,
        grantedById,
      );

      expect(updated).toBeDefined();
      expect(updated?.permBits).toBe(
        PermissionBits.VIEW | PermissionBits.EDIT | PermissionBits.DELETE,
      );

      // Should still only be one entry
      const entries = await methods.findEntriesByPrincipal(PrincipalType.USER, userId);
      expect(entries).toHaveLength(1);
    });
  });

  describe('Resource Access Queries', () => {
    test('should find accessible resources', async () => {
      /** Create multiple resources with different permissions */
      const resourceId1 = new mongoose.Types.ObjectId();
      const resourceId2 = new mongoose.Types.ObjectId();
      const resourceId3 = new mongoose.Types.ObjectId();

      /** User can view resource 1 */
      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId1,
        PermissionBits.VIEW,
        grantedById,
      );

      /** User can view and edit resource 2 */
      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId2,
        PermissionBits.VIEW | PermissionBits.EDIT,
        grantedById,
      );

      /** Group can view resource 3 */
      await methods.grantPermission(
        PrincipalType.GROUP,
        groupId,
        ResourceType.AGENT,
        resourceId3,
        PermissionBits.VIEW,
        grantedById,
      );

      /** Find resources with VIEW permission for user */
      const userViewableResources = await methods.findAccessibleResources(
        [{ principalType: PrincipalType.USER, principalId: userId }],
        ResourceType.AGENT,
        PermissionBits.VIEW,
      );

      expect(userViewableResources).toHaveLength(2);
      expect(userViewableResources.map((r) => r.toString()).sort()).toEqual(
        [resourceId1.toString(), resourceId2.toString()].sort(),
      );

      /** Find resources with VIEW permission for user or group */
      const allViewableResources = await methods.findAccessibleResources(
        [
          { principalType: PrincipalType.USER, principalId: userId },
          { principalType: PrincipalType.GROUP, principalId: groupId },
        ],
        ResourceType.AGENT,
        PermissionBits.VIEW,
      );

      expect(allViewableResources).toHaveLength(3);

      /** Find resources with EDIT permission for user */
      const editableResources = await methods.findAccessibleResources(
        [{ principalType: PrincipalType.USER, principalId: userId }],
        ResourceType.AGENT,
        PermissionBits.EDIT,
      );

      expect(editableResources).toHaveLength(1);
      expect(editableResources[0].toString()).toBe(resourceId2.toString());
    });

    test('should handle inherited permissions', async () => {
      const projectId = new mongoose.Types.ObjectId();
      const childResourceId = new mongoose.Types.ObjectId();

      /** Grant inherited permission on child resource */
      await AclEntry.create({
        principalType: PrincipalType.USER,
        principalId: userId,
        principalModel: PrincipalModel.USER,
        resourceType: ResourceType.AGENT,
        resourceId: childResourceId,
        permBits: PermissionBits.VIEW,
        grantedBy: grantedById,
        inheritedFrom: projectId,
      });

      /** Get effective permissions */
      const effective = await methods.getEffectivePermissions(
        [{ principalType: PrincipalType.USER, principalId: userId }],
        ResourceType.AGENT,
        childResourceId,
      );

      /** Should have VIEW permission from inherited entry */
      expect(effective).toBe(PermissionBits.VIEW);
    });
  });

  describe('Batch Permission Queries', () => {
    test('should get effective permissions for multiple resources in single query', async () => {
      const resource1 = new mongoose.Types.ObjectId();
      const resource2 = new mongoose.Types.ObjectId();
      const resource3 = new mongoose.Types.ObjectId();

      /** Grant different permissions to different resources */
      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.MCPSERVER,
        resource1,
        PermissionBits.VIEW,
        grantedById,
      );

      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.MCPSERVER,
        resource2,
        PermissionBits.VIEW | PermissionBits.EDIT,
        grantedById,
      );

      await methods.grantPermission(
        PrincipalType.GROUP,
        groupId,
        ResourceType.MCPSERVER,
        resource3,
        PermissionBits.DELETE,
        grantedById,
      );

      /** Get permissions for all resources */
      const permissionsMap = await methods.getEffectivePermissionsForResources(
        [{ principalType: PrincipalType.USER, principalId: userId }],
        ResourceType.MCPSERVER,
        [resource1, resource2, resource3],
      );

      expect(permissionsMap.size).toBe(2); // Only resource1 and resource2 for user
      expect(permissionsMap.get(resource1.toString())).toBe(PermissionBits.VIEW);
      expect(permissionsMap.get(resource2.toString())).toBe(
        PermissionBits.VIEW | PermissionBits.EDIT,
      );
      expect(permissionsMap.get(resource3.toString())).toBeUndefined(); // User has no access
    });

    test('should combine permissions from multiple principals in batch query', async () => {
      const resource1 = new mongoose.Types.ObjectId();
      const resource2 = new mongoose.Types.ObjectId();

      /** User has VIEW on both resources */
      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.MCPSERVER,
        resource1,
        PermissionBits.VIEW,
        grantedById,
      );

      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.MCPSERVER,
        resource2,
        PermissionBits.VIEW,
        grantedById,
      );

      /** Group has EDIT on resource1 */
      await methods.grantPermission(
        PrincipalType.GROUP,
        groupId,
        ResourceType.MCPSERVER,
        resource1,
        PermissionBits.EDIT,
        grantedById,
      );

      /** Get combined permissions for user + group */
      const permissionsMap = await methods.getEffectivePermissionsForResources(
        [
          { principalType: PrincipalType.USER, principalId: userId },
          { principalType: PrincipalType.GROUP, principalId: groupId },
        ],
        ResourceType.MCPSERVER,
        [resource1, resource2],
      );

      expect(permissionsMap.size).toBe(2);
      /** Resource1 should have VIEW | EDIT (from user + group) */
      expect(permissionsMap.get(resource1.toString())).toBe(
        PermissionBits.VIEW | PermissionBits.EDIT,
      );
      /** Resource2 should have only VIEW (from user) */
      expect(permissionsMap.get(resource2.toString())).toBe(PermissionBits.VIEW);
    });

    test('should handle empty resource list', async () => {
      const permissionsMap = await methods.getEffectivePermissionsForResources(
        [{ principalType: PrincipalType.USER, principalId: userId }],
        ResourceType.MCPSERVER,
        [],
      );

      expect(permissionsMap.size).toBe(0);
    });

    test('should handle resources with no permissions', async () => {
      const resource1 = new mongoose.Types.ObjectId();
      const resource2 = new mongoose.Types.ObjectId();

      /** Only grant permission to resource1 */
      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.MCPSERVER,
        resource1,
        PermissionBits.VIEW,
        grantedById,
      );

      const permissionsMap = await methods.getEffectivePermissionsForResources(
        [{ principalType: PrincipalType.USER, principalId: userId }],
        ResourceType.MCPSERVER,
        [resource1, resource2], // resource2 has no permissions
      );

      expect(permissionsMap.size).toBe(1);
      expect(permissionsMap.get(resource1.toString())).toBe(PermissionBits.VIEW);
      expect(permissionsMap.get(resource2.toString())).toBeUndefined();
    });

    test('should include public permissions in batch query', async () => {
      const resource1 = new mongoose.Types.ObjectId();
      const resource2 = new mongoose.Types.ObjectId();

      /** User has VIEW on resource1 */
      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.MCPSERVER,
        resource1,
        PermissionBits.VIEW | PermissionBits.EDIT,
        grantedById,
      );

      /** Public has VIEW on resource2 */
      await methods.grantPermission(
        PrincipalType.PUBLIC,
        null,
        ResourceType.MCPSERVER,
        resource2,
        PermissionBits.VIEW,
        grantedById,
      );

      /** Query with user + public principals */
      const permissionsMap = await methods.getEffectivePermissionsForResources(
        [
          { principalType: PrincipalType.USER, principalId: userId },
          { principalType: PrincipalType.PUBLIC },
        ],
        ResourceType.MCPSERVER,
        [resource1, resource2],
      );

      expect(permissionsMap.size).toBe(2);
      expect(permissionsMap.get(resource1.toString())).toBe(
        PermissionBits.VIEW | PermissionBits.EDIT,
      );
      expect(permissionsMap.get(resource2.toString())).toBe(PermissionBits.VIEW);
    });

    test('should handle large batch efficiently', async () => {
      /** Create 50 resources with various permissions */
      const resources = Array.from({ length: 50 }, () => new mongoose.Types.ObjectId());

      /** Grant permissions to first 30 resources */
      for (let i = 0; i < 30; i++) {
        await methods.grantPermission(
          PrincipalType.USER,
          userId,
          ResourceType.MCPSERVER,
          resources[i],
          PermissionBits.VIEW,
          grantedById,
        );
      }

      /** Grant group permissions to resources 20-40 (overlap with user) */
      for (let i = 20; i < 40; i++) {
        await methods.grantPermission(
          PrincipalType.GROUP,
          groupId,
          ResourceType.MCPSERVER,
          resources[i],
          PermissionBits.EDIT,
          grantedById,
        );
      }

      const startTime = Date.now();
      const permissionsMap = await methods.getEffectivePermissionsForResources(
        [
          { principalType: PrincipalType.USER, principalId: userId },
          { principalType: PrincipalType.GROUP, principalId: groupId },
        ],
        ResourceType.MCPSERVER,
        resources,
      );
      const duration = Date.now() - startTime;

      /** Should be reasonably fast (under 1 second for 50 resources) */
      expect(duration).toBeLessThan(1000);

      /** Verify results */
      expect(permissionsMap.size).toBe(40); // Resources 0-39 have permissions

      /** Resources 0-19: USER VIEW only */
      for (let i = 0; i < 20; i++) {
        expect(permissionsMap.get(resources[i].toString())).toBe(PermissionBits.VIEW);
      }

      /** Resources 20-29: USER VIEW | GROUP EDIT */
      for (let i = 20; i < 30; i++) {
        expect(permissionsMap.get(resources[i].toString())).toBe(
          PermissionBits.VIEW | PermissionBits.EDIT,
        );
      }

      /** Resources 30-39: GROUP EDIT only */
      for (let i = 30; i < 40; i++) {
        expect(permissionsMap.get(resources[i].toString())).toBe(PermissionBits.EDIT);
      }

      /** Resources 40-49: No permissions */
      for (let i = 40; i < 50; i++) {
        expect(permissionsMap.get(resources[i].toString())).toBeUndefined();
      }
    });

    test('should handle mixed ObjectId and string resource IDs', async () => {
      const resource1 = new mongoose.Types.ObjectId();
      const resource2 = new mongoose.Types.ObjectId();

      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.MCPSERVER,
        resource1,
        PermissionBits.VIEW,
        grantedById,
      );

      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.MCPSERVER,
        resource2,
        PermissionBits.EDIT,
        grantedById,
      );

      /** Pass mix of ObjectId and string */
      const permissionsMap = await methods.getEffectivePermissionsForResources(
        [{ principalType: PrincipalType.USER, principalId: userId }],
        ResourceType.MCPSERVER,
        [resource1, resource2.toString()], // Mix of ObjectId and string
      );

      expect(permissionsMap.size).toBe(2);
      expect(permissionsMap.get(resource1.toString())).toBe(PermissionBits.VIEW);
      expect(permissionsMap.get(resource2.toString())).toBe(PermissionBits.EDIT);
    });
  });
});
