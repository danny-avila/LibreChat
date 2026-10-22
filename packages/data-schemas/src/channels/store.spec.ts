import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { ChannelEnvelope } from 'librechat-data-provider';
import { createChannelStore } from './store';

let mongo: MongoMemoryServer;
let store: ReturnType<typeof createChannelStore>;
const envelope = (overrides: Partial<ChannelEnvelope> = {}): ChannelEnvelope => ({
  provider: 'slack',
  eventId: randomUUID(),
  installationId: 'ee2a9826-0899-4f2b-b1aa-51bf872eec44',
  teamId: 'T123',
  senderId: 'U123',
  destinationId: 'C123',
  threadId: '1.0001',
  messageId: '1.0002',
  sentAt: 1.0002,
  text: 'hello',
  startsThread: true,
  isDirect: false,
  ...overrides,
});
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  store = createChannelStore(mongoose);
  await store.ready();
});
beforeEach(async () => {
  await Promise.all(Object.values(mongoose.models).map((model) => model.deleteMany({})));
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

it('deduplicates concurrent Slack deliveries and serializes a thread', async () => {
  const first = envelope();
  await Promise.all(Array.from({ length: 6 }, () => store.enqueue(first)));
  await store.enqueue(envelope());
  const claims = await Promise.all([store.claim(60000), store.claim(60000)]);
  expect(claims.filter(Boolean)).toHaveLength(1);
  expect(await mongoose.model('ChannelEvent').countDocuments()).toBe(2);
  const work = claims.find((item) => item != null)!;
  expect(await store.begin(work.id, work.owner)).toBe(true);
  expect(await store.begin(work.id, work.owner)).toBe(false);
  expect(await store.claim(60000)).toBeNull();
});

it('never executes an expired running receipt again', async () => {
  await store.enqueue(envelope());
  const work = (await store.claim(60000))!;
  await store.begin(work.id, work.owner);
  await mongoose.model('ChannelEvent').updateMany({}, { $set: { expiresAt: new Date(0) } });
  await mongoose.model('ChannelLane').updateMany({}, { $set: { expiresAt: new Date(0) } });
  const recovered = (await store.claim(60000))!;
  expect(recovered.status).toBe('ready');
  expect(recovered.reply?.private).toBe(true);
  expect(await store.begin(recovered.id, recovered.owner)).toBe(false);
  expect(await store.reply(work.id, work.owner, { text: 'late result', private: false })).toBe(
    false,
  );
});

it('does not resend a reply whose delivery outcome is unknown', async () => {
  await store.enqueue(envelope());
  const work = (await store.claim(60000))!;
  await store.reply(work.id, work.owner, { text: 'result', private: false });
  await store.sending(work.id, work.owner);
  await mongoose.model('ChannelEvent').updateMany({}, { $set: { expiresAt: new Date(0) } });
  await mongoose.model('ChannelLane').updateMany({}, { $set: { expiresAt: new Date(0) } });
  const cleanup = (await store.claim(60000))!;
  expect(cleanup.status).toBe('cleanup');
  expect(await store.sending(cleanup.id, cleanup.owner)).toBe(false);
  await store.settle(cleanup.id, cleanup.owner, 'uncertain', 0);
  expect(await store.claim(60000)).toBeNull();
});

it('retries a rate-limited reply without executing the agent again', async () => {
  await store.enqueue(envelope());
  const work = (await store.claim(60000))!;
  await store.begin(work.id, work.owner);
  await store.reply(work.id, work.owner, { text: 'result', private: false });
  await store.sending(work.id, work.owner);
  await store.settle(work.id, work.owner, 'retry', 0);
  const recovered = (await store.claim(60000))!;
  expect(recovered.reply?.text).toBe('result');
  expect(recovered.attempts).toBe(1);
  expect(await store.begin(recovered.id, recovered.owner)).toBe(false);
});

it('scopes history to the installation and thread, and excludes private replies', async () => {
  const first = envelope();
  for (const privateReply of [false, true]) {
    await store.enqueue({ ...first, eventId: randomUUID() });
    const work = (await store.claim(60000))!;
    await store.reply(work.id, work.owner, {
      text: privateReply ? 'private code' : 'visible reply',
      private: privateReply,
    });
    await store.sending(work.id, work.owner);
    await store.settle(work.id, work.owner, 'done', 0, '1.5');
  }
  expect(await store.history(first, 10000)).toEqual([
    { role: 'user', content: '[U123] hello' },
    { role: 'assistant', content: 'visible reply' },
  ]);
  expect(await store.history({ ...first, installationId: randomUUID() }, 10000)).toEqual([]);
  expect(await store.history({ ...first, threadId: '2.0001' }, 10000)).toEqual([]);
});

it('consumes a link challenge once, checks expiry and tenant, and never silently changes its owner', async () => {
  const challenge = {
    installationId: randomUUID(),
    tenantId: 'tenant-a',
    senderId: 'U123',
    tokenHash: 'token',
    codeHash: 'code',
    expiresAt: new Date(Date.now() + 60000),
  };
  await store.challenge(challenge);
  expect(await store.confirm('token', 'code', 'tenant-b', 'attacker')).toBe(false);
  expect(await store.confirm('token', 'wrong', 'tenant-a', 'atef')).toBe(false);
  const confirmed = await Promise.all([
    store.confirm('token', 'code', 'tenant-a', 'atef'),
    store.confirm('token', 'code', 'tenant-a', 'danny'),
  ]);
  expect(confirmed.filter(Boolean)).toHaveLength(1);
  const owner = (await store.link(challenge.installationId, 'tenant-a', 'U123'))!.userId;
  await store.challenge({ ...challenge, tokenHash: 'another' });
  expect(
    await store.confirm('another', 'code', 'tenant-a', owner === 'atef' ? 'danny' : 'atef'),
  ).toBe(false);
  await store.challenge({ ...challenge, tokenHash: 'expired', expiresAt: new Date(0) });
  expect(await store.confirm('expired', 'code', 'tenant-a', owner)).toBe(false);
  await store.unlink(challenge.installationId, 'tenant-b', owner);
  expect(await store.link(challenge.installationId, 'tenant-a', 'U123')).not.toBeNull();
  await store.unlink(challenge.installationId, 'tenant-a', owner);
  expect(await store.link(challenge.installationId, 'tenant-a', 'U123')).toBeNull();
});

it('cancels only the sender’s work and releases cancelled queued turns', async () => {
  const event = envelope();
  await store.enqueue(event);
  await store.cancel(event.installationId, 'UOTHER', event.destinationId, event.threadId);
  const work = (await store.claim(60000))!;
  expect(await store.renew(work.id, work.owner, 60000)).toBe(true);
  await store.cancel(event.installationId, event.senderId, event.destinationId, event.threadId);
  expect(await store.renew(work.id, work.owner, 60000)).toBe(false);
  expect(await store.begin(work.id, work.owner)).toBe(false);
  await mongoose.model('ChannelEvent').updateMany({}, { $set: { expiresAt: new Date(0) } });
  await mongoose.model('ChannelLane').updateMany({}, { $set: { expiresAt: new Date(0) } });
  const cleanup = (await store.claim(60000))!;
  expect(cleanup.status).toBe('cleanup');
  await store.settle(cleanup.id, cleanup.owner, 'uncertain', 0);
  await store.enqueue(envelope());
  expect(await store.claim(60000)).not.toBeNull();
});

it('does not let a repeated stop event cancel a later turn', async () => {
  const event = envelope({ sentAt: 10 });
  await store.enqueue(event);
  await store.cancel(event.installationId, event.senderId, event.destinationId, event.threadId, 9);
  const work = (await store.claim(60000))!;
  expect(await store.begin(work.id, work.owner)).toBe(true);
  await store.cancel(event.installationId, event.senderId, event.destinationId, event.threadId, 11);
  expect(await store.renew(work.id, work.owner, 60000)).toBe(false);
});
