import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createVoiceHandlers } from '../service';
import { createVoiceSession } from '../session';

const WORKER_SECRET = 'worker-secret-value';
const JWT_SECRET = 'librechat-jwt-secret';

const buildApp = () => {
  const app = express();
  app.use(express.json());
  const handlers = createVoiceHandlers();
  app.post('/session/claim', handlers.claimSession);
  return app;
};

const seedSession = () =>
  createVoiceSession({
    userId: 'user-1',
    conversationId: 'convo-1',
    roomName: 'lc_abc',
    endpoint: 'agents',
    agentId: 'agent-1',
    maxSessionDuration: 1800,
    stt: { provider: 'deepgram', model: 'nova-3' },
    tts: { provider: 'cartesia', voice: 'v1' },
  });

describe('claimSession', () => {
  beforeEach(() => {
    process.env.LIVEKIT_WORKER_SECRET = WORKER_SECRET;
    process.env.JWT_SECRET = JWT_SECRET;
  });

  afterEach(() => {
    delete process.env.LIVEKIT_WORKER_SECRET;
  });

  it('404s when voice is unconfigured', async () => {
    delete process.env.LIVEKIT_WORKER_SECRET;

    const response = await request(buildApp()).post('/session/claim').send({ sessionId: 'x' });

    expect(response.status).toBe(404);
  });

  it('401s without the worker secret, so the browser cannot claim a session', async () => {
    const sessionId = await seedSession();

    const response = await request(buildApp()).post('/session/claim').send({ sessionId });

    expect(response.status).toBe(401);
  });

  it('401s with a wrong worker secret', async () => {
    const sessionId = await seedSession();

    const response = await request(buildApp())
      .post('/session/claim')
      .set('x-livekit-worker-secret', 'nope')
      .send({ sessionId });

    expect(response.status).toBe(401);
  });

  it('400s without a sessionId', async () => {
    const response = await request(buildApp())
      .post('/session/claim')
      .set('x-livekit-worker-secret', WORKER_SECRET)
      .send({});

    expect(response.status).toBe(400);
  });

  it('returns the call context plus a callback token scoped to the caller', async () => {
    const sessionId = await seedSession();

    const response = await request(buildApp())
      .post('/session/claim')
      .set('x-livekit-worker-secret', WORKER_SECRET)
      .send({ sessionId });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      userId: 'user-1',
      conversationId: 'convo-1',
      endpoint: 'agents',
      agentId: 'agent-1',
      stt: { provider: 'deepgram', model: 'nova-3' },
      tts: { provider: 'cartesia', voice: 'v1' },
    });

    const decoded = jwt.verify(response.body.callbackToken, JWT_SECRET) as jwt.JwtPayload;
    expect(decoded.id).toBe('user-1');
  });

  it('outlives the user JWT rotation window but stays bounded', async () => {
    const sessionId = await seedSession();

    const response = await request(buildApp())
      .post('/session/claim')
      .set('x-livekit-worker-secret', WORKER_SECRET)
      .send({ sessionId });

    const decoded = jwt.verify(response.body.callbackToken, JWT_SECRET) as jwt.JwtPayload;
    const lifetime = (decoded.exp ?? 0) - (decoded.iat ?? 0);

    expect(lifetime).toBe(1800);
  });

  it('is single-use: a replayed claim is rejected', async () => {
    const sessionId = await seedSession();
    const app = buildApp();

    const first = await request(app)
      .post('/session/claim')
      .set('x-livekit-worker-secret', WORKER_SECRET)
      .send({ sessionId });
    const second = await request(app)
      .post('/session/claim')
      .set('x-livekit-worker-secret', WORKER_SECRET)
      .send({ sessionId });

    expect(first.status).toBe(200);
    expect(second.status).toBe(404);
  });
});
