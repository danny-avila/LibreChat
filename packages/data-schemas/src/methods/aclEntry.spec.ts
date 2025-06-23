import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createAclEntryMethods } from './aclEntry';
import { PermissionBits } from '~/common';
import aclEntrySchema from '~/schema/aclEntry';
import type * as t from '~/types';

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
        'user',
        userId,
        'agent',
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );

      expect(entry).toBeDefined();
      expect(entry?.principalType).toBe('user');
      expect(entry?.principalId?.toString()).toBe(userId.toString());
      expect(entry?.principalModel).toBe('User');
      expect(entry?.resourceType).toBe('agent');
      expect(entry?.resourceId.toString()).toBe(resourceId.toString());
      expect(entry?.permBits).toBe(PermissionBits.VIEW);
      expect(entry?.grantedBy?.toString()).toBe(grantedById.toString());
      expect(entry?.grantedAt).toBeInstanceOf(Date);
    });

    test('should grant permission to a group', async () => {
      const entry = await methods.grantPermission(
        'group',
        groupId,
        'agent',
        resourceId,
        PermissionBits.VIEW | PermissionBits.EDIT,
        grantedById,
      );

      expect(entry).toBeDefined();
      expect(entry?.principalType).toBe('group');
      expect(entry?.principalId?.toString()).toBe(groupId.toString());
      expect(entry?.principalModel).toBe('Group');
      expect(entry?.permBits).toBe(PermissionBits.VIEW | PermissionBits.EDIT);
    });

    test('should grant public permission', async () => {
      const entry = await methods.grantPermission(
        'public',
        null,
        'agent',
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );

      expect(entry).toBeDefined();
      expect(entry?.principalType).toBe('public');
      expect(entry?.principalId).toBeUndefined();
      expect(entry?.principalModel).toBeUndefined();
    });

    test('should find entries by principal', async () => {
      /** Create two different permissions for the same user */
      await methods.grantPermission(
        'user',
        userId,
        'agent',
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );
      await methods.grantPermission(
        'user',
        userId,
        'project',
        new mongoose.Types.ObjectId(),
        PermissionBits.EDIT,
        grantedById,
      );

      /** Find all entries for the user */
      const entries = await methods.findEntriesByPrincipal('user', userId);
      expect(entries).toHaveLength(2);

      /** Find entries filtered by resource type */
      const agentEntries = await methods.findEntriesByPrincipal('user', userId, 'agent');
      expect(agentEntries).toHaveLength(1);
      expect(agentEntries[0].resourceType).toBe('agent');
    });

    test('should find entries by resource', async () => {
      /** Grant permissions to different principals for the same resource */
      await methods.grantPermission(
        'user',
        userId,
        'agent',
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );
      await methods.grantPermission(
        'group',
        groupId,
        'agent',
        resourceId,
        PermissionBits.EDIT,
        grantedById,
      );
      await methods.grantPermission(
        'public',
        null,
        'agent',
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );

      const entries = await methods.findEntriesByResource('agent', resourceId);
      expect(entries).toHaveLength(3);
    });
  });

  describe('Permission Checks', () => {
    beforeEach(async () => {
      /** Setup test data with various permissions */
      await methods.grantPermission(
        'user',
        userId,
        'agent',
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );
      await methods.grantPermission(
        'group',
        groupId,
        'agent',
        resourceId,
        PermissionBits.EDIT,
        grantedById,
      );

      const otherResourceId = new mongoose.Types.ObjectId();
      await methods.grantPermission(
        'public',
        null,
        'agent',
        otherResourceId,
        PermissionBits.VIEW,
        grantedById,
      );
    });

    test('should find entries by principals and resource', async () => {
      const principalsList = [
        { principalType: 'user', principalId: userId },
        { principalType: 'group', principalId: groupId },
      ];

      const entries = await methods.findEntriesByPrincipalsAndResource(
        principalsList,
        'agent',
        resourceId,
      );
      expect(entries).toHaveLength(2);
    });

    test('should check if user has permission', async () => {
      const principalsList = [{ principalType: 'user', principalId: userId }];

      /** User has VIEW permission */
      const hasViewPermission = await methods.hasPermission(
        principalsList,
        'agent',
        resourceId,
        PermissionBits.VIEW,
      );
      expect(hasViewPermission).toBe(true);

      /** User doesn't have EDIT permission */
      const hasEditPermission = await methods.hasPermission(
        principalsList,
        'agent',
        resourceId,
        PermissionBits.EDIT,
      );
      expect(hasEditPermission).toBe(false);
    });

    test('should check if group has permission', async () => {
      const principalsList = [{ principalType: 'group', principalId: groupId }];

      /** Group has EDIT permission */
      const hasEditPermission = await methods.hasPermission(
        principalsList,
        'agent',
        resourceId,
        PermissionBits.EDIT,
      );
      expect(hasEditPermission).toBe(true);
    });

    test('should check permission for multiple principals', async () => {
      const principalsList = [
        { principalType: 'user', principalId: userId },
        { principalType: 'group', principalId: groupId },
      ];

      /** User has VIEW and group has EDIT, together they should have both */
      const hasViewPermission = await methods.hasPermission(
        principalsList,
        'agent',
        resourceId,
        PermissionBits.VIEW,
      );
      expect(hasViewPermission).toBe(true);

      const hasEditPermission = await methods.hasPermission(
        principalsList,
        'agent',
        resourceId,
        PermissionBits.EDIT,
      );
      expect(hasEditPermission).toBe(true);

      /** Neither has DELETE permission */
      const hasDeletePermission = await methods.hasPermission(
        principalsList,
        'agent',
        resourceId,
        PermissionBits.DELETE,
      );
      expect(hasDeletePermission).toBe(false);
    });

    test('should get effective permissions', async () => {
      const principalsList = [
        { principalType: 'user', principalId: userId },
        { principalType: 'group', principalId: groupId },
      ];

      const effective = await methods.getEffectivePermissions(principalsList, 'agent', resourceId);

      /** Combined permissions should be VIEW | EDIT */
      expect(effective.effectiveBits).toBe(PermissionBits.VIEW | PermissionBits.EDIT);

      /** Should have 2 sources */
      expect(effective.sources).toHaveLength(2);

      /** Check sources */
      const userSource = effective.sources.find((s) => s.from === 'user');
      const groupSource = effective.sources.find((s) => s.from === 'group');

      expect(userSource).toBeDefined();
      expect(userSource?.permBits).toBe(PermissionBits.VIEW);
      expect(userSource?.direct).toBe(true);

      expect(groupSource).toBeDefined();
      expect(groupSource?.permBits).toBe(PermissionBits.EDIT);
      expect(groupSource?.direct).toBe(true);
    });
  });

  describe('Permission Modification', () => {
    test('should revoke permission', async () => {
      /** Grant permission first */
      await methods.grantPermission(
        'user',
        userId,
        'agent',
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );

      /** Check it exists */
      const entriesBefore = await methods.findEntriesByPrincipal('user', userId);
      expect(entriesBefore).toHaveLength(1);

      /** Revoke it */
      const result = await methods.revokePermission('user', userId, 'agent', resourceId);
      expect(result.deletedCount).toBe(1);

      /** Verify it's gone */
      const entriesAfter = await methods.findEntriesByPrincipal('user', userId);
      expect(entriesAfter).toHaveLength(0);
    });

    test('should modify permission bits - add permissions', async () => {
      /** Start with VIEW permission */
      await methods.grantPermission(
        'user',
        userId,
        'agent',
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );

      /** Add EDIT permission */
      const updated = await methods.modifyPermissionBits(
        'user',
        userId,
        'agent',
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
        'user',
        userId,
        'agent',
        resourceId,
        PermissionBits.VIEW | PermissionBits.EDIT,
        grantedById,
      );

      /** Remove EDIT permission */
      const updated = await methods.modifyPermissionBits(
        'user',
        userId,
        'agent',
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
        'user',
        userId,
        'agent',
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );

      /** Add EDIT and remove VIEW in one operation */
      const updated = await methods.modifyPermissionBits(
        'user',
        userId,
        'agent',
        resourceId,
        PermissionBits.EDIT,
        PermissionBits.VIEW,
      );

      expect(updated).toBeDefined();
      expect(updated?.permBits).toBe(PermissionBits.EDIT);
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
        'user',
        userId,
        'agent',
        resourceId1,
        PermissionBits.VIEW,
        grantedById,
      );

      /** User can view and edit resource 2 */
      await methods.grantPermission(
        'user',
        userId,
        'agent',
        resourceId2,
        PermissionBits.VIEW | PermissionBits.EDIT,
        grantedById,
      );

      /** Group can view resource 3 */
      await methods.grantPermission(
        'group',
        groupId,
        'agent',
        resourceId3,
        PermissionBits.VIEW,
        grantedById,
      );

      /** Find resources with VIEW permission for user */
      const userViewableResources = await methods.findAccessibleResources(
        [{ principalType: 'user', principalId: userId }],
        'agent',
        PermissionBits.VIEW,
      );

      expect(userViewableResources).toHaveLength(2);
      expect(userViewableResources.map((r) => r.toString()).sort()).toEqual(
        [resourceId1.toString(), resourceId2.toString()].sort(),
      );

      /** Find resources with VIEW permission for user or group */
      const allViewableResources = await methods.findAccessibleResources(
        [
          { principalType: 'user', principalId: userId },
          { principalType: 'group', principalId: groupId },
        ],
        'agent',
        PermissionBits.VIEW,
      );

      expect(allViewableResources).toHaveLength(3);

      /** Find resources with EDIT permission for user */
      const editableResources = await methods.findAccessibleResources(
        [{ principalType: 'user', principalId: userId }],
        'agent',
        PermissionBits.EDIT,
      );

      expect(editableResources).toHaveLength(1);
      expect(editableResources[0].toString()).toBe(resourceId2.toString());
    });

    test('should handle inherited permissions', async () => {
      const projectId = new mongoose.Types.ObjectId();
      const childResourceId = new mongoose.Types.ObjectId();

      /** Grant permission on project */
      await methods.grantPermission(
        'user',
        userId,
        'project',
        projectId,
        PermissionBits.VIEW,
        grantedById,
      );

      /** Grant inherited permission on child resource */
      await AclEntry.create({
        principalType: 'user',
        principalId: userId,
        principalModel: 'User',
        resourceType: 'agent',
        resourceId: childResourceId,
        permBits: PermissionBits.VIEW,
        grantedBy: grantedById,
        inheritedFrom: projectId,
      });

      /** Get effective permissions including sources */
      const effective = await methods.getEffectivePermissions(
        [{ principalType: 'user', principalId: userId }],
        'agent',
        childResourceId,
      );

      expect(effective.sources).toHaveLength(1);
      expect(effective.sources[0].inheritedFrom?.toString()).toBe(projectId.toString());
      expect(effective.sources[0].direct).toBe(false);
    });
  });
});
