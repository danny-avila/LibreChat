const express = require('express');
const request = require('supertest');
const {
  getRemoteAgentJsonLimit,
  remoteAgentJsonLimit,
  remoteAgentJsonParser,
} = require('./remoteAgentBodyParser');

describe('remoteAgentJsonParser', () => {
  function createApp() {
    const app = express();
    const jsonParser = express.json({ limit: '3mb' });
    app.use((req, res, next) => {
      const pathname = new URL(req.originalUrl, 'http://localhost').pathname;
      const isRemoteAgentJsonRequest =
        req.method === 'POST' &&
        /(?:^|\/)api\/agents\/v1\/(?:responses|chat\/completions)\/?$/.test(pathname);
      if (isRemoteAgentJsonRequest) {
        return next();
      }
      return jsonParser(req, res, next);
    });
    app.use('/api/agents/v1', (req, res, next) => {
      if (req.get('authorization') === 'Bearer valid') {
        const requestBodyLimit = req.get('x-request-body-limit');
        if (requestBodyLimit) {
          req.config = { endpoints: { agents: { remoteApi: { requestBodyLimit } } } };
        }
        return next();
      }
      return res.status(401).json({ parsed: req.body != null });
    });
    app.use('/api/agents/v1', remoteAgentJsonParser);
    app.post('/api/agents/v1/responses', (req, res) => {
      res.json({ length: req.body.input.length });
    });
    app.post('/api/agents/v1/responses/', (req, res) => {
      res.json({ length: req.body.input.length });
    });
    app.post('/api/agents/v1', (req, res) => {
      res.json({ parsed: req.body != null, name: req.body.name });
    });
    app.post('/api/other', (req, res) => {
      res.json({ length: req.body.input.length });
    });
    app.use((err, _req, res, _next) => {
      res.status(err.status || 500).json({ type: err.type });
    });
    return app;
  }

  it('uses a larger default JSON limit for Remote Agent API routes', () => {
    expect(remoteAgentJsonLimit).toBe(process.env.REMOTE_AGENT_API_JSON_LIMIT || '64mb');
  });

  it('resolves the Remote Agent API JSON limit from request config', () => {
    const req = {
      config: { endpoints: { agents: { remoteApi: { requestBodyLimit: '8mb' } } } },
    };

    expect(getRemoteAgentJsonLimit(req)).toBe('8mb');
  });

  it('allows Remote Agent API JSON bodies above the global parser limit', async () => {
    const input = 'x'.repeat(4 * 1024 * 1024);

    const response = await request(createApp())
      .post('/api/agents/v1/responses')
      .set('authorization', 'Bearer valid')
      .send({ input });

    expect(response.status).toBe(200);
    expect(response.body.length).toBe(input.length);
  });

  it('uses the configured Remote Agent API request body limit', async () => {
    const input = 'x'.repeat(4 * 1024 * 1024);

    const response = await request(createApp())
      .post('/api/agents/v1/responses')
      .set('authorization', 'Bearer valid')
      .set('x-request-body-limit', '1mb')
      .send({ input });

    expect(response.status).toBe(413);
    expect(response.body.type).toBe('entity.too.large');
  });

  it('allows Remote Agent API JSON bodies above the global parser limit with a trailing slash', async () => {
    const input = 'x'.repeat(4 * 1024 * 1024);

    const response = await request(createApp())
      .post('/api/agents/v1/responses/')
      .set('authorization', 'Bearer valid')
      .send({ input });

    expect(response.status).toBe(200);
    expect(response.body.length).toBe(input.length);
  });

  it('rejects unauthenticated Remote Agent API requests before parsing large JSON bodies', async () => {
    const response = await request(createApp())
      .post('/api/agents/v1/responses')
      .send({ input: 'not parsed before auth' });

    expect(response.status).toBe(401);
    expect(response.body.parsed).toBe(false);
  });

  it('keeps regular agent v1 JSON routes on the global parser', async () => {
    const response = await request(createApp())
      .post('/api/agents/v1')
      .set('authorization', 'Bearer valid')
      .send({ name: 'Agent' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ parsed: true, name: 'Agent' });
  });

  it('keeps the global JSON limit for other routes', async () => {
    const input = 'x'.repeat(4 * 1024 * 1024);

    const response = await request(createApp()).post('/api/other').send({ input });

    expect(response.status).toBe(413);
    expect(response.body.type).toBe('entity.too.large');
  });
});
