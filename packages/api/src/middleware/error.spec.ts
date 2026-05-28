import { logger } from '@librechat/data-schemas';
import { ErrorController } from './error';
import type { Request, Response } from 'express';
import type { ValidationError, MongoServerError, CustomError } from '~/types';
import { OAuthErrorCodes } from '~/auth/errors';

// Mock the logger
jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('ErrorController', () => {
  let mockReq: Request;
  let mockRes: Response;
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockReq = {
      originalUrl: '',
    } as Request;
    mockRes = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      redirect: jest.fn(),
    } as unknown as Response;
    (logger.error as jest.Mock).mockClear();
    mockNext = jest.fn();
  });

  describe('ValidationError handling', () => {
    it('should handle ValidationError with single error', () => {
      const validationError = {
        name: 'ValidationError',
        message: 'Validation error',
        errors: {
          email: { message: 'Email is required', path: 'email' },
        },
      } as ValidationError;

      ErrorController(validationError, mockReq, mockRes, mockNext);

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
        message: 'Validation error',
        errors: {
          email: { message: 'Email is required', path: 'email' },
          password: { message: 'Password is required', path: 'password' },
        },
      } as ValidationError;

      ErrorController(validationError, mockReq, mockRes, mockNext);

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
      } as ValidationError;

      ErrorController(validationError, mockReq, mockRes, mockNext);

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
        name: 'MongoServerError',
        message: 'Duplicate key error',
        code: 11000,
        keyValue: { email: 'test@example.com' },
        errmsg:
          'E11000 duplicate key error collection: test.users index: email_1 dup key: { email: "test@example.com" }',
      } as MongoServerError;

      ErrorController(duplicateKeyError, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.send).toHaveBeenCalledWith({
        messages: 'An document with that ["email"] already exists.',
        fields: '["email"]',
      });
      expect(logger.warn).toHaveBeenCalledWith(
        'Duplicate key error: E11000 duplicate key error collection: test.users index: email_1 dup key: { email: "test@example.com" }',
      );
    });

    it('should handle duplicate key error with multiple fields', () => {
      const duplicateKeyError = {
        name: 'MongoServerError',
        message: 'Duplicate key error',
        code: 11000,
        keyValue: { email: 'test@example.com', username: 'testuser' },
        errmsg:
          'E11000 duplicate key error collection: test.users index: email_1 dup key: { email: "test@example.com" }',
      } as MongoServerError;

      ErrorController(duplicateKeyError, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.send).toHaveBeenCalledWith({
        messages: 'An document with that ["email","username"] already exists.',
        fields: '["email","username"]',
      });
      expect(logger.warn).toHaveBeenCalledWith(
        'Duplicate key error: E11000 duplicate key error collection: test.users index: email_1 dup key: { email: "test@example.com" }',
      );
    });

    it('should handle error with code 11000 as string', () => {
      const duplicateKeyError = {
        name: 'MongoServerError',
        message: 'Duplicate key error',
        code: 11000,
        keyValue: { email: 'test@example.com' },
        errmsg:
          'E11000 duplicate key error collection: test.users index: email_1 dup key: { email: "test@example.com" }',
      } as MongoServerError;

      ErrorController(duplicateKeyError, mockReq, mockRes, mockNext);

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
      } as CustomError;

      ErrorController(syntaxError, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith('Invalid JSON syntax');
    });

    it('should handle errors with different statusCode and body', () => {
      const customError = {
        statusCode: 422,
        body: { error: 'Unprocessable entity' },
      } as CustomError;

      ErrorController(customError, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(422);
      expect(mockRes.send).toHaveBeenCalledWith({ error: 'Unprocessable entity' });
    });

    it('should handle error with statusCode but no body', () => {
      const partialError = {
        statusCode: 400,
      } as CustomError;

      ErrorController(partialError, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.send).toHaveBeenCalledWith('An unknown error occurred.');
    });

    it('should handle error with body but no statusCode', () => {
      const partialError = {
        body: 'Some error message',
      } as CustomError;

      ErrorController(partialError, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.send).toHaveBeenCalledWith('An unknown error occurred.');
    });
  });

  describe('Unknown error handling', () => {
    it('should handle unknown errors', () => {
      const unknownError = new Error('Some unknown error');

      ErrorController(unknownError, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.send).toHaveBeenCalledWith('An unknown error occurred.');
      expect(logger.error).toHaveBeenCalledWith('ErrorController => error', unknownError);
    });

    it('should handle errors with code other than 11000', () => {
      const mongoError = {
        code: 11100,
        message: 'Some MongoDB error',
      } as MongoServerError;

      ErrorController(mongoError, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.send).toHaveBeenCalledWith('An unknown error occurred.');
      expect(logger.error).toHaveBeenCalledWith('ErrorController => error', mongoError);
    });

    it('should handle generic errors', () => {
      const genericError = new Error('Test error');

      ErrorController(genericError, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.send).toHaveBeenCalledWith('An unknown error occurred.');
      expect(logger.error).toHaveBeenCalledWith('ErrorController => error', genericError);
    });
  });

  describe('OAuth callback error handling', () => {
    const originalDomainClient = process.env.DOMAIN_CLIENT;

    beforeEach(() => {
      process.env.DOMAIN_CLIENT = 'https://client.example.com';
      mockReq.originalUrl = '/oauth/google/callback';
    });

    afterEach(() => {
      if (originalDomainClient == null) {
        delete process.env.DOMAIN_CLIENT;
        return;
      }
      process.env.DOMAIN_CLIENT = originalDomainClient;
    });

    it.each([
      [
        'code',
        () =>
          Object.assign(new Error('provider mismatch'), {
            code: OAuthErrorCodes.OAUTH_ACCOUNT_MISMATCH,
          }),
        OAuthErrorCodes.OAUTH_ACCOUNT_MISMATCH,
      ],
      [
        'message',
        () => new Error(OAuthErrorCodes.OPENID_ISSUER_MISMATCH),
        OAuthErrorCodes.OPENID_ISSUER_MISMATCH,
      ],
    ])(
      'redirects known OAuth callback failures by %s with redirect disabled',
      (_source, buildError, expectedCode) => {
        const error = buildError() as CustomError;

        ErrorController(error, mockReq, mockRes, mockNext);

        expect(mockRes.redirect).toHaveBeenCalledWith(
          'https://client.example.com/login?redirect=false&error=auth_failed',
        );
        expect(logger.error).toHaveBeenCalledWith('OAuth callback authentication failed', {
          errorCode: expectedCode,
          clientErrorCode: 'auth_failed',
        });
        expect(mockRes.status).not.toHaveBeenCalled();
      },
    );

    it('does not redirect auth failures outside OAuth callbacks', () => {
      mockReq.originalUrl = '/api/auth/login';
      const error = new Error('auth_failed');

      ErrorController(error, mockReq, mockRes, mockNext);

      expect(mockRes.redirect).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('Catch block handling', () => {
    beforeEach(() => {
      // Restore logger mock to normal behavior for these tests
      (logger.error as jest.Mock).mockRestore();
      (logger.error as jest.Mock) = jest.fn();
    });

    it('should handle errors when logger.error throws', () => {
      // Create fresh mocks for this test
      const freshMockRes = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      } as unknown as Response;

      // Mock logger to throw on the first call, succeed on the second
      (logger.error as jest.Mock)
        .mockImplementationOnce(() => {
          throw new Error('Logger error');
        })
        .mockImplementation(() => {});

      const testError = new Error('Test error');

      ErrorController(testError, mockReq, freshMockRes, mockNext);

      expect(freshMockRes.status).toHaveBeenCalledWith(500);
      expect(freshMockRes.send).toHaveBeenCalledWith('Processing error in ErrorController.');
      expect(logger.error).toHaveBeenCalledTimes(2);
    });
  });
});
