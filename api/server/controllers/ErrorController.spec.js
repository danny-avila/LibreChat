const errorController = require('./ErrorController');
const { logger } = require('~/config');

// Mock the logger
jest.mock('~/config', () => ({
  logger: {
    error: jest.fn(),
  },
}));

describe('ErrorController', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = {};
    mockRes = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };
    mockNext = jest.fn();
    logger.error.mockClear();
  });

  describe('ValidationError handling', () => {
    it('should handle ValidationError with single error', () => {
      const validationError = {
        name: 'ValidationError',
        errors: {
          email: { message: 'Email is required', path: 'email' },
        },
      };

      errorController(validationError, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith({
        messages: '["Email is required"]',
        fields: '["email"]',
      });
      expect(logger.error).toHaveBeenCalledWith('Validation error:', validationError.errors);
    });

    it('should handle ValidationError with multiple errors', () => {
      const validationError = {
        name: 'ValidationError',
        errors: {
          email: { message: 'Email is required', path: 'email' },
          password: { message: 'Password is required', path: 'password' },
        },
      };

      errorController(validationError, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith({
        messages: '"Email is required Password is required"',
        fields: '["email","password"]',
      });
      expect(logger.error).toHaveBeenCalledWith('Validation error:', validationError.errors);
    });

    it('should handle ValidationError with empty errors object', () => {
      const validationError = {
        name: 'ValidationError',
        errors: {},
      };

      errorController(validationError, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith({
        messages: '[]',
        fields: '[]',
      });
    });
  });

  describe('Duplicate key error handling', () => {
    it('should handle duplicate key error (code 11000)', () => {
      const duplicateKeyError = {
        code: 11000,
        keyValue: { email: 'test@example.com' },
      };

      errorController(duplicateKeyError, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.send).toHaveBeenCalledWith({
        messages: 'An document with that ["email"] already exists.',
        fields: '["email"]',
      });
      expect(logger.error).toHaveBeenCalledWith('Duplicate key error:', duplicateKeyError.keyValue);
    });

    it('should handle duplicate key error with multiple fields', () => {
      const duplicateKeyError = {
        code: 11000,
        keyValue: { email: 'test@example.com', username: 'testuser' },
      };

      errorController(duplicateKeyError, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.send).toHaveBeenCalledWith({
        messages: 'An document with that ["email","username"] already exists.',
        fields: '["email","username"]',
      });
      expect(logger.error).toHaveBeenCalledWith('Duplicate key error:', duplicateKeyError.keyValue);
    });

    it('should handle error with code 11000 as string', () => {
      const duplicateKeyError = {
        code: '11000',
        keyValue: { email: 'test@example.com' },
      };

      errorController(duplicateKeyError, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.send).toHaveBeenCalledWith({
        messages: 'An document with that ["email"] already exists.',
        fields: '["email"]',
      });
    });
  });

  describe('SyntaxError handling', () => {
    it('should handle errors with statusCode and body', () => {
      const syntaxError = {
        statusCode: 400,
        body: 'Invalid JSON syntax',
      };

      errorController(syntaxError, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith('Invalid JSON syntax');
    });

    it('should handle errors with different statusCode and body', () => {
      const customError = {
        statusCode: 422,
        body: { error: 'Unprocessable entity' },
      };

      errorController(customError, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(422);
      expect(mockRes.send).toHaveBeenCalledWith({ error: 'Unprocessable entity' });
    });

    it('should handle error with statusCode but no body', () => {
      const partialError = {
        statusCode: 400,
      };

      errorController(partialError, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.send).toHaveBeenCalledWith('An unknown error occurred.');
    });

    it('should handle error with body but no statusCode', () => {
      const partialError = {
        body: 'Some error message',
      };

      errorController(partialError, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.send).toHaveBeenCalledWith('An unknown error occurred.');
    });
  });

  describe('Unknown error handling', () => {
    it('should handle unknown errors', () => {
      const unknownError = new Error('Some unknown error');

      errorController(unknownError, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.send).toHaveBeenCalledWith('An unknown error occurred.');
      expect(logger.error).toHaveBeenCalledWith('ErrorController => error', unknownError);
    });

    it('should handle errors with code other than 11000', () => {
      const mongoError = {
        code: 11100,
        message: 'Some MongoDB error',
      };

      errorController(mongoError, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.send).toHaveBeenCalledWith('An unknown error occurred.');
      expect(logger.error).toHaveBeenCalledWith('ErrorController => error', mongoError);
    });

    it('should handle null/undefined errors', () => {
      errorController(null, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.send).toHaveBeenCalledWith('Processing error in ErrorController.');
      expect(logger.error).toHaveBeenCalledWith(
        'ErrorController => processing error',
        expect.any(Error),
      );
    });
  });

  describe('Catch block handling', () => {
    beforeEach(() => {
      // Restore logger mock to normal behavior for these tests
      logger.error.mockRestore();
      logger.error = jest.fn();
    });

    it('should handle errors when logger.error throws', () => {
      // Create fresh mocks for this test
      const freshMockRes = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      // Mock logger to throw on the first call, succeed on the second
      logger.error
        .mockImplementationOnce(() => {
          throw new Error('Logger error');
        })
        .mockImplementation(() => {});

      const testError = new Error('Test error');

      errorController(testError, mockReq, freshMockRes, mockNext);

      expect(freshMockRes.status).toHaveBeenCalledWith(500);
      expect(freshMockRes.send).toHaveBeenCalledWith('Processing error in ErrorController.');
      expect(logger.error).toHaveBeenCalledTimes(2);
    });
  });
});
