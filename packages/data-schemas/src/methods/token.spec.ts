import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type * as t from '~/types';
import { createTokenMethods } from './token';
import tokenSchema from '~/schema/token';

/** Mocking logger */
jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: MongoMemoryServer;
let Token: mongoose.Model<t.IToken>;
let methods: ReturnType<typeof createTokenMethods>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);

  /** Register models */
  Token = mongoose.models.Token || mongoose.model<t.IToken>('Token', tokenSchema);

  /** Initialize methods */
  methods = createTokenMethods(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

describe('Token Methods - Detailed Tests', () => {
  describe('createToken', () => {
    test('should create a token with correct expiry time', async () => {
      const userId = new mongoose.Types.ObjectId();
      const tokenData = {
        token: 'test-token-123',
        userId: userId,
        email: 'test@example.com',
        expiresIn: 3600, // 1 hour
      };

      const token = await methods.createToken(tokenData);

      expect(token).toBeDefined();
      expect(token.token).toBe(tokenData.token);
      expect(token.userId.toString()).toBe(userId.toString());
      expect(token.email).toBe(tokenData.email);

      // Check expiry time
      const expectedExpiry = new Date(token.createdAt.getTime() + tokenData.expiresIn * 1000);
      expect(token.expiresAt.getTime()).toBe(expectedExpiry.getTime());
    });

    test('should create token with all required fields', async () => {
      const userId = new mongoose.Types.ObjectId();
      const tokenData = {
        token: 'minimal-token',
        userId: userId,
        expiresIn: 1800,
      };

      const token = await methods.createToken(tokenData);

      expect(token).toBeDefined();
      expect(token.token).toBe(tokenData.token);
      expect(token.userId.toString()).toBe(userId.toString());
      expect(token.email).toBeUndefined();
    });

    test('should create token with identifier field', async () => {
      const userId = new mongoose.Types.ObjectId();
      const tokenData = {
        token: 'identifier-token',
        userId: userId,
        identifier: 'oauth-identifier-123',
        expiresIn: 7200,
      };

      const token = await methods.createToken(tokenData);

      expect(token).toBeDefined();
      expect(token.identifier).toBe(tokenData.identifier);
    });
  });

  describe('findToken', () => {
    let user1Id: mongoose.Types.ObjectId;
    let user2Id: mongoose.Types.ObjectId;

    beforeEach(async () => {
      user1Id = new mongoose.Types.ObjectId();
      user2Id = new mongoose.Types.ObjectId();

      await Token.create([
        {
          token: 'token-1',
          userId: user1Id,
          email: 'user1@example.com',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 3600000),
        },
        {
          token: 'token-2',
          userId: user2Id,
          email: 'user2@example.com',
          identifier: 'oauth-123',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 3600000),
        },
        {
          token: 'token-3',
          userId: user1Id,
          email: 'user1@example.com',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 3600000),
        },
      ]);
    });

    test('should find token by token value', async () => {
      const found = await methods.findToken({ token: 'token-1' });

      expect(found).toBeDefined();
      expect(found?.token).toBe('token-1');
      expect(found?.userId.toString()).toBe(user1Id.toString());
    });

    test('should find token by userId', async () => {
      const found = await methods.findToken({ userId: user2Id.toString() });

      expect(found).toBeDefined();
      expect(found?.token).toBe('token-2');
      expect(found?.email).toBe('user2@example.com');
    });

    test('should find token by email', async () => {
      const found = await methods.findToken({ email: 'user2@example.com' });

      expect(found).toBeDefined();
      expect(found?.token).toBe('token-2');
      expect(found?.userId.toString()).toBe(user2Id.toString());
    });

    test('should find token by identifier', async () => {
      const found = await methods.findToken({ identifier: 'oauth-123' });

      expect(found).toBeDefined();
      expect(found?.token).toBe('token-2');
      expect(found?.identifier).toBe('oauth-123');
    });

    test('should find token by multiple criteria (AND condition)', async () => {
      const found = await methods.findToken({
        userId: user1Id.toString(),
        email: 'user1@example.com',
      });

      expect(found).toBeDefined();
      expect(found?.token).toBe('token-1'); // Should find first matching
    });

    test('should return null for non-existent token', async () => {
      const found = await methods.findToken({ token: 'non-existent' });

      expect(found).toBeNull();
    });

    test('should return null when criteria do not match together', async () => {
      const found = await methods.findToken({
        userId: user1Id.toString(),
        email: 'user2@example.com', // Mismatched email
      });

      expect(found).toBeNull();
    });
  });

  describe('updateToken', () => {
    let updateUserId: mongoose.Types.ObjectId;

    beforeEach(async () => {
      updateUserId = new mongoose.Types.ObjectId();
      await Token.create({
        token: 'update-token',
        userId: updateUserId,
        email: 'update@example.com',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      });
    });

    test('should update token by token value', async () => {
      const updated = await methods.updateToken(
        { token: 'update-token' },
        { email: 'newemail@example.com' },
      );

      expect(updated).toBeDefined();
      expect(updated?.email).toBe('newemail@example.com');
      expect(updated?.userId.toString()).toBe(updateUserId.toString()); // Unchanged
    });

    test('should update token by userId', async () => {
      const updated = await methods.updateToken(
        { userId: updateUserId.toString() },
        { email: 'newemail@example.com' },
      );

      expect(updated).toBeDefined();
      expect(updated?.email).toBe('newemail@example.com');
      expect(updated?.token).toBe('update-token'); // Unchanged
    });

    test('should return null for non-existent token', async () => {
      const updated = await methods.updateToken(
        { token: 'non-existent' },
        { email: 'newemail@example.com' },
      );

      expect(updated).toBeNull();
    });
  });

  describe('deleteTokens', () => {
    let user1Id: mongoose.Types.ObjectId;
    let user2Id: mongoose.Types.ObjectId;
    let user3Id: mongoose.Types.ObjectId;
    let oauthUserId: mongoose.Types.ObjectId;

    beforeEach(async () => {
      user1Id = new mongoose.Types.ObjectId();
      user2Id = new mongoose.Types.ObjectId();
      user3Id = new mongoose.Types.ObjectId();
      oauthUserId = new mongoose.Types.ObjectId();

      await Token.create([
        {
          token: 'verify-token-1',
          userId: user1Id,
          email: 'user1@example.com',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 3600000),
        },
        {
          token: 'verify-token-2',
          userId: user2Id,
          email: 'user2@example.com',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 3600000),
        },
        {
          token: 'verify-token-3',
          userId: user3Id,
          email: 'user3@example.com',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 3600000),
        },
        {
          token: 'oauth-token',
          userId: oauthUserId,
          identifier: 'oauth-identifier-456',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 3600000),
        },
      ]);
    });

    test('should delete only tokens matching specific token value', async () => {
      const result = await methods.deleteTokens({ token: 'verify-token-1' });

      expect(result.deletedCount).toBe(1);

      // Verify other tokens still exist
      const remainingTokens = await Token.find({});
      expect(remainingTokens).toHaveLength(3);
      expect(remainingTokens.find((t) => t.token === 'verify-token-2')).toBeDefined();
      expect(remainingTokens.find((t) => t.token === 'verify-token-3')).toBeDefined();
      expect(remainingTokens.find((t) => t.token === 'oauth-token')).toBeDefined();
    });

    test('should delete only tokens matching specific userId', async () => {
      // Create another token for user-1
      await Token.create({
        token: 'another-user-1-token',
        userId: user1Id,
        email: 'user1@example.com',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      });

      const result = await methods.deleteTokens({ userId: user1Id.toString() });

      expect(result.deletedCount).toBe(2); // Both tokens for user-1

      const remainingTokens = await Token.find({});
      expect(remainingTokens).toHaveLength(3);
      expect(remainingTokens.every((t) => t.userId.toString() !== user1Id.toString())).toBe(true);
    });

    test('should delete only tokens matching specific email', async () => {
      const result = await methods.deleteTokens({ email: 'user2@example.com' });

      expect(result.deletedCount).toBe(1);

      const remainingTokens = await Token.find({});
      expect(remainingTokens).toHaveLength(3);
      expect(remainingTokens.find((t) => t.email === 'user2@example.com')).toBeUndefined();
    });

    test('should delete only tokens matching specific identifier', async () => {
      const result = await methods.deleteTokens({ identifier: 'oauth-identifier-456' });

      expect(result.deletedCount).toBe(1);

      const remainingTokens = await Token.find({});
      expect(remainingTokens).toHaveLength(3);
      expect(remainingTokens.find((t) => t.identifier === 'oauth-identifier-456')).toBeUndefined();
    });

    test('should not delete tokens when undefined fields are passed', async () => {
      // This is the critical test case for the bug fix
      const result = await methods.deleteTokens({
        token: 'verify-token-1',
        identifier: undefined,
        userId: undefined,
        email: undefined,
      });

      expect(result.deletedCount).toBe(1); // Only the token with 'verify-token-1'

      const remainingTokens = await Token.find({});
      expect(remainingTokens).toHaveLength(3);
    });

    test('should delete multiple tokens when they match OR conditions', async () => {
      // Create tokens that will match multiple conditions
      await Token.create({
        token: 'multi-match',
        userId: user2Id, // Will match userId condition
        email: 'different@example.com',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      });

      const result = await methods.deleteTokens({
        token: 'verify-token-1',
        userId: user2Id.toString(),
      });

      // Should delete: verify-token-1 (by token) + verify-token-2 (by userId) + multi-match (by userId)
      expect(result.deletedCount).toBe(3);

      const remainingTokens = await Token.find({});
      expect(remainingTokens).toHaveLength(2);
    });

    test('should throw error when no query parameters provided', async () => {
      await expect(methods.deleteTokens({})).rejects.toThrow(
        'At least one query parameter must be provided',
      );

      // Verify no tokens were deleted
      const tokens = await Token.find({});
      expect(tokens).toHaveLength(4);
    });

    test('should handle deletion when no tokens match', async () => {
      const result = await methods.deleteTokens({ token: 'non-existent-token' });

      expect(result.deletedCount).toBe(0);

      // Verify all tokens still exist
      const tokens = await Token.find({});
      expect(tokens).toHaveLength(4);
    });

    test('should handle email verification scenario correctly', async () => {
      // This simulates the exact scenario from the bug report
      // Multiple users register and get verification tokens
      const newUser1Id = new mongoose.Types.ObjectId();
      const newUser2Id = new mongoose.Types.ObjectId();
      const newUser3Id = new mongoose.Types.ObjectId();

      await Token.create([
        {
          token: 'email-verify-token-1',
          userId: newUser1Id,
          email: 'newuser1@example.com',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000), // 24 hours
        },
        {
          token: 'email-verify-token-2',
          userId: newUser2Id,
          email: 'newuser2@example.com',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
        },
        {
          token: 'email-verify-token-3',
          userId: newUser3Id,
          email: 'newuser3@example.com',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
        },
      ]);

      // User 2 verifies their email - only their token should be deleted
      const result = await methods.deleteTokens({ token: 'email-verify-token-2' });

      expect(result.deletedCount).toBe(1);

      // Verify other users' tokens still exist
      const remainingTokens = await Token.find({ token: { $regex: /^email-verify-token-/ } });
      expect(remainingTokens).toHaveLength(2);
      expect(remainingTokens.find((t) => t.token === 'email-verify-token-1')).toBeDefined();
      expect(remainingTokens.find((t) => t.token === 'email-verify-token-3')).toBeDefined();
      expect(remainingTokens.find((t) => t.token === 'email-verify-token-2')).toBeUndefined();
    });
  });
});
