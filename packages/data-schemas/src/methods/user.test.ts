import mongoose from 'mongoose';
import { createUserMethods } from './user';
import { signPayload } from '~/crypto';
import type { IUser, BalanceConfig } from '~/types';

jest.mock('~/crypto', () => ({
  signPayload: jest.fn(),
}));

describe('User Methods', () => {
  const mockSignPayload = signPayload as jest.MockedFunction<typeof signPayload>;
  let userMethods: ReturnType<typeof createUserMethods>;

  beforeEach(() => {
    jest.clearAllMocks();
    userMethods = createUserMethods(mongoose);
  });

  describe('generateToken', () => {
    const mockUser = {
      _id: 'user123',
      username: 'testuser',
      provider: 'local',
      email: 'test@example.com',
      name: 'Test User',
      avatar: '',
      role: 'user',
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as IUser;

    afterEach(() => {
      delete process.env.SESSION_EXPIRY;
      delete process.env.JWT_SECRET;
    });

    it('should default to 15 minutes when SESSION_EXPIRY is not set', async () => {
      process.env.JWT_SECRET = 'test-secret';
      mockSignPayload.mockResolvedValue('mocked-token');

      await userMethods.generateToken(mockUser);

      expect(mockSignPayload).toHaveBeenCalledWith({
        payload: {
          id: mockUser._id,
          username: mockUser.username,
          provider: mockUser.provider,
          email: mockUser.email,
        },
        secret: 'test-secret',
        expirationTime: 900, // 15 minutes in seconds
      });
    });

    it('should default to 15 minutes when SESSION_EXPIRY is empty string', async () => {
      process.env.SESSION_EXPIRY = '';
      process.env.JWT_SECRET = 'test-secret';
      mockSignPayload.mockResolvedValue('mocked-token');

      await userMethods.generateToken(mockUser);

      expect(mockSignPayload).toHaveBeenCalledWith({
        payload: {
          id: mockUser._id,
          username: mockUser.username,
          provider: mockUser.provider,
          email: mockUser.email,
        },
        secret: 'test-secret',
        expirationTime: 900, // 15 minutes in seconds
      });
    });

    it('should use custom expiry when SESSION_EXPIRY is set to a valid expression', async () => {
      process.env.SESSION_EXPIRY = '1000 * 60 * 30'; // 30 minutes
      process.env.JWT_SECRET = 'test-secret';
      mockSignPayload.mockResolvedValue('mocked-token');

      await userMethods.generateToken(mockUser);

      expect(mockSignPayload).toHaveBeenCalledWith({
        payload: {
          id: mockUser._id,
          username: mockUser.username,
          provider: mockUser.provider,
          email: mockUser.email,
        },
        secret: 'test-secret',
        expirationTime: 1800, // 30 minutes in seconds
      });
    });

    it('should default to 15 minutes when SESSION_EXPIRY evaluates to falsy value', async () => {
      process.env.SESSION_EXPIRY = '0'; // This will evaluate to 0, which is falsy
      process.env.JWT_SECRET = 'test-secret';
      mockSignPayload.mockResolvedValue('mocked-token');

      await userMethods.generateToken(mockUser);

      expect(mockSignPayload).toHaveBeenCalledWith({
        payload: {
          id: mockUser._id,
          username: mockUser.username,
          provider: mockUser.provider,
          email: mockUser.email,
        },
        secret: 'test-secret',
        expirationTime: 900, // 15 minutes in seconds
      });
    });

    it('should throw error when no user is provided', async () => {
      process.env.JWT_SECRET = 'test-secret';

      await expect(userMethods.generateToken(null as unknown as IUser)).rejects.toThrow(
        'No user provided',
      );
    });

    it('should return the token from signPayload', async () => {
      process.env.SESSION_EXPIRY = '1000 * 60 * 60'; // 1 hour
      process.env.JWT_SECRET = 'test-secret';
      const expectedToken = 'generated-jwt-token';
      mockSignPayload.mockResolvedValue(expectedToken);

      const token = await userMethods.generateToken(mockUser);

      expect(token).toBe(expectedToken);
    });

    it('should handle invalid SESSION_EXPIRY expressions gracefully', async () => {
      process.env.SESSION_EXPIRY = 'invalid expression';
      process.env.JWT_SECRET = 'test-secret';
      mockSignPayload.mockResolvedValue('mocked-token');

      // Mock console.warn to verify it's called
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await userMethods.generateToken(mockUser);

      // Should use default value when eval fails
      expect(mockSignPayload).toHaveBeenCalledWith({
        payload: {
          id: mockUser._id,
          username: mockUser.username,
          provider: mockUser.provider,
          email: mockUser.email,
        },
        secret: 'test-secret',
        expirationTime: 900, // 15 minutes in seconds (default)
      });

      // Verify warning was logged
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Invalid SESSION_EXPIRY expression, using default:',
        expect.any(SyntaxError),
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('createUser', () => {
    it('should create a user with balance if balanceConfig is provided', async () => {
      const mockUser = {
        _id: 'user123',
        username: 'testuser',
        email: 'test@example.com',
      };

      const mockBalance = {
        user: 'user123',
        tokenCredits: 1000,
      };

      const UserMock = {
        create: jest.fn().mockResolvedValue(mockUser),
      };

      const BalanceMock = {
        findOneAndUpdate: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockBalance),
        }),
      };

      mongoose.models.User = UserMock as unknown as typeof mongoose.models.User;
      mongoose.models.Balance = BalanceMock as unknown as typeof mongoose.models.Balance;

      const balanceConfig = {
        enabled: true,
        startBalance: 1000,
        autoRefillEnabled: true,
        refillIntervalValue: 30,
        refillIntervalUnit: 'days',
        refillAmount: 1000,
      };

      await userMethods.createUser(
        {
          email: 'test@example.com',
          password: 'password',
          name: 'Test User',
          username: 'testuser',
        },
        balanceConfig,
      );

      expect(UserMock.create).toHaveBeenCalled();
      expect(BalanceMock.findOneAndUpdate).toHaveBeenCalledWith(
        { user: mockUser._id },
        {
          $inc: { tokenCredits: 1000 },
          $set: {
            autoRefillEnabled: true,
            refillIntervalValue: 30,
            refillIntervalUnit: 'days',
            refillAmount: 1000,
          },
        },
        { upsert: true, new: true },
      );
    });
  });

  describe('updateUserTier', () => {
    const userId = 'user123';
    const mockUpdatedUser = {
      _id: userId,
      username: 'testuser',
      email: 'test@example.com',
      role: 'BASIC',
    };

    let UserMock: {
      findByIdAndUpdate: jest.Mock;
    };
    let BalanceMock: {
      findOneAndUpdate: jest.Mock;
    };

    beforeEach(() => {
      UserMock = {
        findByIdAndUpdate: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockUpdatedUser),
        }),
      };

      BalanceMock = {
        findOneAndUpdate: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({}),
        }),
      };

      mongoose.models.User = UserMock;
      mongoose.models.Balance = BalanceMock;
    });

    it('should upgrade user from USER to BASIC tier with correct balance config', async () => {
      const balanceConfig = {
        enabled: true,
        startBalance: 2000000,
        autoRefillEnabled: true,
        refillIntervalValue: 30,
        refillIntervalUnit: 'days',
        refillAmount: 2000000,
      };

      await userMethods.updateUserTier(userId, 'BASIC', balanceConfig);

      expect(UserMock.findByIdAndUpdate).toHaveBeenCalledWith(
        userId,
        { $set: { role: 'BASIC' } },
        { new: true, runValidators: true },
      );

      expect(BalanceMock.findOneAndUpdate).toHaveBeenCalledWith(
        { user: userId },
        {
          $set: {
            autoRefillEnabled: true,
            refillIntervalValue: 30,
            refillIntervalUnit: 'days',
            refillAmount: 2000000,
          },
        },
        { upsert: true, new: true },
      );
    });

    it('should upgrade user from BASIC to PRO tier with correct balance config', async () => {
      const balanceConfig = {
        enabled: true,
        startBalance: 20000000,
        autoRefillEnabled: true,
        refillIntervalValue: 30,
        refillIntervalUnit: 'days',
        refillAmount: 20000000,
      };

      await userMethods.updateUserTier(userId, 'PRO', balanceConfig);

      expect(UserMock.findByIdAndUpdate).toHaveBeenCalledWith(
        userId,
        { $set: { role: 'PRO' } },
        { new: true, runValidators: true },
      );

      expect(BalanceMock.findOneAndUpdate).toHaveBeenCalledWith(
        { user: userId },
        {
          $set: {
            autoRefillEnabled: true,
            refillIntervalValue: 30,
            refillIntervalUnit: 'days',
            refillAmount: 20000000,
          },
        },
        { upsert: true, new: true },
      );
    });

    it('should downgrade user from PRO to BASIC tier with correct balance config', async () => {
      const balanceConfig = {
        enabled: true,
        startBalance: 2000000,
        autoRefillEnabled: true,
        refillIntervalValue: 30,
        refillIntervalUnit: 'days',
        refillAmount: 2000000,
      };

      await userMethods.updateUserTier(userId, 'BASIC', balanceConfig);

      expect(UserMock.findByIdAndUpdate).toHaveBeenCalledWith(
        userId,
        { $set: { role: 'BASIC' } },
        { new: true, runValidators: true },
      );

      expect(BalanceMock.findOneAndUpdate).toHaveBeenCalledWith(
        { user: userId },
        {
          $set: {
            autoRefillEnabled: true,
            refillIntervalValue: 30,
            refillIntervalUnit: 'days',
            refillAmount: 2000000,
          },
        },
        { upsert: true, new: true },
      );
    });

    it('should downgrade user from BASIC to USER tier with correct balance config', async () => {
      const balanceConfig = {
        enabled: true,
        startBalance: 100000,
        autoRefillEnabled: true,
        refillIntervalValue: 30,
        refillIntervalUnit: 'days',
        refillAmount: 100000,
      };

      await userMethods.updateUserTier(userId, 'USER', balanceConfig);

      expect(UserMock.findByIdAndUpdate).toHaveBeenCalledWith(
        userId,
        { $set: { role: 'USER' } },
        { new: true, runValidators: true },
      );

      expect(BalanceMock.findOneAndUpdate).toHaveBeenCalledWith(
        { user: userId },
        {
          $set: {
            autoRefillEnabled: true,
            refillIntervalValue: 30,
            refillIntervalUnit: 'days',
            refillAmount: 100000,
          },
        },
        { upsert: true, new: true },
      );
    });

    it('should upgrade user from USER directly to PRO tier (skipping BASIC)', async () => {
      const balanceConfig = {
        enabled: true,
        startBalance: 20000000,
        autoRefillEnabled: true,
        refillIntervalValue: 30,
        refillIntervalUnit: 'days',
        refillAmount: 20000000,
      };

      await userMethods.updateUserTier(userId, 'PRO', balanceConfig);

      expect(UserMock.findByIdAndUpdate).toHaveBeenCalledWith(
        userId,
        { $set: { role: 'PRO' } },
        { new: true, runValidators: true },
      );

      expect(BalanceMock.findOneAndUpdate).toHaveBeenCalledWith(
        { user: userId },
        {
          $set: {
            autoRefillEnabled: true,
            refillIntervalValue: 30,
            refillIntervalUnit: 'days',
            refillAmount: 20000000,
          },
        },
        { upsert: true, new: true },
      );
    });

    it('should downgrade user from PRO directly to USER tier (skipping BASIC)', async () => {
      const balanceConfig = {
        enabled: true,
        startBalance: 100000,
        autoRefillEnabled: true,
        refillIntervalValue: 30,
        refillIntervalUnit: 'days',
        refillAmount: 100000,
      };

      await userMethods.updateUserTier(userId, 'USER', balanceConfig);

      expect(UserMock.findByIdAndUpdate).toHaveBeenCalledWith(
        userId,
        { $set: { role: 'USER' } },
        { new: true, runValidators: true },
      );

      expect(BalanceMock.findOneAndUpdate).toHaveBeenCalledWith(
        { user: userId },
        {
          $set: {
            autoRefillEnabled: true,
            refillIntervalValue: 30,
            refillIntervalUnit: 'days',
            refillAmount: 100000,
          },
        },
        { upsert: true, new: true },
      );
    });

    it('should upgrade to ADMIN tier with correct balance config', async () => {
      const balanceConfig = {
        enabled: true,
        startBalance: 100000000,
        autoRefillEnabled: false,
        refillIntervalValue: 30,
        refillIntervalUnit: 'days',
        refillAmount: 100000000,
      };

      await userMethods.updateUserTier(userId, 'ADMIN', balanceConfig);

      expect(UserMock.findByIdAndUpdate).toHaveBeenCalledWith(
        userId,
        { $set: { role: 'ADMIN' } },
        { new: true, runValidators: true },
      );

      expect(BalanceMock.findOneAndUpdate).toHaveBeenCalledWith(
        { user: userId },
        {
          $set: {
            autoRefillEnabled: false,
            refillIntervalValue: 30,
            refillIntervalUnit: 'days',
            refillAmount: 100000000,
          },
        },
        { upsert: true, new: true },
      );
    });

    it('should return null if user is not found', async () => {
      UserMock.findByIdAndUpdate = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      const balanceConfig = {
        enabled: true,
        startBalance: 2000000,
        autoRefillEnabled: true,
        refillIntervalValue: 30,
        refillIntervalUnit: 'days',
        refillAmount: 2000000,
      };

      const result = await userMethods.updateUserTier(userId, 'BASIC', balanceConfig);

      expect(result).toBeNull();
      expect(BalanceMock.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('should not update balance if balanceConfig.enabled is false', async () => {
      const balanceConfig = {
        enabled: false,
        startBalance: 2000000,
        autoRefillEnabled: true,
        refillIntervalValue: 30,
        refillIntervalUnit: 'days',
        refillAmount: 2000000,
      };

      await userMethods.updateUserTier(userId, 'BASIC', balanceConfig);

      expect(UserMock.findByIdAndUpdate).toHaveBeenCalled();
      expect(BalanceMock.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('should handle missing balance config properties with defaults', async () => {
      const balanceConfig = {
        enabled: true,
        startBalance: 2000000,
        // Missing autoRefillEnabled, refillIntervalValue, etc.
      } as Partial<BalanceConfig> & { enabled: true; startBalance: number };

      await userMethods.updateUserTier(userId, 'BASIC', balanceConfig);

      expect(BalanceMock.findOneAndUpdate).toHaveBeenCalledWith(
        { user: userId },
        {
          $set: {
            autoRefillEnabled: false, // Default
            refillIntervalValue: 30, // Default
            refillIntervalUnit: 'days', // Default
            refillAmount: 0, // Default
          },
        },
        { upsert: true, new: true },
      );
    });
  });
});
