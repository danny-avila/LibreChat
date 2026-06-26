const express = require('express');
const request = require('supertest');

const mockVerifyEmailSubmissionLimiter = jest.fn((req, res, next) => next());
const mockVerifyEmailController = jest.fn((req, res) => res.status(204).end());

jest.mock('~/server/controllers/UserController', () => ({
  getUserController: jest.fn((req, res) => res.status(204).end()),
  deleteUserController: jest.fn((req, res) => res.status(204).end()),
  acceptTermsController: jest.fn((req, res) => res.status(204).end()),
  verifyEmailController: (...args) => mockVerifyEmailController(...args),
  getTermsStatusController: jest.fn((req, res) => res.status(204).end()),
  updateUserPluginsController: jest.fn((req, res) => res.status(204).end()),
  resendVerificationController: jest.fn((req, res) => res.status(204).end()),
}));

jest.mock('~/server/middleware', () => {
  const pass = (req, res, next) => next();
  return {
    requireJwtAuth: pass,
    canDeleteAccount: pass,
    configMiddleware: pass,
    verifyEmailLimiter: pass,
    verifyEmailSubmissionLimiter: (...args) => mockVerifyEmailSubmissionLimiter(...args),
  };
});

jest.mock('./settings', () => {
  const express = require('express');
  return express.Router();
});

const userRouter = require('./user');

describe('POST /api/user/verify rate limiting', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyEmailSubmissionLimiter.mockImplementation((req, res, next) => next());
    mockVerifyEmailController.mockImplementation((req, res) => res.status(204).end());

    app = express();
    app.use(express.json());
    app.use('/api/user', userRouter);
  });

  it('limits email verification before checking the token', async () => {
    await request(app).post('/api/user/verify').send({ token: 'token' }).expect(204);

    expect(mockVerifyEmailSubmissionLimiter).toHaveBeenCalledTimes(1);
    expect(mockVerifyEmailController).toHaveBeenCalledTimes(1);
    expect(mockVerifyEmailSubmissionLimiter.mock.invocationCallOrder[0]).toBeLessThan(
      mockVerifyEmailController.mock.invocationCallOrder[0],
    );
  });

  it('does not check the verification token after the limiter rejects the request', async () => {
    mockVerifyEmailSubmissionLimiter.mockImplementation((req, res) =>
      res.status(429).json({ message: 'Too many verification attempts' }),
    );

    const response = await request(app)
      .post('/api/user/verify')
      .send({ token: 'token' })
      .expect(429);

    expect(response.body).toEqual({ message: 'Too many verification attempts' });
    expect(mockVerifyEmailController).not.toHaveBeenCalled();
  });
});
