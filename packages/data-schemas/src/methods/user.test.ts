import mongoose from 'mongoose';
import { createUserMethods } from './user';
import { signPayload } from '~/crypto';
import type { IUser } from '~/types';

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
});
