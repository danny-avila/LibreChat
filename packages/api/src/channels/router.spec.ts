import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { createHmac, randomUUID } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  createModels,
  createChannelStore,
  tenantStorage,
  getTenantId,
} from '@librechat/data-schemas';
import type { IUser, ChannelInstallation } from '@librechat/data-schemas';
import type { ChannelEnvelope } from 'librechat-data-provider';
import type { RequestHandler } from 'express';
import { createChannelCipher, channelHash } from './crypto';
import { createChannelsRouter } from './router';
import { startChannelGateway } from './gateway';

let mongo: MongoMemoryServer;
let store: ReturnType<typeof createChannelStore>;
let models: ReturnType<typeof createModels>;
let app: express.Express;
let installation: ChannelInstallation;
let allowed: boolean;
let active: boolean;
let toolFailure: boolean;
let oauthPrompt = false;
let slowRun = false;
let disconnected = false;
const calls: Array<{ userId: string; tenant?: string; header?: string; messages: object[] }> = [];
const serviceToken = 'gateway-test-credential'.repeat(3);
const env = {
  CREDS_KEY: '12'.repeat(32),
  CHANNEL_GATEWAY_TOKEN: serviceToken,
  OPENID_REUSE_TOKENS: 'false',
};
const atef = new mongoose.Types.ObjectId().toString();
const danny = new mongoose.Types.ObjectId().toString();
const next: RequestHandler = (_req, _res, proceed) => proceed();
const envelope = (overrides: Partial<ChannelEnvelope> = {}): ChannelEnvelope => ({
  provider: 'slack',
  eventId: randomUUID(),
  installationId: installation.id,
  teamId: 'T123',
  senderId: 'UATEF',
  destinationId: 'C123',
  threadId: '1.0001',
  messageId: '1.0002',
  sentAt: 1.0002,
  text: 'hello',
  startsThread: true,
  isDirect: false,
  ...overrides,
});
const post = (path: string, body: object = {}) =>
  request(app).post(`/gateway/${path}`).set('Authorization', `Bearer ${serviceToken}`).send(body);
