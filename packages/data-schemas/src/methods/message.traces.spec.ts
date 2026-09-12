import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { IMessage } from '..';
import { tenantStorage } from '~/config/tenantContext';
import { createMessageMethods } from './message';
import { createModels } from '../models';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

const TENANT_A = 'tenant-aaaaaaaaaaaaaaaaaaaa';
const TENANT_B = 'tenant-bbbbbbbbbbbbbbbbbbbb';

let mongoServer: MongoMemoryServer;
let Message: mongoose.Model<IMessage>;
let methods: ReturnType<typeof createMessageMethods>;

function at(minutes: number): Date {
  return new Date(Date.UTC(2026, 8, 1, 12, minutes));
}

async function seed(messages: Array<Partial<IMessage>>): Promise<void> {
  await Message.collection.insertMany(messages.map((message) => ({ ...message })));
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  Message = mongoose.models.Message as mongoose.Model<IMessage>;
  methods = createMessageMethods(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Message.deleteMany({});
});

describe('getConversationTraceRefs', () => {
  it('returns the first message time and sampled responses oldest first', async () => {
    await seed([
      { messageId: 'user-1', conversationId: 'convo', user: 'owner', createdAt: at(1) },
      {
        messageId: 'response-2',
        conversationId: 'convo',
        user: 'owner',
        createdAt: at(4),
        langfuseSampled: true,
      },
      {
        messageId: 'response-1',
        conversationId: 'convo',
        user: 'owner',
        createdAt: at(2),
        langfuseSampled: true,
        langfuseDestinationIds: ['destination-a'],
      },
      {
        messageId: 'response-unsampled',
        conversationId: 'convo',
        user: 'owner',
        createdAt: at(3),
        langfuseSampled: false,
      },
    ]);

    const refs = await methods.getConversationTraceRefs({ user: 'owner', conversationId: 'convo' });

    expect(refs).toEqual({
      firstMessageAt: at(1),
      sampledMessages: [
        { messageId: 'response-1', createdAt: at(2), langfuseDestinationIds: ['destination-a'] },
        { messageId: 'response-2', createdAt: at(4) },
      ],
    });
  });

  it("never returns another user's messages from a conversation with the same id", async () => {
    await seed([
      {
        messageId: 'victim-response',
        conversationId: 'shared-id',
        user: 'victim',
        createdAt: at(0),
        langfuseSampled: true,
      },
      { messageId: 'own-user', conversationId: 'shared-id', user: 'owner', createdAt: at(5) },
    ]);

    const refs = await methods.getConversationTraceRefs({
      user: 'owner',
      conversationId: 'shared-id',
    });

    expect(refs).toEqual({ firstMessageAt: at(5), sampledMessages: [] });
  });

  it('reads only the active tenant', async () => {
    await tenantStorage.run({ tenantId: TENANT_A }, () =>
      Message.create({
        messageId: 'tenant-a-response',
        conversationId: 'convo',
        user: 'owner',
        langfuseSampled: true,
      }),
    );
    await tenantStorage.run({ tenantId: TENANT_B }, () =>
      Message.create({
        messageId: 'tenant-b-response',
        conversationId: 'convo',
        user: 'owner',
        langfuseSampled: true,
      }),
    );

    const refs = await tenantStorage.run({ tenantId: TENANT_B }, () =>
      methods.getConversationTraceRefs({ user: 'owner', conversationId: 'convo' }),
    );

    expect(refs.sampledMessages.map(({ messageId }) => messageId)).toEqual(['tenant-b-response']);
  });
});

describe('hasSampledTraceMessage', () => {
  const sampled = (messageId: string, overrides: Partial<IMessage> = {}): Partial<IMessage> => ({
    messageId,
    conversationId: 'convo',
    user: 'owner',
    createdAt: at(1),
    langfuseSampled: true,
    ...overrides,
  });

  it('finds a newer response held by a readable destination after older ones went elsewhere', async () => {
    await seed([
      sampled('old', { createdAt: at(1), langfuseDestinationIds: ['retired'] }),
      sampled('new', { createdAt: at(9), langfuseDestinationIds: ['current'] }),
    ]);

    await expect(
      methods.hasSampledTraceMessage({
        user: 'owner',
        conversationId: 'convo',
        destinationIds: ['current'],
      }),
    ).resolves.toBe(true);
    await expect(
      methods.hasSampledTraceMessage({
        user: 'owner',
        conversationId: 'convo',
        destinationIds: ['elsewhere'],
      }),
    ).resolves.toBe(false);
  });

  it('counts a response with no recorded destinations for any destination', async () => {
    await seed([sampled('unrecorded')]);

    await expect(
      methods.hasSampledTraceMessage({
        user: 'owner',
        conversationId: 'convo',
        destinationIds: [],
      }),
    ).resolves.toBe(true);
  });

  it('ignores unsampled responses, an empty destination record and other users', async () => {
    await seed([
      sampled('unsampled', { langfuseSampled: false }),
      sampled('recorded-none', { langfuseDestinationIds: [] }),
      sampled('someone-else', { user: 'victim' }),
    ]);

    await expect(
      methods.hasSampledTraceMessage({
        user: 'owner',
        conversationId: 'convo',
        destinationIds: ['current'],
      }),
    ).resolves.toBe(false);
  });
});
