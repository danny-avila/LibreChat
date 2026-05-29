const express = require('express');
const request = require('supertest');
const { remoteAgentJsonLimit, remoteAgentJsonParser } = require('./remoteAgentBodyParser');

describe('remoteAgentJsonParser', () => {
  function createApp() {
    const app = express();
    app.use('/api/agents/v1', remoteAgentJsonParser);
    app.use(express.json({ limit: '3mb' }));
    app.post('/api/agents/v1/responses', (req, res) => {
      res.json({ length: req.body.input.length });
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

  it('allows Remote Agent API JSON bodies above the global parser limit', async () => {
    const input = 'x'.repeat(4 * 1024 * 1024);

    const response = await request(createApp()).post('/api/agents/v1/responses').send({ input });

    expect(response.status).toBe(200);
    expect(response.body.length).toBe(input.length);
  });

  it('keeps the global JSON limit for other routes', async () => {
    const input = 'x'.repeat(4 * 1024 * 1024);

    const response = await request(createApp()).post('/api/other').send({ input });

    expect(response.status).toBe(413);
    expect(response.body.type).toBe('entity.too.large');
  });
});
