import mongoose, { Types } from 'mongoose';
import { PrincipalType, SystemRoles } from 'librechat-data-provider';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type * as t from '~/types';
import { createUserGroupMethods } from './userGroup';
import groupSchema from '~/schema/group';
import userSchema from '~/schema/user';
import roleSchema from '~/schema/role';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: MongoMemoryServer;
let Group: mongoose.Model<t.IGroup>;
let User: mongoose.Model<t.IUser>;
let Role: mongoose.Model<t.IRole>;
let methods: ReturnType<typeof createUserGroupMethods>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  Group = mongoose.models.Group || mongoose.model<t.IGroup>('Group', groupSchema);
  User = mongoose.models.User || mongoose.model<t.IUser>('User', userSchema);
  Role = mongoose.models.Role || mongoose.model<t.IRole>('Role', roleSchema);
  methods = createUserGroupMethods(mongoose);
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Group.deleteMany({});
  await User.deleteMany({});
  await Role.deleteMany({});
});

async function createTestUser(overrides: Partial<t.IUser> = {}) {
  return User.create({
    name: 'Test User',
    email: `user-${new Types.ObjectId()}@test.com`,
    password: 'password123',
    provider: 'local',
    role: SystemRoles.USER,
    ...overrides,
  });
}

describe('userGroup methods', () => {
  describe('findGroupById', () => {
    it('returns the group when it exists', async () => {
      const group = await Group.create({ name: 'Engineering', source: 'local' });
      const found = await methods.findGroupById(group._id);
      expect(found).toBeTruthy();
      expect(found!.name).toBe('Engineering');
    });

    it('returns null when group does not exist', async () => {
      const found = await methods.findGroupById(new Types.ObjectId());
      expect(found).toBeNull();
    });

    it('respects projection parameter', async () => {
      const group = await Group.create({
        name: 'Engineering',
        description: 'The eng team',
        source: 'local',
      });
      const found = await methods.findGroupById(group._id, { name: 1 });
      expect(found!.name).toBe('Engineering');
      expect(found!.description).toBeUndefined();
    });
  });

  describe('findGroupByExternalId', () => {
    it('finds a group by its external Entra ID', async () => {
      await Group.create({
        name: 'Entra Group',
        source: 'entra',
        idOnTheSource: 'entra-abc-123',
      });
      const found = await methods.findGroupByExternalId('entra-abc-123', 'entra');
      expect(found).toBeTruthy();
      expect(found!.name).toBe('Entra Group');
    });

    it('returns null when no match', async () => {
      const found = await methods.findGroupByExternalId('nonexistent', 'entra');
      expect(found).toBeNull();
    });
  });

  describe('findGroupsByNamePattern', () => {
    beforeEach(async () => {
      await Group.create([
        { name: 'Engineering', source: 'local', description: 'Eng team' },
        { name: 'Design', source: 'local', email: 'design@co.com' },
        { name: 'Entra Eng', source: 'entra', idOnTheSource: 'ext-1' },
      ]);
    });

    it('finds groups by name pattern (case-insensitive)', async () => {
      const results = await methods.findGroupsByNamePattern('eng');
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('matches on email field', async () => {
      const results = await methods.findGroupsByNamePattern('design@');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Design');
    });

    it('matches on description field', async () => {
      const results = await methods.findGroupsByNamePattern('Eng team');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Engineering');
    });

    it('filters by source when provided', async () => {
      const results = await methods.findGroupsByNamePattern('eng', 'entra');
      expect(results).toHaveLength(1);
      expect(results[0].source).toBe('entra');
    });

    it('respects limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await Group.create({ name: `Numbered Group ${i}`, source: 'local' });
      }
      const results = await methods.findGroupsByNamePattern('Numbered', null, 2);
      expect(results).toHaveLength(2);
    });
  });

  describe('findGroupsByMemberId', () => {
    it('returns groups the user is a member of via idOnTheSource', async () => {
      const user = await createTestUser({ idOnTheSource: 'user-ext-1' });
      await Group.create([
        { name: 'Group A', source: 'local', memberIds: ['user-ext-1'] },
        { name: 'Group B', source: 'local', memberIds: ['user-ext-1'] },
        { name: 'Group C', source: 'local', memberIds: ['other-user'] },
      ]);

      const groups = await methods.findGroupsByMemberId(user._id);
      expect(groups).toHaveLength(2);
      const names = groups.map((g) => g.name).sort();
      expect(names).toEqual(['Group A', 'Group B']);
    });

    it('returns empty array when user does not exist', async () => {
      const groups = await methods.findGroupsByMemberId(new Types.ObjectId());
      expect(groups).toEqual([]);
    });

    it('falls back to userId string when user has no idOnTheSource', async () => {
      const user = await createTestUser();
      await Group.create({
        name: 'Group X',
        source: 'local',
        memberIds: [user._id.toString()],
      });

      const groups = await methods.findGroupsByMemberId(user._id);
      expect(groups).toHaveLength(1);
    });
  });

  describe('createGroup', () => {
    it('creates a group and returns the document', async () => {
      const group = await methods.createGroup({ name: 'New Group', source: 'local' });
      expect(group).toBeTruthy();
      expect(group.name).toBe('New Group');
      expect(group._id).toBeDefined();
    });
  });

  describe('upsertGroupByExternalId', () => {
    it('creates a new group when none exists', async () => {
      const group = await methods.upsertGroupByExternalId('ext-new', 'entra', {
        name: 'New Entra Group',
      });
      expect(group).toBeTruthy();
      expect(group!.name).toBe('New Entra Group');
      expect(group!.idOnTheSource).toBe('ext-new');
    });

    it('updates existing group when found', async () => {
      await Group.create({ name: 'Old Name', source: 'entra', idOnTheSource: 'ext-1' });
      const group = await methods.upsertGroupByExternalId('ext-1', 'entra', {
        name: 'Updated Name',
      });
      expect(group!.name).toBe('Updated Name');
      const count = await Group.countDocuments({ idOnTheSource: 'ext-1' });
      expect(count).toBe(1);
    });
  });

  describe('addUserToGroup', () => {
    it('adds user to group using idOnTheSource', async () => {
      const user = await createTestUser({ idOnTheSource: 'user-ext-1' });
      const group = await Group.create({ name: 'Team', source: 'local' });

      const { group: updatedGroup } = await methods.addUserToGroup(user._id, group._id);
      expect(updatedGroup!.memberIds).toContain('user-ext-1');
    });

    it('falls back to userId string when user has no idOnTheSource', async () => {
      const user = await createTestUser();
      const group = await Group.create({ name: 'Team', source: 'local' });

      const { group: updatedGroup } = await methods.addUserToGroup(user._id, group._id);
      expect(updatedGroup!.memberIds).toContain(user._id.toString());
    });

    it('is idempotent — $addToSet prevents duplicates', async () => {
      const user = await createTestUser({ idOnTheSource: 'user-ext-1' });
      const group = await Group.create({ name: 'Team', source: 'local' });

      await methods.addUserToGroup(user._id, group._id);
      const { group: updatedGroup } = await methods.addUserToGroup(user._id, group._id);
      expect(updatedGroup!.memberIds!.filter((id) => id === 'user-ext-1')).toHaveLength(1);
    });

    it('throws when user does not exist', async () => {
      const group = await Group.create({ name: 'Team', source: 'local' });
      await expect(methods.addUserToGroup(new Types.ObjectId(), group._id)).rejects.toThrow(
        /User not found/,
      );
    });
  });

  describe('removeUserFromGroup', () => {
    it('removes user from group', async () => {
      const user = await createTestUser({ idOnTheSource: 'user-ext-1' });
      const group = await Group.create({
        name: 'Team',
        source: 'local',
        memberIds: ['user-ext-1'],
      });

      const { group: updatedGroup } = await methods.removeUserFromGroup(user._id, group._id);
      expect(updatedGroup!.memberIds).not.toContain('user-ext-1');
    });

    it('throws when user does not exist', async () => {
      const group = await Group.create({ name: 'Team', source: 'local' });
      await expect(methods.removeUserFromGroup(new Types.ObjectId(), group._id)).rejects.toThrow(
        /User not found/,
      );
    });

    it('is safe when user is not a member', async () => {
      const user = await createTestUser({ idOnTheSource: 'user-ext-1' });
      const group = await Group.create({
        name: 'Team',
        source: 'local',
        memberIds: ['other-user'],
      });

      const { group: updatedGroup } = await methods.removeUserFromGroup(user._id, group._id);
      expect(updatedGroup!.memberIds).toEqual(['other-user']);
    });
  });

  describe('removeUserFromAllGroups', () => {
    it('removes user from every group they belong to', async () => {
      const userId = new Types.ObjectId();
      await Group.create([
        { name: 'Group A', source: 'local', memberIds: [userId.toString(), 'other'] },
        { name: 'Group B', source: 'local', memberIds: [userId.toString()] },
        { name: 'Group C', source: 'local', memberIds: ['other'] },
      ]);

      await methods.removeUserFromAllGroups(userId.toString());

      const groups = await Group.find({ memberIds: userId.toString() });
      expect(groups).toHaveLength(0);

      const groupC = await Group.findOne({ name: 'Group C' });
      expect(groupC!.memberIds).toContain('other');
    });

    it('is a no-op when user is not in any groups', async () => {
      await Group.create({ name: 'Group A', source: 'local', memberIds: ['other'] });
      await expect(
        methods.removeUserFromAllGroups(new Types.ObjectId().toString()),
      ).resolves.not.toThrow();
    });
  });

  describe('getUserGroups', () => {
    it('delegates to findGroupsByMemberId', async () => {
      const user = await createTestUser({ idOnTheSource: 'user-ext-1' });
      await Group.create({ name: 'Team', source: 'local', memberIds: ['user-ext-1'] });

      const groups = await methods.getUserGroups(user._id);
      expect(groups).toHaveLength(1);
      expect(groups[0].name).toBe('Team');
    });
  });

  describe('getUserPrincipals', () => {
    it('returns USER, ROLE, and PUBLIC principals', async () => {
      const user = await createTestUser({ role: SystemRoles.ADMIN });
      const principals = await methods.getUserPrincipals({
        userId: user._id.toString(),
        role: SystemRoles.ADMIN,
      });

      const types = principals.map((p) => p.principalType);
      expect(types).toContain(PrincipalType.USER);
      expect(types).toContain(PrincipalType.ROLE);
      expect(types).toContain(PrincipalType.PUBLIC);
    });

    it('includes group principals when user is a member', async () => {
      const user = await createTestUser({ idOnTheSource: 'user-ext-1' });
      const group = await Group.create({
        name: 'Team',
        source: 'local',
        memberIds: ['user-ext-1'],
      });

      const principals = await methods.getUserPrincipals({
        userId: user._id.toString(),
        role: SystemRoles.USER,
      });

      const groupPrincipal = principals.find((p) => p.principalType === PrincipalType.GROUP);
      expect(groupPrincipal).toBeTruthy();
      expect(groupPrincipal!.principalId!.toString()).toBe(group._id.toString());
    });

    it('queries user role from DB when role param is undefined', async () => {
      const user = await createTestUser({ role: SystemRoles.ADMIN });
      const principals = await methods.getUserPrincipals({ userId: user._id.toString() });

      const rolePrincipal = principals.find((p) => p.principalType === PrincipalType.ROLE);
      expect(rolePrincipal).toBeTruthy();
      expect(rolePrincipal!.principalId).toBe(SystemRoles.ADMIN);
    });

    it('omits role principal when role is empty/whitespace', async () => {
      const user = await createTestUser({ role: '  ' });
      const principals = await methods.getUserPrincipals({
        userId: user._id.toString(),
        role: '  ',
      });

      const rolePrincipal = principals.find((p) => p.principalType === PrincipalType.ROLE);
      expect(rolePrincipal).toBeUndefined();
    });

    it('converts string userId to ObjectId for USER principal', async () => {
      const user = await createTestUser();
      const principals = await methods.getUserPrincipals({
        userId: user._id.toString(),
        role: SystemRoles.USER,
      });

      const userPrincipal = principals.find((p) => p.principalType === PrincipalType.USER);
      expect(userPrincipal!.principalId).toBeInstanceOf(Types.ObjectId);
    });

    it('includes null role when role param is null', async () => {
      const user = await createTestUser({ role: SystemRoles.USER });
      const principals = await methods.getUserPrincipals({
        userId: user._id.toString(),
        role: null,
      });

      const rolePrincipal = principals.find((p) => p.principalType === PrincipalType.ROLE);
      expect(rolePrincipal).toBeUndefined();
    });
  });

  describe('syncUserEntraGroups', () => {
    it('creates new groups and adds user as member', async () => {
      const user = await createTestUser({ idOnTheSource: 'user-ext-1' });

      const { addedGroups, removedGroups } = await methods.syncUserEntraGroups(user._id, [
        { id: 'entra-g1', name: 'Entra Group 1' },
        { id: 'entra-g2', name: 'Entra Group 2', description: 'desc', email: 'g2@co.com' },
      ]);

      expect(addedGroups).toHaveLength(2);
      expect(removedGroups).toHaveLength(0);

      const groups = await Group.find({ source: 'entra' });
      expect(groups).toHaveLength(2);
      expect(groups.every((g) => g.memberIds!.includes('user-ext-1'))).toBe(true);
    });

    it('adds user to existing group they are not a member of', async () => {
      const user = await createTestUser({ idOnTheSource: 'user-ext-1' });
      await Group.create({
        name: 'Existing Entra Group',
        source: 'entra',
        idOnTheSource: 'entra-g1',
        memberIds: ['other-user'],
      });

      const { addedGroups } = await methods.syncUserEntraGroups(user._id, [
        { id: 'entra-g1', name: 'Existing Entra Group' },
      ]);

      expect(addedGroups).toHaveLength(1);
      const group = await Group.findOne({ idOnTheSource: 'entra-g1' });
      expect(group!.memberIds).toContain('user-ext-1');
      expect(group!.memberIds).toContain('other-user');
    });

    it('skips groups the user is already a member of', async () => {
      const user = await createTestUser({ idOnTheSource: 'user-ext-1' });
      await Group.create({
        name: 'Already Member',
        source: 'entra',
        idOnTheSource: 'entra-g1',
        memberIds: ['user-ext-1'],
      });

      const { addedGroups } = await methods.syncUserEntraGroups(user._id, [
        { id: 'entra-g1', name: 'Already Member' },
      ]);

      expect(addedGroups).toHaveLength(0);
    });

    it('removes user from stale entra groups', async () => {
      const user = await createTestUser({ idOnTheSource: 'user-ext-1' });
      await Group.create({
        name: 'Stale Group',
        source: 'entra',
        idOnTheSource: 'entra-stale',
        memberIds: ['user-ext-1'],
      });

      const { removedGroups } = await methods.syncUserEntraGroups(user._id, []);

      expect(removedGroups).toHaveLength(1);
      expect(removedGroups[0].name).toBe('Stale Group');
      const group = await Group.findOne({ idOnTheSource: 'entra-stale' });
      expect(group!.memberIds).not.toContain('user-ext-1');
    });

    it('handles add-and-remove in one sync call', async () => {
      const user = await createTestUser({ idOnTheSource: 'user-ext-1' });

      await Group.create({
        name: 'Keep Group',
        source: 'entra',
        idOnTheSource: 'entra-keep',
        memberIds: ['user-ext-1'],
      });
      await Group.create({
        name: 'Remove Group',
        source: 'entra',
        idOnTheSource: 'entra-remove',
        memberIds: ['user-ext-1'],
      });

      const { addedGroups, removedGroups } = await methods.syncUserEntraGroups(user._id, [
        { id: 'entra-keep', name: 'Keep Group' },
        { id: 'entra-new', name: 'New Group' },
      ]);

      expect(addedGroups).toHaveLength(1);
      expect(addedGroups[0].name).toBe('New Group');
      expect(removedGroups).toHaveLength(1);
      expect(removedGroups[0].name).toBe('Remove Group');
    });

    it('preserves local groups during entra sync', async () => {
      const user = await createTestUser({ idOnTheSource: 'user-ext-1' });
      await Group.create({
        name: 'Local Group',
        source: 'local',
        memberIds: ['user-ext-1'],
      });

      await methods.syncUserEntraGroups(user._id, []);

      const localGroup = await Group.findOne({ name: 'Local Group' });
      expect(localGroup!.memberIds).toContain('user-ext-1');
    });

    it('throws when user does not exist', async () => {
      await expect(
        methods.syncUserEntraGroups(new Types.ObjectId(), [{ id: 'g1', name: 'Group' }]),
      ).rejects.toThrow(/User not found/);
    });

    it('returns the updated user document', async () => {
      const user = await createTestUser({ idOnTheSource: 'user-ext-1' });
      const { user: updatedUser } = await methods.syncUserEntraGroups(user._id, []);
      expect(updatedUser._id.toString()).toBe(user._id.toString());
    });
  });

  describe('calculateRelevanceScore', () => {
    it('returns 100 for exact match', () => {
      const score = methods.calculateRelevanceScore(
        { type: PrincipalType.USER, name: 'alice', source: 'local' },
        'alice',
      );
      expect(score).toBe(100);
    });

    it('returns 80 for starts-with match', () => {
      const score = methods.calculateRelevanceScore(
        { type: PrincipalType.USER, name: 'alice-smith', source: 'local' },
        'alice',
      );
      expect(score).toBe(80);
    });

    it('returns 50 for contains match', () => {
      const score = methods.calculateRelevanceScore(
        { type: PrincipalType.USER, name: 'bob-alice-jones', source: 'local' },
        'alice',
      );
      expect(score).toBe(50);
    });

    it('returns 10 (default) when no substring or exact match — regex fallback', () => {
      const score = methods.calculateRelevanceScore(
        { type: PrincipalType.USER, name: 'bob', source: 'local' },
        'zzz',
      );
      expect(score).toBe(10);
    });

    it('checks email and username for USER type', () => {
      const score = methods.calculateRelevanceScore(
        {
          type: PrincipalType.USER,
          name: 'other',
          email: 'alice@test.com',
          username: 'alice',
          source: 'local',
        },
        'alice',
      );
      expect(score).toBe(100);
    });

    it('checks description for GROUP type', () => {
      const score = methods.calculateRelevanceScore(
        {
          type: PrincipalType.GROUP,
          name: 'other',
          description: 'alice team',
          source: 'local',
        },
        'alice',
      );
      expect(score).toBe(80);
    });

    it('picks the highest score across multiple fields', () => {
      const score = methods.calculateRelevanceScore(
        {
          type: PrincipalType.USER,
          name: 'contains-alice-here',
          email: 'alice@test.com',
          source: 'local',
        },
        'alice',
      );
      expect(score).toBe(80);
    });

    it('returns 100 when regex pattern matches exactly via dot wildcard', () => {
      const score = methods.calculateRelevanceScore(
        { type: PrincipalType.USER, name: 'xYz', source: 'local' },
        'x.z',
      );
      expect(score).toBe(100);
    });
  });

  describe('sortPrincipalsByRelevance', () => {
    it('sorts by score descending', () => {
      const items = [
        { type: PrincipalType.USER, name: 'low', _searchScore: 10 },
        { type: PrincipalType.USER, name: 'high', _searchScore: 100 },
        { type: PrincipalType.USER, name: 'mid', _searchScore: 50 },
      ];

      const sorted = methods.sortPrincipalsByRelevance(items);
      expect(sorted.map((i) => i._searchScore)).toEqual([100, 50, 10]);
    });

    it('prioritizes USER over GROUP at equal scores', () => {
      const items = [
        { type: PrincipalType.GROUP, name: 'group', _searchScore: 80 },
        { type: PrincipalType.USER, name: 'user', _searchScore: 80 },
      ];

      const sorted = methods.sortPrincipalsByRelevance(items);
      expect(sorted[0].type).toBe(PrincipalType.USER);
    });

    it('sorts alphabetically by name at equal scores and types', () => {
      const items = [
        { type: PrincipalType.USER, name: 'charlie', _searchScore: 80 },
        { type: PrincipalType.USER, name: 'alice', _searchScore: 80 },
        { type: PrincipalType.USER, name: 'bob', _searchScore: 80 },
      ];

      const sorted = methods.sortPrincipalsByRelevance(items);
      expect(sorted.map((i) => i.name)).toEqual(['alice', 'bob', 'charlie']);
    });

    it('handles missing _searchScore (falls back to 0)', () => {
      const items = [
        { type: PrincipalType.USER, name: 'a' },
        { type: PrincipalType.USER, name: 'b', _searchScore: 50 },
      ];

      const sorted = methods.sortPrincipalsByRelevance(items);
      expect(sorted[0]._searchScore).toBe(50);
    });

    it('uses email as fallback name for sorting', () => {
      const items = [
        { type: PrincipalType.USER, email: 'z@test.com', _searchScore: 80 },
        { type: PrincipalType.USER, email: 'a@test.com', _searchScore: 80 },
      ];

      const sorted = methods.sortPrincipalsByRelevance(items);
      expect(sorted[0].email).toBe('a@test.com');
    });
  });

  describe('searchPrincipals', () => {
    beforeEach(async () => {
      await User.create([
        {
          name: 'Alice Smith',
          email: 'alice@test.com',
          username: 'alice',
          password: 'password123',
          provider: 'local',
        },
        {
          name: 'Bob Jones',
          email: 'bob@test.com',
          username: 'bob',
          password: 'password123',
          provider: 'local',
        },
      ]);
      await Group.create([
        { name: 'Alpha Team', source: 'local' },
        { name: 'Beta Team', source: 'local' },
      ]);
      await Role.create([{ name: 'admin' }, { name: 'moderator' }]);
    });

    it('returns empty array for empty search pattern', async () => {
      const results = await methods.searchPrincipals('');
      expect(results).toEqual([]);
    });

    it('returns empty array for whitespace-only pattern', async () => {
      const results = await methods.searchPrincipals('   ');
      expect(results).toEqual([]);
    });

    it('finds matching users', async () => {
      const results = await methods.searchPrincipals('alice');
      const userResults = results.filter((r) => r.type === PrincipalType.USER);
      expect(userResults.length).toBeGreaterThanOrEqual(1);
      expect(userResults[0].name).toBe('Alice Smith');
    });

    it('finds matching groups', async () => {
      const results = await methods.searchPrincipals('alpha');
      const groupResults = results.filter((r) => r.type === PrincipalType.GROUP);
      expect(groupResults.length).toBeGreaterThanOrEqual(1);
      expect(groupResults[0].name).toBe('Alpha Team');
    });

    it('finds matching roles', async () => {
      const results = await methods.searchPrincipals('admin');
      const roleResults = results.filter((r) => r.type === PrincipalType.ROLE);
      expect(roleResults.length).toBeGreaterThanOrEqual(1);
      expect(roleResults[0].name).toBe('admin');
    });

    it('filters by USER type only', async () => {
      const results = await methods.searchPrincipals('a', 10, [PrincipalType.USER]);
      expect(results.every((r) => r.type === PrincipalType.USER)).toBe(true);
    });

    it('filters by GROUP type only', async () => {
      const results = await methods.searchPrincipals('team', 10, [PrincipalType.GROUP]);
      expect(results.every((r) => r.type === PrincipalType.GROUP)).toBe(true);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('filters by ROLE type only', async () => {
      const results = await methods.searchPrincipals('mod', 10, [PrincipalType.ROLE]);
      expect(results.every((r) => r.type === PrincipalType.ROLE)).toBe(true);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('respects limitPerType', async () => {
      const results = await methods.searchPrincipals('a', 1);
      const userResults = results.filter((r) => r.type === PrincipalType.USER);
      expect(userResults.length).toBeLessThanOrEqual(1);
    });

    it('returns combined results across types without filter', async () => {
      const results = await methods.searchPrincipals('a');
      const types = new Set(results.map((r) => r.type));
      expect(types.size).toBeGreaterThanOrEqual(2);
    });

    it('finds users by username', async () => {
      const results = await methods.searchPrincipals('alice', 10, [PrincipalType.USER]);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('transforms user results to TPrincipalSearchResult format', async () => {
      const results = await methods.searchPrincipals('alice', 10, [PrincipalType.USER]);
      expect(results[0]).toEqual(
        expect.objectContaining({
          type: PrincipalType.USER,
          name: 'Alice Smith',
          source: 'local',
        }),
      );
      expect(results[0].id).toBeDefined();
    });

    it('transforms group results to TPrincipalSearchResult format', async () => {
      const results = await methods.searchPrincipals('alpha', 10, [PrincipalType.GROUP]);
      expect(results[0]).toEqual(
        expect.objectContaining({
          type: PrincipalType.GROUP,
          name: 'Alpha Team',
          source: 'local',
        }),
      );
      expect(results[0].id).toBeDefined();
      expect(results[0].memberCount).toBeDefined();
    });
  });

  describe('findGroupByQuery', () => {
    it('finds a group by custom filter', async () => {
      await Group.create({ name: 'Target', source: 'local', email: 'target@co.com' });
      const found = await methods.findGroupByQuery({ email: 'target@co.com' });
      expect(found).toBeTruthy();
      expect(found!.name).toBe('Target');
    });

    it('returns null when no match', async () => {
      const found = await methods.findGroupByQuery({ name: 'Nonexistent' });
      expect(found).toBeNull();
    });
  });

  describe('updateGroupById', () => {
    it('updates the group and returns the new document', async () => {
      const group = await Group.create({ name: 'Old Name', source: 'local' });
      const updated = await methods.updateGroupById(group._id, { name: 'New Name' });
      expect(updated!.name).toBe('New Name');
    });

    it('returns null when group does not exist', async () => {
      const updated = await methods.updateGroupById(new Types.ObjectId(), { name: 'X' });
      expect(updated).toBeNull();
    });
  });

  describe('bulkUpdateGroups', () => {
    it('updates all groups matching the filter', async () => {
      await Group.create([
        { name: 'Group A', source: 'entra', idOnTheSource: 'ext-a' },
        { name: 'Group B', source: 'entra', idOnTheSource: 'ext-b' },
        { name: 'Group C', source: 'local' },
      ]);

      const result = await methods.bulkUpdateGroups(
        { source: 'entra' },
        { $set: { description: 'synced' } },
      );

      expect(result.modifiedCount).toBe(2);
      const synced = await Group.find({ description: 'synced' });
      expect(synced).toHaveLength(2);
    });

    it('returns zero when no groups match', async () => {
      const result = await methods.bulkUpdateGroups(
        { source: 'entra' },
        { $set: { description: 'x' } },
      );
      expect(result.modifiedCount).toBe(0);
    });
  });
});
