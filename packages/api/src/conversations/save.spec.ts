import mongoose from 'mongoose';
import { randomUUID } from 'crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMethods, createModels } from '@librechat/data-schemas';
import type { ConversationMethods, MessageMethods } from '@librechat/data-schemas';
import type { TurnConversationRequest } from './save';
import {
  runAfterSeed,
  saveTurnConversation,
  seedTurnConversation,
  getConversationWriteContext,
} from './save';

type Store = Pick<ConversationMethods, 'getConvo' | 'saveConvo'> &
  Pick<MessageMethods, 'saveMessage'>;

let mongoServer: MongoMemoryServer;
let store: Store;

const endpointOptions = { model: 'claude-sonnet', agent_id: 'agent_persisted' };

function createRequest(userId: string): TurnConversationRequest {
  return {
    user: { id: userId },
    body: {},
    conversationCreatedAt: '2026-09-19T12:00:00.000Z',
  };
}

function seedFields(req: TurnConversationRequest, conversationId: string) {
  return {
    req,
    conversationId,
    endpoint: 'agents',
    endpointType: undefined,
    endpointOptions,
    agentId: 'agent_persisted',
    context: 'save.spec seed',
  };
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  const methods = createMethods(mongoose);
  store = {
    getConvo: methods.getConvo,
    saveConvo: methods.saveConvo,
    saveMessage: methods.saveMessage,
  };
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.models.Conversation.deleteMany({});
  await mongoose.models.Message.deleteMany({});
  jest.restoreAllMocks();
});

describe('seedTurnConversation', () => {
  it('creates the row a deferred first message has not written yet', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const conversationId = randomUUID();
    const req = createRequest(userId);
    const messageFind = jest.spyOn(mongoose.models.Message, 'find');

    await seedTurnConversation(store, seedFields(req, conversationId));

    const row = await store.getConvo(userId, conversationId);
    expect(row).toMatchObject({
      conversationId,
      endpoint: 'agents',
      model: 'claude-sonnet',
      agent_id: 'agent_persisted',
      messages: [],
    });
    expect(row?.createdAt?.toISOString()).toBe('2026-09-19T12:00:00.000Z');
    /** The seed knows the row holds no messages, so it never reads the message list. */
    expect(messageFind).not.toHaveBeenCalled();
    expect(req.resolvedConversation).toMatchObject({ conversationId });
  });

  it('lets the deferred message save reuse the seeded row and append its message', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const conversationId = randomUUID();
    const req = createRequest(userId);
    await seedTurnConversation(store, seedFields(req, conversationId));
    const getConvo = jest.spyOn(store, 'getConvo');

    const ctx = getConversationWriteContext(req);
    const saved = await store.saveMessage(ctx, {
      messageId: randomUUID(),
      conversationId,
      text: 'Summarize the attached sheet',
      isCreatedByUser: true,
      user: userId,
    });
    const { initialized } = await saveTurnConversation(store, {
      ...seedFields(req, conversationId),
      context: 'save.spec message',
      ctx,
      savedMessageId: saved?._id,
    });

    expect(initialized).toBe(true);
    expect(getConvo).not.toHaveBeenCalled();
    const row = await store.getConvo(userId, conversationId);
    expect(row?.messages?.map(String)).toEqual([String(saved?._id)]);
    expect(row).toMatchObject({ model: 'claude-sonnet', agent_id: 'agent_persisted' });
  });

  it('leaves an existing conversation to the message save', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const conversationId = randomUUID();
    await store.saveConvo(
      { userId },
      { conversationId, endpoint: 'openAI', model: 'gpt-4o', title: 'Existing chat' },
    );
    const before = await store.getConvo(userId, conversationId);
    const saveConvo = jest.spyOn(store, 'saveConvo');

    await seedTurnConversation(store, seedFields(createRequest(userId), conversationId));

    expect(saveConvo).not.toHaveBeenCalled();
    const after = await store.getConvo(userId, conversationId);
    expect(after).toMatchObject({ endpoint: 'openAI', model: 'gpt-4o', title: 'Existing chat' });
    expect(after?.updatedAt).toEqual(before?.updatedAt);
  });

  it('never creates a subagent thread row, which only its parent run may create', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const conversationId = randomUUID();
    const req = {
      ...createRequest(userId),
      _agentEventBindingParentConversationId: randomUUID(),
    };

    await seedTurnConversation(store, seedFields(req, conversationId));

    await expect(store.getConvo(userId, conversationId)).resolves.toBeNull();
  });

  it('stamps a temporary chat with its retention', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const conversationId = randomUUID();
    const req = { ...createRequest(userId), body: { isTemporary: true } };

    await seedTurnConversation(store, seedFields(req, conversationId));

    const row = await store.getConvo(userId, conversationId);
    expect(row?.isTemporary).toBe(true);
    expect(row?.expiredAt).toBeInstanceOf(Date);
  });

  it('settles instead of rejecting when the lookup fails, so the message still saves', async () => {
    const failingStore = {
      ...store,
      getConvo: jest.fn().mockRejectedValue(new Error('database unavailable')),
    };

    await expect(
      seedTurnConversation(
        failingStore,
        seedFields(createRequest(new mongoose.Types.ObjectId().toString()), randomUUID()),
      ),
    ).resolves.toBeUndefined();
  });

  it('does nothing for a request without a user', async () => {
    const saveConvo = jest.spyOn(store, 'saveConvo');

    await seedTurnConversation(store, seedFields({ body: {} }, randomUUID()));

    expect(saveConvo).not.toHaveBeenCalled();
  });
});

describe('runAfterSeed', () => {
  it('holds the write while the seed is in flight', async () => {
    let finishSeed: () => void = () => undefined;
    const seed = new Promise<void>((resolve) => {
      finishSeed = resolve;
    });
    const write = jest.fn().mockResolvedValue('written');

    const pending = runAfterSeed(seed, write)();
    expect(write).not.toHaveBeenCalled();

    finishSeed();
    await expect(pending).resolves.toBe('written');
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('starts the write synchronously once the seed has landed', async () => {
    const seed = Promise.resolve();
    const write = jest.fn().mockResolvedValue('written');
    const start = runAfterSeed(seed, write);
    await seed;
    await Promise.resolve();

    void start();

    expect(write).toHaveBeenCalledTimes(1);
  });
});
