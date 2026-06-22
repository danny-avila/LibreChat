const express = require('express');
const request = require('supertest');

// axios is the only outbound dependency we cannot control in a unit test, so it
// is the one thing we mock — every call is captured so we can assert exactly
// which headers bklProxy injects on the request to ai-api.
jest.mock('axios');

const okResponse = {
  status: 200,
  headers: { 'content-type': 'application/json' },
  data: Buffer.from(JSON.stringify({ ok: true })),
};

const loadProxy = ({ token, user } = {}) => {
  jest.resetModules();
  if (token === undefined) {
    delete process.env.IRE_API_TOKEN;
  } else {
    process.env.IRE_API_TOKEN = token;
  }

  // Re-require axios after resetModules so the instance we configure is the same
  // one the freshly-loaded proxy module receives.
  const axios = require('axios');
  axios.mockReset();
  axios.mockResolvedValue(okResponse);

  const app = express();
  app.use(express.json());
  if (user) {
    app.use((req, _res, next) => {
      req.user = user;
      next();
    });
  }
  app.use('/bkl', require('../bklProxy'));
  return { app, axios };
};

describe('bklProxy header injection', () => {
  it('injects the ai-api service token as a Bearer header', async () => {
    const { app, axios } = loadProxy({ token: 'test-service-token' });

    await request(app).post('/bkl/api/search/keyword').send({ q: 'foo' }).expect(200);

    expect(axios).toHaveBeenCalledTimes(1);
    const { headers, url } = axios.mock.calls[0][0];
    expect(headers['Authorization']).toBe('Bearer test-service-token');
    expect(url).toBe('http://bkl-api:8000/api/search/keyword');
  });

  it('forwards BKL user identity headers from req.user alongside the token', async () => {
    const { app, axios } = loadProxy({
      token: 'test-service-token',
      user: {
        bkl_sid: 103455,
        bkl_user_id: 'JHSON',
        bkl_user_nm: '손정현',
        role: 'USER',
        email: 'jhson@bkl.co.kr',
      },
    });

    await request(app).post('/bkl/api/search/keyword').send({ q: 'foo' }).expect(200);

    const { headers } = axios.mock.calls[0][0];
    expect(headers['Authorization']).toBe('Bearer test-service-token');
    expect(headers['X-BKL-User-Sid']).toBe('103455');
    expect(headers['X-BKL-User-Id']).toBe('JHSON');
    expect(headers['X-BKL-User-Nm']).toBe(encodeURIComponent('손정현'));
    expect(headers['X-LC-User-Role']).toBe('USER');
    expect(headers['X-LC-User-Email']).toBe('jhson@bkl.co.kr');
  });

  it('does not leak the service token back to the client', async () => {
    const { app } = loadProxy({ token: 'super-secret-token' });

    const res = await request(app).get('/bkl/health').expect(200);

    const serialized = JSON.stringify(res.headers) + res.text;
    expect(serialized).not.toContain('super-secret-token');
  });

  it('omits the Authorization header when no token is configured', async () => {
    const { app, axios } = loadProxy({ token: undefined });

    await request(app).get('/bkl/health').expect(200);

    const { headers } = axios.mock.calls[0][0];
    expect(headers['Authorization']).toBeUndefined();
  });
});
