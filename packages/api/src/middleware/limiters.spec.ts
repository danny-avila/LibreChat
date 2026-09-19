import express from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { createMessageLimiters } from './limiters';

describe('shared message admission', () => {
  it('shares one user bucket across chat and JSON surfaces while preserving their error presentation', async () => {
    const denyRequest = jest.fn(async (_req: Request, res: Response) => {
      res.status(429).json({ chat: true });
    });
    const logViolation = jest.fn(async () => undefined);
    const { messageUserLimiter } = createMessageLimiters({
      factory: rateLimit,
      createStore: () => undefined,
      environment: { MESSAGE_USER_MAX: '1', MESSAGE_USER_WINDOW: '1' },
      logViolation,
      denyRequest,
    });
    const app = express();
    app.use((req, _res, next) => {
      req.user = { id: 'owner' } as Express.User;
      next();
    });
    app.post('/chat', messageUserLimiter, (_req, res) => {
      res.sendStatus(200);
    });
    app.post(
      '/json',
      (_req, res, next) => {
        res.locals.rateLimitError = () =>
          res.status(429).json({ error: { code: 'quota_exceeded' } });
        next();
      },
      messageUserLimiter,
      (_req, res) => {
        res.sendStatus(200);
      },
    );
    await request(app).post('/chat').expect(200);
    expect((await request(app).post('/json').expect(429)).body).toEqual({
      error: { code: 'quota_exceeded' },
    });
    expect(denyRequest).not.toHaveBeenCalled();
    expect(logViolation).toHaveBeenCalledTimes(1);
    expect((await request(app).post('/chat').expect(429)).body).toEqual({ chat: true });
    expect(denyRequest).toHaveBeenCalledTimes(1);
  });
});
