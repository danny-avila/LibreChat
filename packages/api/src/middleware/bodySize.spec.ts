import type { Request, Response, NextFunction } from 'express';
import { enforceJsonBodySizeLimit } from './bodySize';

function createMocks(body: unknown) {
  const req = { body } as Request;
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, status, json, next };
}

describe('enforceJsonBodySizeLimit', () => {
  it('allows bodies within the limit', () => {
    const { req, res, next } = createMocks({ title: 'Hello', message: 'World' });
    enforceJsonBodySizeLimit(102400)(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('rejects bodies exceeding the limit', () => {
    const largeBody = { title: 'x'.repeat(102400), message: 'y' };
    const { req, res, status, json, next } = createMocks(largeBody);
    enforceJsonBodySizeLimit(102400)(req, res, next);
    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith({ error: 'Request body too large' });
    expect(next).not.toHaveBeenCalled();
  });
});
