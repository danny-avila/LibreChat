import mongoose from 'mongoose';
import { ResourceType, PrincipalType, PermissionBits } from 'librechat-data-provider';
import type * as t from '~/types';
import { createAclEntryMethods } from '~/methods/aclEntry';
import aclEntrySchema from '~/schema/aclEntry';

/**
 * Integration tests for $bit and $bitsAllSet on FerretDB.
 *
 * Validates that modifyPermissionBits (using atomic $bit)
 * and $bitsAllSet queries work identically on both MongoDB and FerretDB.
 *
 * Run against FerretDB:
 *   FERRETDB_URI="mongodb://ferretdb:ferretdb@127.0.0.1:27020/aclbit_test" npx jest aclBitops.ferretdb
 *
 * Run against MongoDB (for parity):
 *   FERRETDB_URI="mongodb://127.0.0.1:27017/aclbit_test" npx jest aclBitops.ferretdb
 */

const FERRETDB_URI = process.env.FERRETDB_URI;
const describeIfFerretDB = FERRETDB_URI ? describe : describe.skip;

describeIfFerretDB('ACL bitwise operations - FerretDB compatibility', () => {
  let AclEntry: mongoose.Model<t.IAclEntry>;
  let methods: ReturnType<typeof createAclEntryMethods>;

  const userId = new mongoose.Types.ObjectId();
  const groupId = new mongoose.Types.ObjectId();
  const grantedById = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    await mongoose.connect(FERRETDB_URI as string);
    AclEntry = mongoose.models.AclEntry || mongoose.model<t.IAclEntry>('AclEntry', aclEntrySchema);
    methods = createAclEntryMethods(mongoose);
    await AclEntry.createCollection();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  afterEach(async () => {
    await AclEntry.deleteMany({});
  });

  describe('modifyPermissionBits (atomic $bit operator)', () => {
    it('should add permission bits to existing entry', async () => {
      const resourceId = new mongoose.Types.ObjectId();

      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );

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

    it('should remove permission bits from existing entry', async () => {
      const resourceId = new mongoose.Types.ObjectId();

      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW | PermissionBits.EDIT | PermissionBits.DELETE,
        grantedById,
      );

      const updated = await methods.modifyPermissionBits(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        null,
        PermissionBits.EDIT,
      );

      expect(updated).toBeDefined();
      expect(updated?.permBits).toBe(PermissionBits.VIEW | PermissionBits.DELETE);
    });

    it('should add and remove bits in one operation', async () => {
      const resourceId = new mongoose.Types.ObjectId();

      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );

      const updated = await methods.modifyPermissionBits(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.EDIT | PermissionBits.DELETE,
        PermissionBits.VIEW,
      );

      expect(updated).toBeDefined();
      expect(updated?.permBits).toBe(PermissionBits.EDIT | PermissionBits.DELETE);
    });

    it('should handle adding bits that are already set (idempotent OR)', async () => {
      const resourceId = new mongoose.Types.ObjectId();

      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW | PermissionBits.EDIT,
        grantedById,
      );

      const updated = await methods.modifyPermissionBits(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
        null,
      );

      expect(updated?.permBits).toBe(PermissionBits.VIEW | PermissionBits.EDIT);
    });

    it('should handle removing bits that are not set (no-op AND)', async () => {
      const resourceId = new mongoose.Types.ObjectId();

      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );

      const updated = await methods.modifyPermissionBits(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        null,
        PermissionBits.DELETE,
      );

      expect(updated?.permBits).toBe(PermissionBits.VIEW);
    });

    it('should handle all four permission bits', async () => {
      const resourceId = new mongoose.Types.ObjectId();
      const allBits =
        PermissionBits.VIEW | PermissionBits.EDIT | PermissionBits.DELETE | PermissionBits.SHARE;

      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        allBits,
        grantedById,
      );

      const afterRemove = await methods.modifyPermissionBits(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        null,
        PermissionBits.EDIT | PermissionBits.SHARE,
      );

      expect(afterRemove?.permBits).toBe(PermissionBits.VIEW | PermissionBits.DELETE);
    });

    it('should work with group principals', async () => {
      const resourceId = new mongoose.Types.ObjectId();

      await methods.grantPermission(
        PrincipalType.GROUP,
        groupId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );

      const updated = await methods.modifyPermissionBits(
        PrincipalType.GROUP,
        groupId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.EDIT,
        null,
      );

      expect(updated?.permBits).toBe(PermissionBits.VIEW | PermissionBits.EDIT);
    });

    it('should work with public principals', async () => {
      const resourceId = new mongoose.Types.ObjectId();

      await methods.grantPermission(
        PrincipalType.PUBLIC,
        null,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW | PermissionBits.EDIT,
        grantedById,
      );

      const updated = await methods.modifyPermissionBits(
        PrincipalType.PUBLIC,
        null,
        ResourceType.AGENT,
        resourceId,
        null,
        PermissionBits.EDIT,
      );

      expect(updated?.permBits).toBe(PermissionBits.VIEW);
    });

    it('should return null when entry does not exist', async () => {
      const nonexistentResource = new mongoose.Types.ObjectId();

      const result = await methods.modifyPermissionBits(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        nonexistentResource,
        PermissionBits.EDIT,
        null,
      );

      expect(result).toBeNull();
    });

    it('should clear all bits via remove', async () => {
      const resourceId = new mongoose.Types.ObjectId();

      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW | PermissionBits.EDIT,
        grantedById,
      );

      const updated = await methods.modifyPermissionBits(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        null,
        PermissionBits.VIEW | PermissionBits.EDIT,
      );

      expect(updated?.permBits).toBe(0);
    });
  });

  describe('$bitsAllSet queries (hasPermission + findAccessibleResources)', () => {
    it('should find entries with specific bits set via hasPermission', async () => {
      const resourceId = new mongoose.Types.ObjectId();

      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW | PermissionBits.EDIT,
        grantedById,
      );

      const principals = [{ principalType: PrincipalType.USER, principalId: userId }];

      expect(
        await methods.hasPermission(
          principals,
          ResourceType.AGENT,
          resourceId,
          PermissionBits.VIEW,
        ),
      ).toBe(true);
      expect(
        await methods.hasPermission(
          principals,
          ResourceType.AGENT,
          resourceId,
          PermissionBits.EDIT,
        ),
      ).toBe(true);
      expect(
        await methods.hasPermission(
          principals,
          ResourceType.AGENT,
          resourceId,
          PermissionBits.DELETE,
        ),
      ).toBe(false);
    });

    it('should find accessible resources filtered by permission bit', async () => {
      const res1 = new mongoose.Types.ObjectId();
      const res2 = new mongoose.Types.ObjectId();
      const res3 = new mongoose.Types.ObjectId();

      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        res1,
        PermissionBits.VIEW,
        grantedById,
      );
      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        res2,
        PermissionBits.VIEW | PermissionBits.EDIT,
        grantedById,
      );
      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        res3,
        PermissionBits.EDIT,
        grantedById,
      );

      const principals = [{ principalType: PrincipalType.USER, principalId: userId }];

      const viewable = await methods.findAccessibleResources(
        principals,
        ResourceType.AGENT,
        PermissionBits.VIEW,
      );
      expect(viewable.map((r) => r.toString()).sort()).toEqual(
        [res1.toString(), res2.toString()].sort(),
      );

      const editable = await methods.findAccessibleResources(
        principals,
        ResourceType.AGENT,
        PermissionBits.EDIT,
      );
      expect(editable.map((r) => r.toString()).sort()).toEqual(
        [res2.toString(), res3.toString()].sort(),
      );
    });

    it('should correctly query after modifyPermissionBits changes', async () => {
      const resourceId = new mongoose.Types.ObjectId();
      const principals = [{ principalType: PrincipalType.USER, principalId: userId }];

      await methods.grantPermission(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.VIEW,
        grantedById,
      );

      expect(
        await methods.hasPermission(
          principals,
          ResourceType.AGENT,
          resourceId,
          PermissionBits.VIEW,
        ),
      ).toBe(true);
      expect(
        await methods.hasPermission(
          principals,
          ResourceType.AGENT,
          resourceId,
          PermissionBits.EDIT,
        ),
      ).toBe(false);

      await methods.modifyPermissionBits(
        PrincipalType.USER,
        userId,
        ResourceType.AGENT,
        resourceId,
        PermissionBits.EDIT,
        PermissionBits.VIEW,
      );

      expect(
        await methods.hasPermission(
          principals,
          ResourceType.AGENT,
          resourceId,
          PermissionBits.VIEW,
        ),
      ).toBe(false);
      expect(
        await methods.hasPermission(
          principals,
          ResourceType.AGENT,
          resourceId,
          PermissionBits.EDIT,
        ),
      ).toBe(true);
    });

    it('should combine effective permissions across user and group', async () => {
      const resourceId = new mongoose.Types.ObjectId();

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

      const principals = [
        { principalType: PrincipalType.USER, principalId: userId },
        { principalType: PrincipalType.GROUP, principalId: groupId },
      ];

      const effective = await methods.getEffectivePermissions(
        principals,
        ResourceType.AGENT,
        resourceId,
      );

      expect(effective).toBe(PermissionBits.VIEW | PermissionBits.EDIT);
    });
  });
});
