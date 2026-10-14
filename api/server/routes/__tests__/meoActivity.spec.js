const express = require('express');
const request = require('supertest');

const mockGet = jest.fn();

jest.mock('axios', () => ({ get: (...args) => mockGet(...args) }));
jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, _res, next) => {
    req.session = { openidTokens: { accessToken: 'meo-account-token' } };
    next();
  },
}));

const router = require('../meoActivity');

describe('Meo usage activity route', () => {
  const previousApiUrl = process.env.MEO_API_URL;

  beforeEach(() => {
    process.env.MEO_API_URL = 'https://api.example.test/';
    mockGet.mockReset();
    mockGet.mockResolvedValue({ data: { summary: { lifetime_tokens: 12 } } });
  });

  afterAll(() => {
    if (previousApiUrl === undefined) delete process.env.MEO_API_URL;
    else process.env.MEO_API_URL = previousApiUrl;
  });

  it('forwards the server-held Meo Account token to Meo API', async () => {
    const app = express();
    app.use('/activity', router);

    await expect(request(app).get('/activity?days=30')).resolves.toMatchObject({
      status: 200,
      body: { summary: { lifetime_tokens: 12 } },
    });
    expect(mockGet).toHaveBeenCalledWith(
      'https://api.example.test/v1/usage-dashboard',
      expect.objectContaining({
        params: { days: 30 },
        headers: expect.objectContaining({ Authorization: 'Bearer meo-account-token' }),
      }),
    );
    expect(JSON.stringify(mockGet.mock.calls)).not.toContain('apikey');
  });
});
