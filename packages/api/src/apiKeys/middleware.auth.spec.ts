import { Types } from 'mongoose';
import type { NextFunction, Response } from 'express';
import type { ApiKeyAuthRequest } from './middleware';
import { createRequireApiKeyAuth } from './middleware';

function createResponse(): {
  res: Response;
  status: jest.Mock;
  json: jest.Mock;
} {
  const status = jest.fn();
  const json = jest.fn();
  const res = { status, json } as unknown as Response;
  status.mockReturnValue(res);
  return { res, status, json };
}

function createRequest(): ApiKeyAuthRequest {
  return {
    headers: { authorization: 'Bearer lc-key' },
  } as ApiKeyAuthRequest;
}

describe('remote Agent API key authentication', () => {
  it('rejects a valid key while account deletion is fenced', async () => {
    const userId = new Types.ObjectId();
    const middleware = createRequireApiKeyAuth({
      validateAgentApiKey: jest.fn().mockResolvedValue({
        userId,
        keyId: new Types.ObjectId(),
      }),
      findUser: jest.fn().mockResolvedValue({ _id: userId }),
      isPrincipalActive: jest.fn().mockResolvedValue(false),
    });
    const { res, status, json } = createResponse();
    const next = jest.fn() as NextFunction;

    await middleware(createRequest(), res, next);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      error: {
        message: 'Account deletion is in progress',
        type: 'invalid_request_error',
        code: 'account_deletion_in_progress',
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('admits an active principal', async () => {
    const userId = new Types.ObjectId();
    const middleware = createRequireApiKeyAuth({
      validateAgentApiKey: jest.fn().mockResolvedValue({
        userId,
        keyId: new Types.ObjectId(),
      }),
      findUser: jest.fn().mockResolvedValue({ _id: userId }),
      isPrincipalActive: jest.fn().mockResolvedValue(true),
    });
    const req = createRequest();
    const { res } = createResponse();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(req.user?.id).toBe(userId.toString());
    expect(next).toHaveBeenCalledWith();
  });
});
