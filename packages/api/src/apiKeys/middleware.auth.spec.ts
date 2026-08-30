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

  it('starts the user and deletion-fence reads together', async () => {
    const userId = new Types.ObjectId();
    let resolveUser!: (user: { _id: Types.ObjectId }) => void;
    const user = new Promise<{ _id: Types.ObjectId }>((resolve) => {
      resolveUser = resolve;
    });
    const findUser = jest.fn().mockReturnValue(user);
    const isPrincipalActive = jest.fn().mockResolvedValue(true);
    const middleware = createRequireApiKeyAuth({
      validateAgentApiKey: jest.fn().mockResolvedValue({
        userId,
        keyId: new Types.ObjectId(),
      }),
      findUser,
      isPrincipalActive,
    });
    const { res } = createResponse();
    const next = jest.fn() as NextFunction;

    const authentication = middleware(createRequest(), res, next);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(findUser).toHaveBeenCalledTimes(1);
    expect(isPrincipalActive).toHaveBeenCalledWith(userId.toString());
    expect(next).not.toHaveBeenCalled();

    resolveUser({ _id: userId });
    await authentication;
    expect(next).toHaveBeenCalledWith();
  });
});
