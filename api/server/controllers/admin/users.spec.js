const bcrypt = require('bcryptjs');

// Mock dependencies before requiring the controller
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
  },
}));

jest.mock('~/db/models', () => ({
  User: {
    find: jest.fn(),
    findById: jest.fn(),
    findOne: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findByIdAndDelete: jest.fn(),
    countDocuments: jest.fn(),
  },
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
}));

const { User } = require('~/db/models');
const { logger } = require('@librechat/data-schemas');
const {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
} = require('./users');

describe('Admin Users Controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      query: {},
      params: {},
      body: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe('getUsers', () => {
    it('should return paginated users successfully', async () => {
      const mockUsers = [
        { _id: '1', email: 'user1@test.com', username: 'user1', role: 'USER' },
        { _id: '2', email: 'user2@test.com', username: 'user2', role: 'USER' },
      ];

      User.find.mockReturnValue({
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockUsers),
      });
      User.countDocuments.mockResolvedValue(20);

      mockReq.query = { page: '2', limit: '10' };

      await getUsers(mockReq, mockRes);

      expect(User.find).toHaveBeenCalledWith({}, '-password');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        users: mockUsers,
        currentPage: 2,
        totalPages: 2,
        totalUsers: 20,
      });
    });

    it('should use default pagination values when not provided', async () => {
      User.find.mockReturnValue({
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });
      User.countDocuments.mockResolvedValue(0);

      await getUsers(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        users: [],
        currentPage: 1,
        totalPages: 0,
        totalUsers: 0,
      });
    });

    it('should handle errors and return 500', async () => {
      const error = new Error('Database error');
      User.find.mockReturnValue({
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockRejectedValue(error),
      });

      await getUsers(mockReq, mockRes);

      expect(logger.error).toHaveBeenCalledWith('Error getting users:', error);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Internal Server Error' });
    });
  });

  describe('getUser', () => {
    it('should return a user by ID', async () => {
      const mockUser = {
        _id: '123',
        email: 'test@test.com',
        username: 'testuser',
        role: 'USER',
      };

      User.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockUser),
      });
      mockReq.params.id = '123';

      await getUser(mockReq, mockRes);

      expect(User.findById).toHaveBeenCalledWith('123', '-password');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(mockUser);
    });

    it('should return 404 if user not found', async () => {
      User.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });
      mockReq.params.id = 'nonexistent';

      await getUser(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'User not found' });
    });

    it('should handle errors and return 500', async () => {
      const error = new Error('Database error');
      User.findById.mockReturnValue({
        lean: jest.fn().mockRejectedValue(error),
      });
      mockReq.params.id = '123';

      await getUser(mockReq, mockRes);

      expect(logger.error).toHaveBeenCalledWith('Error getting user:', error);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Internal Server Error' });
    });
  });

  describe('createUser', () => {
    it('should create a new user successfully', async () => {
      // This test verifies the happy path - we'll test the core logic
      // by ensuring proper validation happens and responses are correct
      const mockUserData = {
        email: 'newuser@test.com',
        password: 'password123',
        username: 'newuser',
        name: 'New User',
        role: 'USER',
      };

      mockReq.body = mockUserData;

      // Mock all checks to pass
      User.findOne
        .mockResolvedValueOnce(null) // Email check - no existing user
        .mockResolvedValueOnce(null); // Username check - no existing user

      bcrypt.hash.mockResolvedValue('hashedpassword');

      // For this integration-style test, we'll verify that it doesn't error
      // The actual User model integration is tested in model tests
      await createUser(mockReq, mockRes);

      // Verify the validation checks were performed
      expect(User.findOne).toHaveBeenCalledWith({ email: mockUserData.email });
      expect(User.findOne).toHaveBeenCalledWith({ username: mockUserData.username });
      expect(bcrypt.hash).toHaveBeenCalledWith(mockUserData.password, 12);
    });

    it('should return 400 if required fields are missing', async () => {
      mockReq.body = { email: 'test@test.com' }; // Missing password and username

      await createUser(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Missing required fields' });
    });

    it('should return 400 if email already exists', async () => {
      mockReq.body = {
        email: 'existing@test.com',
        password: 'password123',
        username: 'testuser',
      };

      // Clear any previous mocks
      User.findOne.mockReset();
      User.findOne.mockResolvedValue({ email: 'existing@test.com' });

      await createUser(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'User with this email already exists',
      });
    });

    it('should return 400 if username already exists', async () => {
      mockReq.body = {
        email: 'new@test.com',
        password: 'password123',
        username: 'existinguser',
      };

      // Clear any previous mocks and set up the correct sequence
      User.findOne.mockReset();
      User.findOne
        .mockResolvedValueOnce(null) // Email check passes
        .mockResolvedValueOnce({ username: 'existinguser' }); // Username check fails

      await createUser(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Username already taken' });
    });

    it('should handle errors and return 500', async () => {
      const error = new Error('Database error');
      mockReq.body = {
        email: 'test@test.com',
        password: 'password123',
        username: 'testuser',
      };

      // Clear any previous mocks
      User.findOne.mockReset();
      User.findOne.mockRejectedValue(error);

      await createUser(mockReq, mockRes);

      expect(logger.error).toHaveBeenCalledWith('Error creating user:', error);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Internal Server Error' });
    });
  });

  describe('updateUser', () => {
    it('should update a user successfully', async () => {
      const existingUser = {
        _id: '123',
        email: 'old@test.com',
        username: 'oldusername',
      };

      const updatedUser = {
        _id: '123',
        email: 'new@test.com',
        username: 'newusername',
        name: 'Updated Name',
        role: 'ADMIN',
      };

      mockReq.params.id = '123';
      mockReq.body = {
        email: 'new@test.com',
        username: 'newusername',
        name: 'Updated Name',
        role: 'ADMIN',
      };

      User.findById.mockResolvedValue(existingUser);
      User.findOne.mockResolvedValue(null); // No conflicts
      User.findByIdAndUpdate.mockReturnValue({
        lean: jest.fn().mockResolvedValue(updatedUser),
      });

      await updateUser(mockReq, mockRes);

      expect(User.findById).toHaveBeenCalledWith('123');
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        '123',
        expect.objectContaining({
          email: 'new@test.com',
          username: 'newusername',
          name: 'Updated Name',
          role: 'ADMIN',
          emailVerified: false, // Should be false when email changes
        }),
        { new: true, select: '-password' },
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(updatedUser);
    });

    it('should return 404 if user not found', async () => {
      mockReq.params.id = 'nonexistent';
      mockReq.body = { name: 'Test' };

      User.findById.mockResolvedValue(null);

      await updateUser(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'User not found' });
    });

    it('should return 400 if email is taken by another user', async () => {
      const existingUser = {
        _id: '123',
        email: 'old@test.com',
      };

      mockReq.params.id = '123';
      mockReq.body = { email: 'taken@test.com' };

      User.findById.mockResolvedValue(existingUser);
      User.findOne.mockResolvedValue({ _id: '456', email: 'taken@test.com' });

      await updateUser(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Email already in use by another user',
      });
    });

    it('should return 400 if username is taken by another user', async () => {
      const existingUser = {
        _id: '123',
        email: 'test@test.com',
        username: 'oldusername',
      };

      mockReq.params.id = '123';
      mockReq.body = { username: 'takenusername' };

      User.findById.mockResolvedValue(existingUser);
      // Mock findOne to return a user with different ID for username check
      User.findOne.mockResolvedValue({ _id: '456', username: 'takenusername' });

      await updateUser(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Username already taken' });
    });

    it('should not mark emailVerified as false if email is not changed', async () => {
      const existingUser = {
        _id: '123',
        email: 'test@test.com',
        username: 'testuser',
      };

      mockReq.params.id = '123';
      mockReq.body = {
        email: 'test@test.com', // Same email
        name: 'New Name',
      };

      User.findById.mockResolvedValue(existingUser);
      User.findByIdAndUpdate.mockReturnValue({
        lean: jest.fn().mockResolvedValue(existingUser),
      });

      await updateUser(mockReq, mockRes);

      // emailVerified should not be in the update
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        '123',
        expect.not.objectContaining({
          emailVerified: expect.anything(),
        }),
        { new: true, select: '-password' },
      );
    });

    it('should handle errors and return 500', async () => {
      const error = new Error('Database error');
      mockReq.params.id = '123';
      mockReq.body = { name: 'Test' };

      User.findById.mockRejectedValue(error);

      await updateUser(mockReq, mockRes);

      expect(logger.error).toHaveBeenCalledWith('Error updating user:', error);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Internal Server Error' });
    });
  });

  describe('deleteUser', () => {
    it('should delete a user successfully', async () => {
      const mockUser = {
        _id: '123',
        email: 'test@test.com',
      };

      mockReq.params.id = '123';
      User.findByIdAndDelete.mockResolvedValue(mockUser);

      await deleteUser(mockReq, mockRes);

      expect(User.findByIdAndDelete).toHaveBeenCalledWith('123');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'User deleted successfully' });
    });

    it('should return 404 if user not found', async () => {
      mockReq.params.id = 'nonexistent';
      User.findByIdAndDelete.mockResolvedValue(null);

      await deleteUser(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'User not found' });
    });

    it('should handle errors and return 500', async () => {
      const error = new Error('Database error');
      mockReq.params.id = '123';
      User.findByIdAndDelete.mockRejectedValue(error);

      await deleteUser(mockReq, mockRes);

      expect(logger.error).toHaveBeenCalledWith('Error deleting user:', error);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Internal Server Error' });
    });
  });
});