async function link(senderId: string, userId: string) {
  const token = randomUUID();
  await store.challenge({
    installationId: installation.id,
    tenantId: 'tenant-a',
    senderId,
    tokenHash: channelHash(token),
    codeHash: channelHash('code'),
    expiresAt: new Date(Date.now() + 60000),
  });
  expect(await store.confirm(channelHash(token), channelHash('code'), 'tenant-a', userId)).toBe(
    true,
  );
}
async function invoke(message: ChannelEnvelope) {
  await post('events', message).expect(200);
  const work = (await post('work').expect(200)).body;
  const result = await post(`work/${work.id}/invoke`, {
    owner: work.owner,
    userId: 'forged',
    agentId: 'forged',
  })
    .set('x-tenant-id', 'tenant-b')
    .expect(200);
  return { work, result };
}
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  models = createModels(mongoose);
  store = createChannelStore(mongoose);
  await store.ready();
  app = express();
  app.use(express.json());
  const router = createChannelsRouter({
    store,
    loadConfig: async () => ({
      channels: {
        enabled: true,
        port: 0,
        pollMs: 250,
        publicUrl: 'https://librechat.example',
        gatewayUrl: 'https://gateway.example',
      },
    }),
    env,
    browserAuth: async (req, res, proceed) => {
      const id = req.get('test-user');
      if (!id) {
        res.sendStatus(401);
        return;
      }
      await tenantStorage.run({ tenantId: req.get('test-tenant') ?? 'tenant-a' }, async () => {
        const user = await models.User.findById(id).lean();
        if (!user) {
          res.sendStatus(401);
          return;
        }
        Object.assign(user, { id });
        req.user = user;
        proceed();
      });
    },
    terms: next,
    checkBan: next,
    configMiddleware: next,
    checkFeature: next,
    checkAgent: (_req, res, proceed) => {
      if (allowed) proceed();
      else res.status(403).json({ error: 'private diagnostic' });
    },
    context: next,
    execute: async (req, res) => {
      calls.push({
        userId: (req.user as IUser).id,
        tenant: getTenantId(),
        header: req.get('x-tenant-id'),
        messages: req.body.messages,
      });
      if (oauthPrompt) {
        const closed = new Promise<void>((resolve) =>
          res.once('close', () => {
            disconnected = true;
            resolve();
          }),
        );
        res.write('event: message\ndata: {"authURL":"https://private.example/secret"}\n\n');
        await closed;
        return;
      }
      if (slowRun) {
        await new Promise<void>((resolve) =>
          res.once('close', () => {
            disconnected = true;
            resolve();
          }),
        );
        return;
      }
      if (toolFailure) {
        res.status(401).json({ error: 'expired token: highly-secret' });
        return;
      }
      res.json({
        choices: [{ message: { content: `visible result for ${(req.user as IUser).id}` } }],
      });
    },
    findUser: (query) => models.User.findOne(query).lean<IUser>().exec(),
    isPrincipalActive: async () => active,
    reportError: () => undefined,
    fetcher: async (input) =>
      Response.json(
        String(input).endsWith('auth.test')
          ? { ok: true, team_id: 'T123', user_id: 'UBOT', bot_id: 'B123' }
          : { ok: true, bot: { app_id: 'A123' } },
      ),
  });
  app.use('/api/channels', router);
  app.use(router);
});
beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.models)
      .filter(
        (model) =>
          model.modelName.startsWith('Channel') || ['User', 'Agent'].includes(model.modelName),
      )
      .map((model) => model.collection.deleteMany({})),
  );
  await tenantStorage.run({ tenantId: 'tenant-a' }, () =>
    models.User.create([
      { _id: atef, email: 'atef@example.test', tenantId: 'tenant-a' },
      { _id: danny, email: 'danny@example.test', tenantId: 'tenant-a' },
    ]),
  );
  installation = {
    id: randomUUID(),
    tenantId: 'tenant-a',
    ownerId: atef,
    agentId: 'agent-1',
    name: 'Agent',
    teamId: 'T123',
    botUserId: 'UBOT',
    appId: 'A123',
    mode: 'http',
    enabled: true,
    credentials: 'unused',
  };
  installation.credentials = createChannelCipher('12'.repeat(32)).encrypt(
    JSON.stringify({ botToken: 'xoxb-test', signingSecret: 'test-secret' }),
    installation.id,
  );
  await store.save(installation);
  env.OPENID_REUSE_TOKENS = 'false';
  calls.length = 0;
  allowed = true;
  active = true;
  toolFailure = false;
  oauthPrompt = false;
  slowRun = false;
  disconnected = false;
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
it('requires the dedicated service credential', async () => {
  await request(app).post('/gateway/work').send({}).expect(401);
  await request(app)
    .post('/gateway/events')
    .set('Authorization', 'Bearer owner-api-key')
    .send(envelope())
    .expect(401);
  expect(await store.claim(60000)).toBeNull();
});
it('binds each shared turn to its sender and carries only delivered visible history', async () => {
  await link('UATEF', atef);
  await link('UDANNY', danny);
  const first = await invoke(envelope());
  expect(first.result.body.private).toBe(false);
  await post(`work/${first.work.id}/sending`, { owner: first.work.owner }).expect(200);
  await post(`work/${first.work.id}/settle`, { owner: first.work.owner, outcome: 'done' }).expect(
    200,
  );
  await invoke(envelope({ senderId: 'UDANNY', messageId: '1.0003', text: 'follow up' }));
  expect(calls.map((call) => call.userId)).toEqual([atef, danny]);
  expect(calls[1].messages).toEqual([
    { role: 'user', content: '[UATEF] hello' },
    { role: 'assistant', content: `visible result for ${atef}` },
    { role: 'user', content: '[UDANNY] follow up' },
  ]);
  expect(calls.every((call) => call.tenant === 'tenant-a' && call.header === undefined)).toBe(true);
});
it('never uses an installation owner for an unlinked sender', async () => {
  const { result } = await invoke(envelope());
  expect(result.body.private).toBe(true);
  expect(result.body.text).toContain('https://librechat.example/channels/link?token=');
  expect(calls).toHaveLength(0);
});
it('requires sign-in, the same tenant, and the private single-use code', async () => {
  expect.assertions(1);
  const { result } = await invoke(envelope());
  const token = result.body.text.match(/token=([a-f0-9]{64})/)[1];
  expect(result.body.private).toBe(true);
  const code = result.body.text.match(/signing in: ([a-f0-9]{16})/)[1];
  await request(app).post('/link').send({ token, code }).expect(401);
  await request(app)
    .post('/link')
    .set('test-user', atef)
    .set('test-tenant', 'tenant-b')
    .send({ token, code })
    .expect(401);
  await request(app)
    .post('/link')
    .set('test-user', atef)
    .send({ token, code: 'f'.repeat(16) })
    .expect(400);
  await request(app).post('/link').set('test-user', atef).send({ token, code }).expect(200);
  await request(app).post('/link').set('test-user', atef).send({ token, code }).expect(404);
});
it.each(['access', 'deleted', 'credentials'])(
  'keeps %s failures private and hides diagnostics',
  async (failure) => {
    await link('UATEF', atef);
    allowed = failure !== 'access';
    active = failure !== 'deleted';
    toolFailure = failure === 'credentials';
    const { result } = await invoke(envelope());
    expect(result.body.private).toBe(true);
    expect(JSON.stringify(result.body)).not.toMatch(/highly-secret|private diagnostic/);
    if (!allowed || !active) expect(calls).toHaveLength(0);
  },
);
it('does not publish an answer after account unlink', async () => {
  await link('UATEF', atef);
  const { work } = await invoke(envelope());
  await store.unlink(installation.id, 'tenant-a', atef);
  expect(
    (await post(`work/${work.id}/sending`, { owner: work.owner }).expect(200)).body.valid,
  ).toBe(false);
});
it('rejects another installation identity and a disabled connection', async () => {
  await post('events', envelope({ teamId: 'TOTHER' })).expect(403);
  await store.save({ ...installation, enabled: false });
  await post('events', envelope()).expect(403);
  expect(await store.claim(60000)).toBeNull();
});

