import { handleJsonParseError } from './json';
import type { Request, Response, NextFunction } from 'express';

describe('handleJsonParseError', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  let jsonSpy: jest.Mock;
  let statusSpy: jest.Mock;

  beforeEach(() => {
    req = {
      path: '/api/test',
      method: 'POST',
      ip: '127.0.0.1',
    };

    jsonSpy = jest.fn();
    statusSpy = jest.fn().mockReturnValue({ json: jsonSpy });

    res = {
      status: statusSpy,
      json: jsonSpy,
    };

    next = jest.fn();
  });

  describe('JSON parse errors', () => {
    it('should handle JSON SyntaxError with 400 status', () => {
      const err = new SyntaxError('Unexpected token < in JSON at position 0') as SyntaxError & {
        status?: number;
        body?: unknown;
      };
      err.status = 400;
      err.body = {};

      handleJsonParseError(err, req as Request, res as Response, next);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: 'Invalid JSON format',
        message: 'The request body contains malformed JSON',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should not reflect user input in error message', () => {
      const maliciousInput = '<script>alert("xss")</script>';
      const err = new SyntaxError(
        `Unexpected token < in JSON at position 0: ${maliciousInput}`,
      ) as SyntaxError & {
        status?: number;
        body?: unknown;
      };
      err.status = 400;
      err.body = maliciousInput;

      handleJsonParseError(err, req as Request, res as Response, next);

      expect(statusSpy).toHaveBeenCalledWith(400);
      const errorResponse = jsonSpy.mock.calls[0][0];
      expect(errorResponse.message).not.toContain(maliciousInput);
      expect(errorResponse.message).toBe('The request body contains malformed JSON');
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle JSON parse error with HTML tags in body', () => {
      const err = new SyntaxError('Invalid JSON') as SyntaxError & {
        status?: number;
        body?: unknown;
      };
      err.status = 400;
      err.body = '<html><body><h1>XSS</h1></body></html>';

      handleJsonParseError(err, req as Request, res as Response, next);

      expect(statusSpy).toHaveBeenCalledWith(400);
      const errorResponse = jsonSpy.mock.calls[0][0];
      expect(errorResponse.message).not.toContain('<html>');
      expect(errorResponse.message).not.toContain('<script>');
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('non-JSON errors', () => {
    it('should pass through non-SyntaxError errors', () => {
      const err = new Error('Some other error');

      handleJsonParseError(err, req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(err);
      expect(statusSpy).not.toHaveBeenCalled();
      expect(jsonSpy).not.toHaveBeenCalled();
    });

    it('should pass through SyntaxError without status 400', () => {
      const err = new SyntaxError('Some syntax error') as SyntaxError & { status?: number };
      err.status = 500;

      handleJsonParseError(err, req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(err);
      expect(statusSpy).not.toHaveBeenCalled();
    });

    it('should pass through SyntaxError without body property', () => {
      const err = new SyntaxError('Some syntax error') as SyntaxError & { status?: number };
      err.status = 400;

      handleJsonParseError(err, req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(err);
      expect(statusSpy).not.toHaveBeenCalled();
    });

    it('should pass through TypeError', () => {
      const err = new TypeError('Type error');

      handleJsonParseError(err, req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(err);
      expect(statusSpy).not.toHaveBeenCalled();
    });
  });

  describe('security verification', () => {
    it('should return generic error message for all JSON parse errors', () => {
      const testCases = [
        'Unexpected token < in JSON',
        'Unexpected end of JSON input',
        'Invalid or unexpected token',
        '<script>alert(1)</script>',
        '"><img src=x onerror=alert(1)>',
      ];

      testCases.forEach((errorMsg) => {
        const err = new SyntaxError(errorMsg) as SyntaxError & {
          status?: number;
          body?: unknown;
        };
        err.status = 400;
        err.body = errorMsg;

        jsonSpy.mockClear();
        statusSpy.mockClear();
        (next as jest.Mock).mockClear();

        handleJsonParseError(err, req as Request, res as Response, next);

        const errorResponse = jsonSpy.mock.calls[0][0];
        // Verify the generic message is always returned, not the user input
        expect(errorResponse.message).toBe('The request body contains malformed JSON');
        expect(errorResponse.error).toBe('Invalid JSON format');
      });
    });
  });
});
