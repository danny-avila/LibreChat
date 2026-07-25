import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import type { IConversation } from '~/types';

import convoSchema from '~/schema/convo';

const getTestConversationModel = (): mongoose.Model<IConversation> =>
  (mongoose.models.TestConvo as mongoose.Model<IConversation> | undefined) ??
  mongoose.model<IConversation>('TestConvo', convoSchema);

describe('conversation importedFrom', () => {
  let server: MongoMemoryServer;

  beforeAll(async () => {
    server = await MongoMemoryServer.create();
    await mongoose.connect(server.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await server.stop();
  });

  it('persists importedFrom through strict mode', async () => {
    const Conversation = getTestConversationModel();

    await Conversation.create({
      conversationId: 'c1',
      user: 'u1',
      title: 'Imported',
      endpoint: 'openAI',
      importedFrom: { source: 'chatgpt', externalId: 'ext-1' },
    });

    const found = await Conversation.findOne({
      user: 'u1',
      'importedFrom.source': 'chatgpt',
      'importedFrom.externalId': 'ext-1',
    }).lean();

    expect(found).not.toBeNull();
    expect(found?.importedFrom?.externalId).toBe('ext-1');
  });

  it('leaves importedFrom undefined for normal conversations', async () => {
    const Conversation = getTestConversationModel();

    await Conversation.create({
      conversationId: 'c2',
      user: 'u1',
      title: 'Normal',
      endpoint: 'openAI',
    });
    const found = await Conversation.findOne({ conversationId: 'c2' }).lean();

    expect(found?.importedFrom).toBeUndefined();
  });
});
