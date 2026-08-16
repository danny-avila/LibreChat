/**
 * Integration test for forced-retention enforcement on the Assistants chat path.
 *
 * `saveUserMessage` / `saveAssistantMessage` (and the `syncMessages` reconciliation)
 * used to persist messages through `recordMessage`, which bypasses retention. The
 * conversation was forced temporary by `saveConvo` while its messages were stored with
 * no `isTemporary`/`expiredAt`, leaving them uncovered by the forced-retention TTL.
 * These tests exercise the real save path against an in-memory MongoDB to prove the
 * messages now inherit the same retention as their conversation.
 */

jest.mock('~/server/services/Files/process', () => ({
  retrieveAndProcessFile: jest.fn(),
}));

// `countTokens` lazy-loads its tokenizer via a dynamic ESM import that jest cannot
// execute under CommonJS; stub the token count while leaving the rest of the module real.
jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  countTokens: jest.fn().mockResolvedValue(1),
}));

const { v4 } = require('uuid');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createModels } = require('@librechat/data-schemas');
const { RetentionMode } = require('librechat-data-provider');

const { saveUserMessage, saveAssistantMessage } = require('./manage');

describe('Threads/manage forced retention', () => {
  let mongoServer;
  let Message;
  const userId = new mongoose.Types.ObjectId().toString();

  const buildReq = (interfaceConfig) => ({
    user: { id: userId },
    body: {},
    config: { interfaceConfig },
  });

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    createModels(mongoose);
    Message = mongoose.models.Message;
  }, 30000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await Message.deleteMany({});
  });

  it('forces user messages temporary with an expiration in ephemeral mode', async () => {
    const conversationId = v4();
    await saveUserMessage(buildReq({ retentionMode: RetentionMode.EPHEMERAL }), {
      user: userId,
      endpoint: 'assistants',
      messageId: v4(),
      conversationId,
      text: 'hello',
      assistant_id: 'asst_1',
      thread_id: 'thread_1',
    });

    const saved = await Message.findOne({ conversationId }).lean();
    expect(saved).toBeTruthy();
    expect(saved.isTemporary).toBe(true);
    expect(saved.expiredAt).toBeInstanceOf(Date);
    expect(saved.expiredAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('forces assistant messages temporary with an expiration in ephemeral mode', async () => {
    const conversationId = v4();
    await saveAssistantMessage(buildReq({ retentionMode: RetentionMode.EPHEMERAL }), {
      user: userId,
      endpoint: 'assistants',
      messageId: v4(),
      conversationId,
      parentMessageId: v4(),
      text: 'hi there',
      assistant_id: 'asst_1',
      thread_id: 'thread_1',
      content: [{ type: 'text', text: 'hi there' }],
    });

    const saved = await Message.findOne({ conversationId }).lean();
    expect(saved).toBeTruthy();
    expect(saved.isCreatedByUser).toBe(false);
    expect(saved.isTemporary).toBe(true);
    expect(saved.expiredAt).toBeInstanceOf(Date);
    expect(saved.expiredAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('does not force an expiration when retention is not ephemeral', async () => {
    const conversationId = v4();
    await saveUserMessage(buildReq({ retentionMode: RetentionMode.TEMPORARY }), {
      user: userId,
      endpoint: 'assistants',
      messageId: v4(),
      conversationId,
      text: 'hello',
      assistant_id: 'asst_1',
      thread_id: 'thread_1',
    });

    const saved = await Message.findOne({ conversationId }).lean();
    expect(saved).toBeTruthy();
    expect(saved.expiredAt ?? null).toBeNull();
  });
});
