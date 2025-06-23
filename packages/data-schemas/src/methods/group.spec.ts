import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createGroupMethods } from './group';
import groupSchema from '~/schema/group';
import type * as t from '~/types';

let mongoServer: MongoMemoryServer;
let Group: mongoose.Model<t.IGroup>;
let methods: ReturnType<typeof createGroupMethods>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  Group = mongoose.models.Group || mongoose.model('Group', groupSchema);
  methods = createGroupMethods(mongoose);
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  await Group.ensureIndexes();
});

describe('Group Model Tests', () => {
  test('should create a new group with valid data', async () => {
    const groupData: t.Group = {
      name: 'Test Group',
      source: 'local',
      memberIds: [],
    };

    const group = await methods.createGroup(groupData);

    expect(group).toBeDefined();
    expect(group._id).toBeDefined();
    expect(group.name).toBe(groupData.name);
    expect(group.source).toBe(groupData.source);
    expect(group.memberIds).toEqual([]);
  });

  test('should create a group with members', async () => {
    const userId1 = new mongoose.Types.ObjectId();
    const userId2 = new mongoose.Types.ObjectId();

    const groupData: t.Group = {
      name: 'Test Group with Members',
      source: 'local',
      memberIds: [userId1.toString(), userId2.toString()],
    };

    const group = await methods.createGroup(groupData);

    expect(group).toBeDefined();
    expect(group.memberIds).toHaveLength(2);
    expect(group.memberIds[0]).toBe(userId1.toString());
    expect(group.memberIds[1]).toBe(userId2.toString());
  });

  test('should create an Entra ID group', async () => {
    const groupData: t.Group = {
      name: 'Entra Group',
      source: 'entra',
      idOnTheSource: 'entra-id-12345',
      memberIds: [],
    };

    const group = await methods.createGroup(groupData);

    expect(group).toBeDefined();
    expect(group.source).toBe('entra');
    expect(group.idOnTheSource).toBe(groupData.idOnTheSource);
  });

  test('should fail when creating an Entra group without idOnTheSource', async () => {
    const groupData = {
      name: 'Invalid Entra Group',
      source: 'entra' as const,
      memberIds: [],
      /** Missing idOnTheSource */
    };

    await expect(methods.createGroup(groupData)).rejects.toThrow();
  });

  test('should fail when creating a group with an invalid source', async () => {
    const groupData = {
      name: 'Invalid Source Group',
      source: 'invalid_source' as 'local',
      memberIds: [],
    };

    await expect(methods.createGroup(groupData)).rejects.toThrow();
  });

  test('should fail when creating a group without a name', async () => {
    const groupData = {
      source: 'local' as const,
      memberIds: [],
      /** Missing name */
    };

    await expect(methods.createGroup(groupData)).rejects.toThrow();
  });

  test('should enforce unique idOnTheSource for same source', async () => {
    const groupData1: t.Group = {
      name: 'First Entra Group',
      source: 'entra',
      idOnTheSource: 'duplicate-id',
      memberIds: [],
    };

    const groupData2: t.Group = {
      name: 'Second Entra Group',
      source: 'entra',
      idOnTheSource: 'duplicate-id' /** Same as above */,
      memberIds: [],
    };

    await methods.createGroup(groupData1);
    await expect(methods.createGroup(groupData2)).rejects.toThrow();
  });

  test('should not enforce unique idOnTheSource across different sources', async () => {
    /** This test is hypothetical as we currently only have 'local' and 'entra' sources,
     * and 'local' doesn't require idOnTheSource
     */
    const groupData1: t.Group = {
      name: 'Entra Group',
      source: 'entra',
      idOnTheSource: 'test-id',
      memberIds: [],
    };

    /** Simulate a future source type */
    const groupData2: t.Group = {
      name: 'Other Source Group',
      source: 'local',
      idOnTheSource: 'test-id' /** Same as above but different source */,
      memberIds: [],
    };

    await methods.createGroup(groupData1);

    /** This should succeed because the uniqueness constraint includes both idOnTheSource and source */
    const group2 = await methods.createGroup(groupData2);
    expect(group2).toBeDefined();
    expect(group2.source).toBe('local');
    expect(group2.idOnTheSource).toBe(groupData2.idOnTheSource);
  });

  describe('Group Query Methods', () => {
    let testGroup: t.IGroup;

    beforeEach(async () => {
      testGroup = await methods.createGroup({
        name: 'Test Group',
        source: 'local',
        memberIds: ['user-123'],
      });
    });

    test('should find group by ID', async () => {
      const group = await methods.findGroupById(testGroup._id);

      expect(group).toBeDefined();
      expect(group?._id.toString()).toBe(testGroup._id.toString());
      expect(group?.name).toBe(testGroup.name);
    });

    test('should return null for non-existent group ID', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const group = await methods.findGroupById(nonExistentId);
      expect(group).toBeNull();
    });

    test('should find group by external ID', async () => {
      const entraGroup = await methods.createGroup({
        name: 'Entra Group',
        source: 'entra',
        idOnTheSource: 'entra-id-xyz',
        memberIds: [],
      });

      const found = await methods.findGroupByExternalId('entra-id-xyz', 'entra');
      expect(found).toBeDefined();
      expect(found?._id.toString()).toBe(entraGroup._id.toString());
    });

    test('should find groups by source', async () => {
      await methods.createGroup({
        name: 'Another Local Group',
        source: 'local',
        memberIds: [],
      });

      await methods.createGroup({
        name: 'Entra Group',
        source: 'entra',
        idOnTheSource: 'entra-123',
        memberIds: [],
      });

      const localGroups = await methods.findGroupsBySource('local');
      expect(localGroups).toHaveLength(2);

      const entraGroups = await methods.findGroupsBySource('entra');
      expect(entraGroups).toHaveLength(1);
    });

    test('should get all groups', async () => {
      await methods.createGroup({
        name: 'Group 2',
        source: 'local',
        memberIds: [],
      });

      await methods.createGroup({
        name: 'Group 3',
        source: 'entra',
        idOnTheSource: 'entra-456',
        memberIds: [],
      });

      const allGroups = await methods.getAllGroups();
      expect(allGroups).toHaveLength(3);
    });
  });

  describe('Group Update and Delete Methods', () => {
    let testGroup: t.IGroup;

    beforeEach(async () => {
      testGroup = await methods.createGroup({
        name: 'Original Name',
        source: 'local',
        memberIds: [],
      });
    });

    test('should update a group', async () => {
      const updateData = {
        name: 'Updated Name',
        description: 'New description',
      };

      const updated = await methods.updateGroup(testGroup._id, updateData);

      expect(updated).toBeDefined();
      expect(updated?.name).toBe(updateData.name);
      expect(updated?.description).toBe(updateData.description);
      expect(updated?.source).toBe(testGroup.source); /** Unchanged */
    });

    test('should delete a group', async () => {
      const result = await methods.deleteGroup(testGroup._id);
      expect(result.deletedCount).toBe(1);

      const found = await methods.findGroupById(testGroup._id);
      expect(found).toBeNull();
    });
  });

  describe('Group Member Management', () => {
    let testGroup: t.IGroup;

    beforeEach(async () => {
      testGroup = await methods.createGroup({
        name: 'Member Test Group',
        source: 'local',
        memberIds: [],
      });
    });

    test('should add a member to a group', async () => {
      const memberId = 'user-456';
      const updated = await methods.addMemberToGroup(testGroup._id, memberId);

      expect(updated).toBeDefined();
      expect(updated?.memberIds).toContain(memberId);
      expect(updated?.memberIds).toHaveLength(1);
    });

    test('should not duplicate members when adding', async () => {
      const memberId = 'user-789';

      /** Add the same member twice */
      await methods.addMemberToGroup(testGroup._id, memberId);
      const updated = await methods.addMemberToGroup(testGroup._id, memberId);

      expect(updated?.memberIds).toHaveLength(1);
      expect(updated?.memberIds[0]).toBe(memberId);
    });

    test('should remove a member from a group', async () => {
      const memberId = 'user-999';

      /** First add the member */
      await methods.addMemberToGroup(testGroup._id, memberId);

      /** Then remove them */
      const updated = await methods.removeMemberFromGroup(testGroup._id, memberId);

      expect(updated).toBeDefined();
      expect(updated?.memberIds).not.toContain(memberId);
      expect(updated?.memberIds).toHaveLength(0);
    });

    test('should find groups by member ID', async () => {
      const memberId = 'shared-user-123';

      /** Create multiple groups with the same member */
      const group1 = await methods.createGroup({
        name: 'Group 1',
        source: 'local',
        memberIds: [memberId],
      });

      const group2 = await methods.createGroup({
        name: 'Group 2',
        source: 'local',
        memberIds: [memberId, 'other-user'],
      });

      /** Create a group without the member */
      await methods.createGroup({
        name: 'Group 3',
        source: 'local',
        memberIds: ['different-user'],
      });

      const memberGroups = await methods.findGroupsByMemberId(memberId);
      expect(memberGroups).toHaveLength(2);

      const groupIds = memberGroups.map((g) => g._id.toString());
      expect(groupIds).toContain(group1._id.toString());
      expect(groupIds).toContain(group2._id.toString());
    });
  });
});
