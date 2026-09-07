import mongoose from 'mongoose';
import { EModelEndpoint } from 'librechat-data-provider';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMethods, createModels, tenantStorage } from '@librechat/data-schemas';
import type { AllMethods, IConversation, IMessage } from '@librechat/data-schemas';
import { resolveStoredResponse } from './persistence';

const TENANT_A = 'tenant-aaaaaaaaaaaaaaaaaaaa';
const TENANT_B = 'tenant-bbbbbbbbbbbbbbbbbbbb';
const OWNER = 'response-owner';
const FOREIGN_OWNER = 'response-foreign-owner';
const SHARED_CONVERSATION_ID = '5dbb41c5-5c41-4e3b-8488-d110386d6315';
const SHARED_RESPONSE_ID = 'resp_shared_response';

let mongoServer: MongoMemoryServer;
let methods: AllMethods;
let Conversation: mongoose.Model<IConversation>;
let Message: mongoose.Model<IMessage>;

function asTenant<T>(tenantId: string, operation: () => Promise<T>): Promise<T> {
  return tenantStorage.run({ tenantId }, operation);
}

function lookup() {
  return { getConvo: methods.getConvo, getMessage: methods.getMessage };
}

async function seedResponse(
  tenantId: string,
  user: string,
  values: {
    conversationId: string;
    responseId: string;
    title: string;
    text: string;
    conversationTemporary?: boolean;
    conversationExpiredAt?: Date;
    messageTemporary?: boolean;
    messageExpiredAt?: Date;
  },
): Promise<void> {
  await asTenant(tenantId, async () => {
    await Conversation.create({
      conversationId: values.conversationId,
      user,
      title: values.title,
      endpoint: EModelEndpoint.agents,
      isTemporary: values.conversationTemporary ?? false,
      ...(values.conversationExpiredAt == null ? {} : { expiredAt: values.conversationExpiredAt }),
    });
    await Message.create({
      messageId: values.responseId,
      conversationId: values.conversationId,
      user,
      sender: 'Agent',
      text: values.text,
      isCreatedByUser: false,
      isTemporary: values.messageTemporary ?? false,
      ...(values.messageExpiredAt == null ? {} : { expiredAt: values.messageExpiredAt }),
    });
  });
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  methods = createMethods(mongoose);
  Conversation = mongoose.models.Conversation as mongoose.Model<IConversation>;
  Message = mongoose.models.Message as mongoose.Model<IMessage>;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

describe('resolveStoredResponse with Mongo tenant scope', () => {
  it('resolves duplicate response and conversation ids only from the active tenant', async () => {
    await Promise.all([
      seedResponse(TENANT_A, OWNER, {
        conversationId: SHARED_CONVERSATION_ID,
        responseId: SHARED_RESPONSE_ID,
        title: 'tenant A conversation',
        text: 'tenant A response',
      }),
      seedResponse(TENANT_B, OWNER, {
        conversationId: SHARED_CONVERSATION_ID,
        responseId: SHARED_RESPONSE_ID,
        title: 'tenant B conversation',
        text: 'tenant B response',
      }),
    ]);

    const tenantA = await asTenant(TENANT_A, () =>
      resolveStoredResponse(lookup(), OWNER, SHARED_RESPONSE_ID),
    );
    const tenantB = await asTenant(TENANT_B, () =>
      resolveStoredResponse(lookup(), OWNER, SHARED_RESPONSE_ID),
    );

    expect(tenantA).toMatchObject({
      status: 'found',
      reference: {
        conversationId: SHARED_CONVERSATION_ID,
        conversation: { title: 'tenant A conversation', tenantId: TENANT_A },
        responseMessage: { text: 'tenant A response', tenantId: TENANT_A },
      },
    });
    expect(tenantB).toMatchObject({
      status: 'found',
      reference: {
        conversationId: SHARED_CONVERSATION_ID,
        conversation: { title: 'tenant B conversation', tenantId: TENANT_B },
        responseMessage: { text: 'tenant B response', tenantId: TENANT_B },
      },
    });
  });

  it('does not resolve another owner response in the same tenant', async () => {
    await seedResponse(TENANT_A, FOREIGN_OWNER, {
      conversationId: '62bb41c5-5c41-4e3b-8488-d110386d6315',
      responseId: 'resp_foreign_response',
      title: 'foreign',
      text: 'foreign response',
    });

    await expect(
      asTenant(TENANT_A, () => resolveStoredResponse(lookup(), OWNER, 'resp_foreign_response')),
    ).resolves.toEqual({ status: 'not_found' });
  });

  it.each([
    [
      'temporary conversation',
      '72bb41c5-5c41-4e3b-8488-d110386d6315',
      {
        conversationTemporary: true,
      },
    ],
    [
      'expired conversation',
      '73bb41c5-5c41-4e3b-8488-d110386d6315',
      {
        conversationExpiredAt: new Date('2020-01-01T00:00:00.000Z'),
      },
    ],
    [
      'temporary response message',
      '74bb41c5-5c41-4e3b-8488-d110386d6315',
      {
        messageTemporary: true,
      },
    ],
    [
      'expired response message',
      '75bb41c5-5c41-4e3b-8488-d110386d6315',
      {
        messageExpiredAt: new Date('2020-01-01T00:00:00.000Z'),
      },
    ],
  ])('hides a %s', async (_name, conversationId, visibility) => {
    await seedResponse(TENANT_A, OWNER, {
      conversationId,
      responseId: `resp_hidden_${_name.replaceAll(' ', '_')}`,
      title: 'hidden',
      text: 'hidden response',
      ...visibility,
    });

    await expect(
      asTenant(TENANT_A, () =>
        resolveStoredResponse(lookup(), OWNER, `resp_hidden_${_name.replaceAll(' ', '_')}`),
      ),
    ).resolves.toEqual({ status: 'not_found' });
  });
});
