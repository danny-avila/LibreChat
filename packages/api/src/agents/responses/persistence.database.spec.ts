import mongoose from 'mongoose';
import { EModelEndpoint } from 'librechat-data-provider';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMethods, createModels, tenantStorage } from '@librechat/data-schemas';
import type { AllMethods, IConversation, IMessage } from '@librechat/data-schemas';
import type { Response } from './types';
import {
  buildStoredResponseMetadata,
  filterCommittedResponseMessages,
  getStoredResponseSnapshot,
  persistStoredResponse,
  resolveStoredResponse,
} from './persistence';

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

  it('does not let an ordinary conversation save publish a pending Responses turn', async () => {
    const conversationId = '82bb41c5-5c41-4e3b-8488-d110386d6315';
    const responseId = 'resp_pending_browser_save';
    await asTenant(TENANT_A, async () => {
      await Conversation.create({
        conversationId,
        user: OWNER,
        title: 'pending',
        endpoint: EModelEndpoint.agents,
        isTemporary: false,
      });
      await Message.create([
        {
          messageId: 'pending-input',
          conversationId,
          user: OWNER,
          sender: 'User',
          text: 'question',
          isCreatedByUser: true,
          isUserSubmitted: true,
          metadata: {
            responsesTurn: { version: 1, responseId },
            responsesInput: { role: 'user' },
          },
        },
        {
          messageId: responseId,
          conversationId,
          user: OWNER,
          sender: 'Agent',
          text: 'answer',
          isCreatedByUser: false,
          isUserSubmitted: false,
          metadata: buildStoredResponseMetadata(storedResponse({ id: responseId })),
        },
      ]);

      await methods.saveConvo({ userId: OWNER }, { conversationId, title: 'renamed by browser' });
      const rebuilt = await methods.getConvo(OWNER, conversationId);
      const messages = await methods.getMessages({ user: OWNER, conversationId });

      expect(rebuilt?.messages).toHaveLength(2);
      expect(messages).toEqual([]);
      expect(await methods.getMessage({ user: OWNER, messageId: responseId })).toBeNull();
      expect(await methods.getMessagesByCursor({ user: OWNER, conversationId })).toEqual({
        messages: [],
        nextCursor: null,
      });
      await expect(resolveStoredResponse(lookup(), OWNER, responseId)).resolves.toEqual({
        status: 'not_found',
      });
    });
  });

  it('publishes one complete turn only after the manifest and output marker commit', async () => {
    const conversationId = '92bb41c5-5c41-4e3b-8488-d110386d6315';
    const responseId = 'resp_committed_turn';
    const response = storedResponse({ id: responseId });

    await asTenant(TENANT_A, async () => {
      const result = await persistStoredResponse({
        deps: {
          saveConvo: methods.saveConvo,
          saveMessage: methods.saveMessage,
          getConvo: methods.getConvo,
          getMessage: methods.getMessage,
          commitStoredResponseTurn: methods.commitStoredResponseTurn,
          deleteStoredResponseTurn: methods.deleteStoredResponseTurn,
          createMessageId: () => 'committed-input',
        },
        context: { userId: OWNER },
        conversation: {
          data: { conversationId, endpoint: EModelEndpoint.agents, agent_id: 'agent-1' },
          initialAgentId: 'agent-1',
          isContinuation: false,
        },
        inputMessages: [{ role: 'user', content: 'question' }],
        parentMessageId: null,
        responseId,
        response,
        agentId: 'agent-1',
      });
      const messages = await methods.getMessages({ user: OWNER, conversationId });

      expect(filterCommittedResponseMessages(messages)).toHaveLength(2);
      expect(getStoredResponseSnapshot(result.outputMessage)).toEqual({
        response,
        output: response.output,
        usage: response.usage,
        previousResponseId: response.previous_response_id,
      });
      await expect(resolveStoredResponse(lookup(), OWNER, responseId)).resolves.toMatchObject({
        status: 'found',
        reference: { responseMessage: { messageId: responseId } },
      });
    });
  });

  it('keeps an ambiguously failed publication hidden from ordinary reads', async () => {
    const conversationId = 'b2bb41c5-5c41-4e3b-8488-d110386d6315';
    const responseId = 'resp_failed_publication';
    await asTenant(TENANT_A, async () => {
      await expect(
        persistStoredResponse({
          deps: {
            ...methods,
            commitStoredResponseTurn: async () => {
              throw new Error('unavailable');
            },
          },
          context: { userId: OWNER, isTemporary: false },
          conversation: {
            data: { conversationId, endpoint: EModelEndpoint.agents, title: 'failed turn' },
            initialAgentId: null,
            isContinuation: false,
          },
          inputMessages: [{ role: 'user', content: 'question' }],
          parentMessageId: null,
          responseId,
          response: storedResponse({ id: responseId }),
          agentId: 'agent-1',
        }),
      ).rejects.toThrow();
      expect(await Message.find({ user: OWNER, conversationId })).toHaveLength(2);
      expect(await methods.getMessages({ user: OWNER, conversationId })).toEqual([]);
      expect(await methods.getMessage({ user: OWNER, messageId: responseId })).toBeNull();
      expect(await methods.getMessagesByCursor({ user: OWNER, conversationId })).toEqual({
        messages: [],
        nextCursor: null,
      });
    });
  });

  it('preserves both turns when concurrent Responses commits append to one conversation', async () => {
    const conversationId = 'a2bb41c5-5c41-4e3b-8488-d110386d6315';
    await asTenant(TENANT_A, async () => {
      await methods.saveConvo(
        { userId: OWNER },
        { conversationId, endpoint: EModelEndpoint.agents, agent_id: 'agent-1' },
        { appendMessageIds: [] },
      );
      const persist = (responseId: string, inputId: string) =>
        persistStoredResponse({
          deps: {
            saveConvo: methods.saveConvo,
            saveMessage: methods.saveMessage,
            getConvo: methods.getConvo,
            getMessage: methods.getMessage,
            commitStoredResponseTurn: methods.commitStoredResponseTurn,
            deleteStoredResponseTurn: methods.deleteStoredResponseTurn,
            createMessageId: () => inputId,
          },
          context: { userId: OWNER },
          conversation: {
            data: { conversationId, endpoint: EModelEndpoint.agents, agent_id: 'agent-1' },
            initialAgentId: 'agent-1',
            isContinuation: true,
          },
          inputMessages: [{ role: 'user', content: inputId }],
          parentMessageId: null,
          responseId,
          response: storedResponse({ id: responseId }),
          agentId: 'agent-1',
        });

      await Promise.all([
        persist('resp_concurrent_a', 'concurrent-input-a'),
        persist('resp_concurrent_b', 'concurrent-input-b'),
      ]);
      const storedConversation = await methods.getConvo(OWNER, conversationId);
      const messages = await methods.getMessages({ user: OWNER, conversationId });

      expect(storedConversation?.messages).toHaveLength(4);
      expect(filterCommittedResponseMessages(messages)).toHaveLength(4);
    });
  });

  it('does not recreate a deleted pending output and cleans only its exact turn', async () => {
    const conversationId = 'b2bb41c5-5c41-4e3b-8488-d110386d6315';
    const responseId = 'resp_deleted_pending';
    await asTenant(TENANT_A, async () => {
      await Message.create([
        {
          messageId: 'deleted-turn-input',
          conversationId,
          user: OWNER,
          isCreatedByUser: true,
          isUserSubmitted: true,
          metadata: {
            responsesTurn: { version: 1, responseId },
            responsesInput: { role: 'user' },
          },
        },
        {
          messageId: responseId,
          conversationId,
          user: OWNER,
          isCreatedByUser: false,
          isUserSubmitted: false,
          metadata: buildStoredResponseMetadata(storedResponse({ id: responseId })),
        },
        {
          messageId: 'sibling-turn',
          conversationId,
          user: OWNER,
          isCreatedByUser: false,
          isUserSubmitted: false,
          metadata: buildStoredResponseMetadata(
            storedResponse({ id: 'sibling-turn' }),
            'committed',
          ),
        },
      ]);
      await Message.deleteOne({ user: OWNER, conversationId, messageId: responseId });

      await expect(
        methods.commitStoredResponseTurn({ userId: OWNER, conversationId, responseId }),
      ).resolves.toBeNull();
      await methods.deleteStoredResponseTurn({ userId: OWNER, conversationId, responseId });

      expect(
        await Message.exists({ user: OWNER, conversationId, messageId: responseId }),
      ).toBeNull();
      expect(
        await Message.exists({ user: OWNER, conversationId, messageId: 'deleted-turn-input' }),
      ).toBeNull();
      expect(
        await Message.exists({ user: OWNER, conversationId, messageId: 'sibling-turn' }),
      ).not.toBeNull();
    });
  });
});

function storedResponse(overrides: Partial<Response> = {}): Response {
  return {
    id: 'resp_stored',
    object: 'response',
    instructions: 'Use the supplied context.',
    created_at: 1700000000,
    completed_at: 1700000060,
    status: 'completed',
    previous_response_id: null,
    output: [
      {
        type: 'message',
        id: 'output-item',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: 'answer', annotations: [], logprobs: [] }],
      },
    ],
    usage: {
      input_tokens: 4,
      output_tokens: 2,
      total_tokens: 6,
      input_tokens_details: { cached_tokens: 1 },
      output_tokens_details: { reasoning_tokens: 0 },
      primary: { input_tokens: 4, output_tokens: 2, total_tokens: 6 },
      subagent: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    },
    ...overrides,
  } as Response;
}
