const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { executeConversationImportWrites } = require('@librechat/api');
const { createModels, createMethods, tenantStorage } = require('@librechat/data-schemas');

let mongo;
let methods;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { autoIndex: false });
  createModels(mongoose);
  methods = createMethods(mongoose);
});

afterEach(async () => {
  await mongoose.models.Message.deleteMany({});
  await mongoose.models.Conversation.deleteMany({});
  await mongoose.models.ConversationTag.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe.each([undefined, 'tenant-a'])('failed import catalog ownership (%s)', (tenantId) => {
  it.each([
    ['conversations', false],
    ['conversations', true],
    ['messages', false],
    ['messages', true],
  ])(
    'preserves shared identities after %s failure (concurrent adoption: %s)',
    async (phase, adopt) => {
      await tenantStorage.run({ tenantId }, async () => {
        const scope = { user: 'owner', conversationIds: ['imported'], tenantId };
        await mongoose.models.Conversation.create({
          user: 'owner',
          conversationId: 'existing',
          endpoint: 'openAI',
        });
        const existingTag = await methods.createConversationTag('owner', { tag: 'existing' });
        const batch = [
          {
            user: 'owner',
            conversationId: 'imported',
            endpoint: 'openAI',
            tags: ['existing', 'portable'],
          },
        ];
        let portableId;
        const fail = async () => {
          const tag = await mongoose.models.ConversationTag.findOne({
            user: 'owner',
            tag: 'portable',
          });
          portableId = String(tag._id);
          if (adopt) {
            await methods.updateTagsForConversation(
              'owner',
              'existing',
              [portableId],
              tenantId,
              true,
            );
          }
          throw new Error('import write failed');
        };
        const saveMessages = () =>
          methods.bulkSaveMessages(
            [
              {
                user: 'owner',
                conversationId: 'imported',
                messageId: 'imported-message',
                parentMessageId: '00000000-0000-0000-0000-000000000000',
                text: 'Imported content',
              },
            ],
            true,
          );
        await expect(
          executeConversationImportWrites({
            saveConversations: async () => {
              await methods.bulkSaveConvos(batch);
              if (phase === 'conversations') await fail();
            },
            saveMessages: async () => {
              await saveMessages();
              await fail();
            },
            updateTagCounts: async () => {},
            deleteMessages: () => methods.deleteImportedMessages(scope),
            deleteConversations: () => methods.deleteImportedConversations(scope),
          }),
        ).rejects.toThrow('import write failed');

        expect(
          await mongoose.models.Conversation.countDocuments({ conversationId: 'imported' }),
        ).toBe(0);
        expect(await mongoose.models.Message.countDocuments({ conversationId: 'imported' })).toBe(
          0,
        );
        expect(await methods.getConversationTags('owner', tenantId)).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ _id: existingTag._id, tag: 'existing', count: 0 }),
            expect.objectContaining({ tag: 'portable', count: adopt ? 1 : 0 }),
          ]),
        );
        expect((await methods.getConvo('owner', 'existing')).tagIds).toEqual(
          adopt ? [portableId] : [],
        );

        await executeConversationImportWrites({
          saveConversations: () => methods.bulkSaveConvos(batch),
          saveMessages,
          updateTagCounts: async () => {},
          deleteMessages: () => methods.deleteImportedMessages(scope),
          deleteConversations: () => methods.deleteImportedConversations(scope),
        });
        expect((await methods.getConvo('owner', 'imported')).tagIds).toEqual([
          String(existingTag._id),
          portableId,
        ]);
        expect(await mongoose.models.ConversationTag.countDocuments({ user: 'owner' })).toBe(2);
        expect(await mongoose.models.Message.countDocuments({ conversationId: 'imported' })).toBe(
          1,
        );
      });
    },
  );
});
