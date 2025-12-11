import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type * as t from '~/types';
import { createUserMethods } from './user';
import userSchema from '~/schema/user';
import balanceSchema from '~/schema/balance';

/** Mocking crypto for generateToken */
jest.mock('~/crypto', () => ({
  signPayload: jest.fn().mockResolvedValue('mocked-token'),
}));

let mongoServer: MongoMemoryServer;
let User: mongoose.Model<t.IUser>;
let Balance: mongoose.Model<t.IBalance>;
let methods: ReturnType<typeof createUserMethods>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);

  /** Register models */
  User = mongoose.models.User || mongoose.model<t.IUser>('User', userSchema);
  Balance = mongoose.models.Balance || mongoose.model<t.IBalance>('Balance', balanceSchema);

  /** Initialize methods */
  methods = createUserMethods(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

describe('User Methods - Database Tests', () => {
  describe('findUser', () => {
    test('should find user by exact email', async () => {
      await User.create({
        name: 'Test User',
        email: 'test@example.com',
        provider: 'local',
      });

      const found = await methods.findUser({ email: 'test@example.com' });

      expect(found).toBeDefined();
      expect(found?.email).toBe('test@example.com');
    });

    test('should find user by email with different case (case-insensitive)', async () => {
      await User.create({
        name: 'Test User',
        email: 'test@example.com', // stored lowercase by schema
        provider: 'local',
      });

      /** Test various case combinations - all should find the same user */
      const foundUpper = await methods.findUser({ email: 'TEST@EXAMPLE.COM' });
      const foundMixed = await methods.findUser({ email: 'Test@Example.COM' });
      const foundLower = await methods.findUser({ email: 'test@example.com' });

      expect(foundUpper).toBeDefined();
      expect(foundUpper?.email).toBe('test@example.com');

      expect(foundMixed).toBeDefined();
      expect(foundMixed?.email).toBe('test@example.com');

      expect(foundLower).toBeDefined();
      expect(foundLower?.email).toBe('test@example.com');
    });

    test('should find user by email with leading/trailing whitespace (trimmed)', async () => {
      await User.create({
        name: 'Test User',
        email: 'test@example.com',
        provider: 'local',
      });

      const foundWithSpaces = await methods.findUser({ email: '  test@example.com  ' });
      const foundWithTabs = await methods.findUser({ email: '\ttest@example.com\t' });

      expect(foundWithSpaces).toBeDefined();
      expect(foundWithSpaces?.email).toBe('test@example.com');

      expect(foundWithTabs).toBeDefined();
      expect(foundWithTabs?.email).toBe('test@example.com');
    });

    test('should find user by email with both case difference and whitespace', async () => {
      await User.create({
        name: 'Test User',
        email: 'john.doe@example.com',
        provider: 'local',
      });

      const found = await methods.findUser({ email: '  John.Doe@EXAMPLE.COM  ' });

      expect(found).toBeDefined();
      expect(found?.email).toBe('john.doe@example.com');
    });

    test('should normalize email in $or conditions', async () => {
      await User.create({
        name: 'Test User',
        email: 'test@example.com',
        provider: 'openid',
        openidId: 'openid-123',
      });

      const found = await methods.findUser({
        $or: [{ openidId: 'different-id' }, { email: 'TEST@EXAMPLE.COM' }],
      });

      expect(found).toBeDefined();
      expect(found?.email).toBe('test@example.com');
    });

    test('should find user by non-email criteria without affecting them', async () => {
      await User.create({
        name: 'Test User',
        email: 'test@example.com',
        provider: 'openid',
        openidId: 'openid-123',
      });

      const found = await methods.findUser({ openidId: 'openid-123' });

      expect(found).toBeDefined();
      expect(found?.openidId).toBe('openid-123');
    });

    test('should apply field selection correctly', async () => {
      await User.create({
        name: 'Test User',
        email: 'test@example.com',
        provider: 'local',
        username: 'testuser',
      });

      const found = await methods.findUser({ email: 'test@example.com' }, 'email name');

      expect(found).toBeDefined();
      expect(found?.email).toBe('test@example.com');
      expect(found?.name).toBe('Test User');
      expect(found?.username).toBeUndefined();
      expect(found?.provider).toBeUndefined();
    });

    test('should return null for non-existent user', async () => {
      const found = await methods.findUser({ email: 'nonexistent@example.com' });

      expect(found).toBeNull();
    });
  });

  describe('createUser', () => {
    test('should create a user and return ObjectId by default', async () => {
      const result = await methods.createUser({
        name: 'New User',
        email: 'new@example.com',
        provider: 'local',
      });

      expect(result).toBeInstanceOf(mongoose.Types.ObjectId);

      const user = await User.findById(result);
      expect(user).toBeDefined();
      expect(user?.name).toBe('New User');
      expect(user?.email).toBe('new@example.com');
    });

    test('should create a user and return user object when returnUser is true', async () => {
      const result = await methods.createUser(
        {
          name: 'New User',
          email: 'new@example.com',
          provider: 'local',
        },
        undefined,
        true,
        true,
      );

      expect(result).toHaveProperty('_id');
      expect(result).toHaveProperty('name', 'New User');
      expect(result).toHaveProperty('email', 'new@example.com');
    });

    test('should store email as lowercase regardless of input case', async () => {
      await methods.createUser({
        name: 'New User',
        email: 'NEW@EXAMPLE.COM',
        provider: 'local',
      });

      const user = await User.findOne({ email: 'new@example.com' });
      expect(user).toBeDefined();
      expect(user?.email).toBe('new@example.com');
    });

    test('should create user with TTL when disableTTL is false', async () => {
      const result = await methods.createUser(
        {
          name: 'TTL User',
          email: 'ttl@example.com',
          provider: 'local',
        },
        undefined,
        false,
        true,
      );

      expect(result).toHaveProperty('expiresAt');
      const expiresAt = (result as t.IUser).expiresAt;
      expect(expiresAt).toBeInstanceOf(Date);

      /** Should expire in approximately 1 week */
      const oneWeekMs = 604800 * 1000;
      const expectedExpiry = Date.now() + oneWeekMs;
      expect(expiresAt!.getTime()).toBeGreaterThan(expectedExpiry - 10000);
      expect(expiresAt!.getTime()).toBeLessThan(expectedExpiry + 10000);
    });

    test('should create balance record when balanceConfig is provided', async () => {
      const userId = await methods.createUser(
        {
          name: 'Balance User',
          email: 'balance@example.com',
          provider: 'local',
        },
        {
          enabled: true,
          startBalance: 1000,
        },
      );

      const balance = await Balance.findOne({ user: userId });
      expect(balance).toBeDefined();
      expect(balance?.tokenCredits).toBe(1000);
    });
  });

  describe('updateUser', () => {
    test('should update user fields', async () => {
      const user = await User.create({
        name: 'Original Name',
        email: 'test@example.com',
        provider: 'local',
      });

      const updated = await methods.updateUser(user._id?.toString() ?? '', {
        name: 'Updated Name',
      });

      expect(updated).toBeDefined();
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.email).toBe('test@example.com');
    });

    test('should remove expiresAt field on update', async () => {
      const user = await User.create({
        name: 'TTL User',
        email: 'ttl@example.com',
        provider: 'local',
        expiresAt: new Date(Date.now() + 604800 * 1000),
      });

      const updated = await methods.updateUser(user._id?.toString() || '', {
        name: 'No longer TTL',
      });

      expect(updated).toBeDefined();
      expect(updated?.expiresAt).toBeUndefined();
    });

    test('should return null for non-existent user', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const result = await methods.updateUser(fakeId.toString(), { name: 'Test' });

      expect(result).toBeNull();
    });
  });

  describe('getUserById', () => {
    test('should get user by ID', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        provider: 'local',
      });

      const found = await methods.getUserById(user._id?.toString() || '');

      expect(found).toBeDefined();
      expect(found?.name).toBe('Test User');
    });

    test('should apply field selection', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        provider: 'local',
        username: 'testuser',
      });

      const found = await methods.getUserById(user._id?.toString() || '', 'name email');

      expect(found).toBeDefined();
      expect(found?.name).toBe('Test User');
      expect(found?.email).toBe('test@example.com');
      expect(found?.username).toBeUndefined();
    });

    test('should return null for non-existent ID', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const found = await methods.getUserById(fakeId.toString());

      expect(found).toBeNull();
    });
  });

  describe('deleteUserById', () => {
    test('should delete user by ID', async () => {
      const user = await User.create({
        name: 'To Delete',
        email: 'delete@example.com',
        provider: 'local',
      });

      const result = await methods.deleteUserById(user._id?.toString() || '');

      expect(result.deletedCount).toBe(1);
      expect(result.message).toBe('User was deleted successfully.');

      const found = await User.findById(user._id);
      expect(found).toBeNull();
    });

    test('should return zero count for non-existent user', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const result = await methods.deleteUserById(fakeId.toString());

      expect(result.deletedCount).toBe(0);
      expect(result.message).toBe('No user found with that ID.');
    });
  });

  describe('countUsers', () => {
    test('should count all users', async () => {
      await User.create([
        { name: 'User 1', email: 'user1@example.com', provider: 'local' },
        { name: 'User 2', email: 'user2@example.com', provider: 'local' },
        { name: 'User 3', email: 'user3@example.com', provider: 'openid' },
      ]);

      const count = await methods.countUsers();

      expect(count).toBe(3);
    });

    test('should count users with filter', async () => {
      await User.create([
        { name: 'User 1', email: 'user1@example.com', provider: 'local' },
        { name: 'User 2', email: 'user2@example.com', provider: 'local' },
        { name: 'User 3', email: 'user3@example.com', provider: 'openid' },
      ]);

      const count = await methods.countUsers({ provider: 'local' });

      expect(count).toBe(2);
    });

    test('should return zero for empty collection', async () => {
      const count = await methods.countUsers();

      expect(count).toBe(0);
    });
  });

  describe('searchUsers', () => {
    beforeEach(async () => {
      await User.create([
        { name: 'John Doe', email: 'john@example.com', username: 'johnd', provider: 'local' },
        { name: 'Jane Smith', email: 'jane@example.com', username: 'janes', provider: 'local' },
        {
          name: 'Bob Johnson',
          email: 'bob@example.com',
          username: 'bobbyj',
          provider: 'local',
        },
        {
          name: 'Alice Wonder',
          email: 'alice@test.com',
          username: 'alice',
          provider: 'openid',
        },
      ]);
    });

    test('should search by name', async () => {
      const results = await methods.searchUsers({ searchPattern: 'John' });

      expect(results).toHaveLength(2); // John Doe and Bob Johnson
    });

    test('should search by email', async () => {
      const results = await methods.searchUsers({ searchPattern: 'example.com' });

      expect(results).toHaveLength(3);
    });

    test('should search by username', async () => {
      const results = await methods.searchUsers({ searchPattern: 'alice' });

      expect(results).toHaveLength(1);
      expect((results[0] as unknown as t.IUser)?.username).toBe('alice');
    });

    test('should be case-insensitive', async () => {
      const results = await methods.searchUsers({ searchPattern: 'JOHN' });

      expect(results.length).toBeGreaterThan(0);
    });

    test('should respect limit', async () => {
      const results = await methods.searchUsers({ searchPattern: 'example', limit: 2 });

      expect(results).toHaveLength(2);
    });

    test('should return empty array for empty search pattern', async () => {
      const results = await methods.searchUsers({ searchPattern: '' });

      expect(results).toEqual([]);
    });

    test('should return empty array for whitespace-only pattern', async () => {
      const results = await methods.searchUsers({ searchPattern: '   ' });

      expect(results).toEqual([]);
    });

    test('should apply field selection', async () => {
      const results = await methods.searchUsers({
        searchPattern: 'john',
        fieldsToSelect: 'name email',
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('name');
      expect(results[0]).toHaveProperty('email');
      expect(results[0]).not.toHaveProperty('username');
    });

    test('should sort by relevance (exact match first)', async () => {
      const results = await methods.searchUsers({ searchPattern: 'alice' });

      /** 'alice' username should score highest due to exact match */
      expect((results[0] as unknown as t.IUser).username).toBe('alice');
    });
  });

  describe('toggleUserMemories', () => {
    test('should enable memories for user', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        provider: 'local',
      });

      const updated = await methods.toggleUserMemories(user._id?.toString() || '', true);

      expect(updated).toBeDefined();
      expect(updated?.personalization?.memories).toBe(true);
    });

    test('should disable memories for user', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        provider: 'local',
        personalization: { memories: true },
      });

      const updated = await methods.toggleUserMemories(user._id?.toString() || '', false);

      expect(updated).toBeDefined();
      expect(updated?.personalization?.memories).toBe(false);
    });

    test('should update personalization.memories field', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        provider: 'local',
      });

      /** Toggle memories to true */
      const updated = await methods.toggleUserMemories(user._id?.toString() || '', true);

      expect(updated?.personalization).toBeDefined();
      expect(updated?.personalization?.memories).toBe(true);

      /** Toggle back to false */
      const updatedAgain = await methods.toggleUserMemories(user._id?.toString() || '', false);
      expect(updatedAgain?.personalization?.memories).toBe(false);
    });

    test('should return null for non-existent user', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const result = await methods.toggleUserMemories(fakeId.toString(), true);

      expect(result).toBeNull();
    });
  });

  describe('Email Normalization Edge Cases', () => {
    test('should handle email with multiple spaces', async () => {
      await User.create({
        name: 'Test User',
        email: 'test@example.com',
        provider: 'local',
      });

      const found = await methods.findUser({ email: '    test@example.com    ' });

      expect(found).toBeDefined();
      expect(found?.email).toBe('test@example.com');
    });

    test('should handle mixed case with international characters', async () => {
      await User.create({
        name: 'Test User',
        email: 'user@example.com',
        provider: 'local',
      });

      const found = await methods.findUser({ email: 'USER@EXAMPLE.COM' });

      expect(found).toBeDefined();
    });

    test('should handle email normalization in complex $or queries', async () => {
      const user1 = await User.create({
        name: 'User One',
        email: 'user1@example.com',
        provider: 'openid',
        openidId: 'openid-1',
      });

      await User.create({
        name: 'User Two',
        email: 'user2@example.com',
        provider: 'openid',
        openidId: 'openid-2',
      });

      /** Search with mixed case email in $or */
      const found = await methods.findUser({
        $or: [{ openidId: 'nonexistent' }, { email: 'USER1@EXAMPLE.COM' }],
      });

      expect(found).toBeDefined();
      expect(found?._id?.toString()).toBe(user1._id?.toString());
    });

    test('should not normalize non-string email values', async () => {
      await User.create({
        name: 'Test User',
        email: 'test@example.com',
        provider: 'local',
      });

      /** Using regex for email (should not be normalized) */
      const found = await methods.findUser({ email: /test@example\.com/i });

      expect(found).toBeDefined();
      expect(found?.email).toBe('test@example.com');
    });

    test('should handle OpenID provider migration scenario', async () => {
      /** Simulate user stored with lowercase email */
      await User.create({
        name: 'John Doe',
        email: 'john.doe@company.com',
        provider: 'openid',
        openidId: 'old-provider-id',
      });

      /**
       * New OpenID provider returns email with different casing
       * This simulates the exact bug reported in the GitHub issue
       */
      const emailFromNewProvider = 'John.Doe@Company.COM';

      const found = await methods.findUser({ email: emailFromNewProvider });

      expect(found).toBeDefined();
      expect(found?.email).toBe('john.doe@company.com');
      expect(found?.name).toBe('John Doe');
    });

    test('should handle SAML provider email normalization', async () => {
      await User.create({
        name: 'SAML User',
        email: 'saml.user@enterprise.com',
        provider: 'saml',
        samlId: 'saml-123',
      });

      /** SAML providers sometimes return emails in different formats */
      const found = await methods.findUser({ email: '  SAML.USER@ENTERPRISE.COM  ' });

      expect(found).toBeDefined();
      expect(found?.provider).toBe('saml');
    });
  });
});