async function until(check: () => boolean) {
  const deadline = Date.now() + 7000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Gateway test timed out');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
it('runs signed HTTP events through the worker, retries a rate limit, and cancels without a reply', async () => {
  await link('UATEF', atef);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test listener');
  const statuses: string[] = [];
  let posts = 0;
  const gateway = await startChannelGateway({
    apiUrl: `http://127.0.0.1:${address.port}`,
    serviceToken,
    reportError: () => undefined,
    fetcher: async (input, init) => {
      if (!String(input).startsWith('https://slack.com/api/')) return fetch(input, init);
      const body = JSON.parse(String(init?.body));
      if (String(input).endsWith('agents.sessions.setStatus')) statuses.push(body.status);
      if (String(input).endsWith('chat.postMessage')) {
        posts++;
        if (posts === 1)
          return new Response('{}', { status: 429, headers: { 'retry-after': '1' } });
      }
      return Response.json({ ok: true, ts: '2.0001' });
    },
  });
  async function send(event: object, signatureValid = true) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({
      type: 'event_callback',
      api_app_id: 'A123',
      team_id: 'T123',
      event_id: 'Ev1',
      event,
    });
    const signature = `v0=${createHmac('sha256', 'test-secret').update(`v0:${timestamp}:${body}`).digest('hex')}`;
    return fetch(`http://127.0.0.1:${gateway.port}/slack/${installation.id}/events`, {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
        'x-slack-request-timestamp': timestamp,
        'x-slack-signature': signatureValid ? signature : 'forged',
      },
    });
  }
  try {
    const event = {
      type: 'app_mention',
      user: 'UATEF',
      channel: 'C123',
      text: '<@UBOT> hello',
      ts: '1.0001',
    };
    expect((await send(event, false)).status).toBe(401);
    expect((await send(event)).status).toBe(200);
    expect((await send(event)).status).toBe(200);
    await until(() => posts === 2 && statuses.filter((value) => value === 'active').length === 2);
    expect(calls).toHaveLength(1);
    expect(statuses).toContain('processing');
    slowRun = true;
    await send({ ...event, ts: '1.0002', thread_ts: '1.0001' });
    await until(() => calls.length === 2);
    await send({
      type: 'agent_session_stopped',
      event_ts: '1.0003',
      user: 'UATEF',
      channel: 'C123',
      thread_ts: '1.0001',
    });
    await until(() => disconnected && statuses[statuses.length - 1] === 'active');
    expect(posts).toBe(2);
  } finally {
    await gateway.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it('generates one app per owned agent, verifies credentials, and keeps enable separate', async () => {
  await tenantStorage.run({ tenantId: 'tenant-a' }, () =>
    models.Agent.create({
      id: 'agent-2',
      tenantId: 'tenant-a',
      name: 'Second agent',
      provider: 'openAI',
      model: 'test',
      author: atef,
    }),
  );
  const manifest = await request(app)
    .post('/manifest')
    .set('test-user', atef)
    .send({ agentId: 'agent-2', mode: 'socket' })
    .expect(200);
  const id = manifest.body.installationId;
  const repeated = await request(app)
    .post('/manifest')
    .set('test-user', atef)
    .send({ agentId: 'agent-2', mode: 'socket' })
    .expect(200);
  expect(repeated.body.installationId).toBe(id);
  await request(app)
    .post('/manifest')
    .set('test-user', danny)
    .send({ agentId: 'agent-2', mode: 'socket' })
    .expect(403);
  // Remove only the test fixture's conflicting app identity before assigning it to the new agent.
  await mongoose.model('ChannelInstallation').deleteOne({ id: installation.id });
  const credentials = {
    agentId: 'agent-2',
    appId: 'AWRONG',
    mode: 'socket',
    enabled: true,
    botToken: 'xoxb-test',
    signingSecret: 'secret'.repeat(4),
    appToken: 'xapp-test',
  };
  await request(app).put(`/${id}`).set('test-user', atef).send(credentials).expect(400);
  const saved = await request(app)
    .put(`/${id}`)
    .set('test-user', atef)
    .send({ ...credentials, appId: 'A123' })
    .expect(200);
  expect(saved.body.enabled).toBe(false);
  expect(JSON.stringify(saved.body)).not.toMatch(/xoxb|xapp|secret/);
  expect((await store.get(id))?.credentials).not.toContain('xoxb-test');
  await request(app).post(`/${id}/check`).set('test-user', atef).expect(200);
  await request(app).post(`/${id}/enable`).set('test-user', danny).expect(403);
  await request(app).post(`/${id}/enable`).set('test-user', atef).expect(200);
  expect((await store.get(id))?.enabled).toBe(true);
});

it('requires a fresh OpenID session before consuming an account link', async () => {
  const { result } = await invoke(envelope());
  const token = result.body.text.match(/token=([a-f0-9]{64})/)[1];
  const code = result.body.text.match(/signing in: ([a-f0-9]{16})/)[1];
  await tenantStorage.run({ tenantId: 'tenant-a' }, () =>
    models.User.updateOne(
      { _id: atef },
      { $set: { provider: 'openid', openidId: 'subject-atef' } },
    ),
  );
  env.OPENID_REUSE_TOKENS = 'true';
  const info = await request(app).get(`/link/${token}`).set('test-user', atef).expect(200);
  expect(info.body.reauthUrl).toBe('https://librechat.example/oauth/openid?prompt=login');
  const rejected = await request(app)
    .post('/link')
    .set('test-user', atef)
    .send({ token, code })
    .expect(403);
  expect(rejected.body.error).toBe('account_reconnect_required');
  expect(await store.getChallenge(channelHash(token))).not.toBeNull();
  expect(await store.link(installation.id, 'tenant-a', 'UATEF')).toBeNull();
});

it('cancels browser-only tool authentication and queues a private reconnect notice', async () => {
  await link('UATEF', atef);
  await post('events', envelope()).expect(200);
  const work = (await post('work').expect(200)).body;
  oauthPrompt = true;
  await expect(post(`work/${work.id}/invoke`, { owner: work.owner })).rejects.toThrow();
  let recovered = null;
  for (let i = 0; i < 40 && !recovered; i++) {
    recovered = (await post('work').expect(200)).body;
    if (!recovered) await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(disconnected).toBe(true);
  expect(recovered.status).toBe('ready');
  expect(recovered.reply.private).toBe(true);
  expect(recovered.reply.text).toContain('reconnect your tools');
  expect(recovered.reply.text).not.toContain('private.example');
  expect(calls).toHaveLength(1);
});
