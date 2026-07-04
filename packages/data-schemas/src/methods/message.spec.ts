import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { RetentionMode } from 'librechat-data-provider';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { IChatProject, IConversation, IMessage, IMongoFile, ISharedLink } from '..';
import { cascadeForcedConversationRetention, sweepForcedRetention } from '../utils/retention';
import { tenantStorage, runAsSystem } from '~/config/tenantContext';
import { createMessageMethods } from './message';
import { createModels } from '../models';
import logger from '~/config/winston';

const waitForTimestampTick = () => new Promise((resolve) => setTimeout(resolve, 2));

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: InstanceType<typeof MongoMemoryServer>;
let Message: mongoose.Model<IMessage>;
let saveMessage: ReturnType<typeof createMessageMethods>['saveMessage'];
let getMessages: ReturnType<typeof createMessageMethods>['getMessages'];
let updateMessage: ReturnType<typeof createMessageMethods>['updateMessage'];
let updateToolCallResult: ReturnType<typeof createMessageMethods>['updateToolCallResult'];
let applyForcedRetention: ReturnType<typeof createMessageMethods>['applyForcedRetention'];
let applyForcedRetentionToTag: ReturnType<typeof createMessageMethods>['applyForcedRetentionToTag'];
let deleteMessages: ReturnType<typeof createMessageMethods>['deleteMessages'];
let bulkSaveMessages: ReturnType<typeof createMessageMethods>['bulkSaveMessages'];
let updateMessageText: ReturnType<typeof createMessageMethods>['updateMessageText'];
let deleteMessagesSince: ReturnType<typeof createMessageMethods>['deleteMessagesSince'];
let recordMessage: ReturnType<typeof createMessageMethods>['recordMessage'];

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();

  const models = createModels(mongoose);
  Object.assign(mongoose.models, models);
  Message = mongoose.models.Message;

  const methods = createMessageMethods(mongoose);
  saveMessage = methods.saveMessage;
  getMessages = methods.getMessages;
  updateMessage = methods.updateMessage;
  updateToolCallResult = methods.updateToolCallResult;
  applyForcedRetention = methods.applyForcedRetention;
  applyForcedRetentionToTag = methods.applyForcedRetentionToTag;
  deleteMessages = methods.deleteMessages;
  bulkSaveMessages = methods.bulkSaveMessages;
  updateMessageText = methods.updateMessageText;
  deleteMessagesSince = methods.deleteMessagesSince;
  recordMessage = methods.recordMessage;

  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Message Operations', () => {
  let mockCtx: {
    userId: string;
    isTemporary?: boolean;
    interfaceConfig?: { temporaryChatRetention?: number; retentionMode?: RetentionMode };
  };
  let mockMessageData: Partial<IMessage> = {
    messageId: 'msg123',
    conversationId: uuidv4(),
    text: 'Hello, world!',
    user: 'user123',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Clear database
    await Message.deleteMany({});

    mockCtx = {
      userId: 'user123',
      interfaceConfig: {
        temporaryChatRetention: 24, // Default 24 hours
      },
    };

    mockMessageData = {
      messageId: 'msg123',
      conversationId: uuidv4(),
      text: 'Hello, world!',
      user: 'user123',
    };
  });

  describe('saveMessage', () => {
    it('should save a message for an authenticated user', async () => {
      const result = await saveMessage(mockCtx, mockMessageData);

      expect(result?.messageId).toBe('msg123');
      expect(result?.user).toBe('user123');
      expect(result?.text).toBe('Hello, world!');

      // Verify the message was actually saved to the database
      const savedMessage = await Message.findOne({ messageId: 'msg123', user: 'user123' });
      expect(savedMessage).toBeTruthy();
      expect(savedMessage?.text).toBe('Hello, world!');
    });

    it('should throw an error for unauthenticated user', async () => {
      mockCtx.userId = null as unknown as string;
      await expect(saveMessage(mockCtx, mockMessageData)).rejects.toThrow('User not authenticated');
    });

    it('should handle invalid conversation ID gracefully', async () => {
      mockMessageData.conversationId = 'invalid-id';
      const result = await saveMessage(mockCtx, mockMessageData);
      expect(result).toBeUndefined();
    });

    it('should not log message params for invalid conversation IDs', async () => {
      mockMessageData.conversationId = 'invalid-id';
      mockMessageData.text = 'Sensitive prompt text';

      await saveMessage(mockCtx, mockMessageData, { context: 'message-save-test' });

      expect(logger.warn).toHaveBeenCalledWith(
        'Invalid conversation ID: invalid-id (context: message-save-test)',
      );
      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe('updateMessageText', () => {
    it('should update message text for the authenticated user', async () => {
      // First save a message
      await saveMessage(mockCtx, mockMessageData);

      // Then update it
      await updateMessageText(mockCtx.userId, { messageId: 'msg123', text: 'Updated text' });

      // Verify the update
      const updatedMessage = await Message.findOne({ messageId: 'msg123', user: 'user123' });
      expect(updatedMessage?.text).toBe('Updated text');
    });
  });

  describe('updateMessage', () => {
    it('should update a message for the authenticated user', async () => {
      // First save a message
      await saveMessage(mockCtx, mockMessageData);

      const result = await updateMessage(mockCtx.userId, {
        messageId: 'msg123',
        text: 'Updated text',
      });

      expect(result?.messageId).toBe('msg123');
      expect(result?.text).toBe('Updated text');

      // Verify in database
      const updatedMessage = await Message.findOne({ messageId: 'msg123', user: 'user123' });
      expect(updatedMessage?.text).toBe('Updated text');
    });

    it('should throw an error if message is not found', async () => {
      await expect(
        updateMessage(mockCtx.userId, { messageId: 'nonexistent', text: 'Test' }),
      ).rejects.toThrow('Message not found or user not authorized.');
    });
  });

  describe('updateToolCallResult', () => {
    const toolCallContent = () => [
      { type: 'text', text: 'intro' },
      {
        type: 'tool_call',
        tool_call: {
          id: 'call_bg',
          name: 'execute_code',
          args: '{"lang":"py","code":"print(1)"}',
          output: '{"background_task_id":"task-1"}',
          progress: 1,
        },
      },
      {
        type: 'tool_call',
        tool_call: { id: 'call_other', name: 'execute_code', args: '{}', output: 'untouched' },
      },
    ];

    it('patches only the matching tool_call part and appends attachments atomically', async () => {
      await saveMessage(mockCtx, { ...mockMessageData, content: toolCallContent() });

      const result = await updateToolCallResult({
        userId: 'user123',
        messageId: 'msg123',
        conversationId: mockMessageData.conversationId as string,
        toolCallId: 'call_bg',
        output: 'stdout:\nhello',
        attachments: [{ file_id: 'f1', toolCallId: 'call_bg' }],
      });
      expect(result).toEqual({ matched: true, unfinished: false });

      const saved = await Message.findOne({ messageId: 'msg123', user: 'user123' }).lean();
      const content = saved?.content as Array<{
        type: string;
        tool_call?: { id: string; output?: string };
      }>;
      expect(content[1].tool_call?.output).toBe('stdout:\nhello');
      expect(content[2].tool_call?.output).toBe('untouched');
      expect(saved?.attachments).toEqual([{ file_id: 'f1', toolCallId: 'call_bg' }]);
    });

    it('appends to existing attachments instead of replacing them', async () => {
      await saveMessage(mockCtx, {
        ...mockMessageData,
        content: toolCallContent(),
        attachments: [{ file_id: 'existing' }] as unknown as IMessage['attachments'],
      });

      await updateToolCallResult({
        userId: 'user123',
        messageId: 'msg123',
        conversationId: mockMessageData.conversationId as string,
        toolCallId: 'call_bg',
        attachments: [{ file_id: 'f2' }],
      });

      const saved = await Message.findOne({ messageId: 'msg123', user: 'user123' }).lean();
      expect(saved?.attachments).toEqual([{ file_id: 'existing' }, { file_id: 'f2' }]);
    });

    it('is idempotent: re-applying the same patch does not duplicate attachments', async () => {
      await saveMessage(mockCtx, { ...mockMessageData, content: toolCallContent() });

      const patch = {
        userId: 'user123',
        messageId: 'msg123',
        conversationId: mockMessageData.conversationId as string,
        toolCallId: 'call_bg',
        output: 'stdout:\nhello',
        attachments: [{ file_id: 'f1', toolCallId: 'call_bg' }],
      };
      await updateToolCallResult(patch);
      await updateToolCallResult(patch);

      const saved = await Message.findOne({ messageId: 'msg123', user: 'user123' }).lean();
      expect(saved?.attachments).toEqual([{ file_id: 'f1', toolCallId: 'call_bg' }]);
      const content = saved?.content as Array<{ tool_call?: { output?: string } }>;
      expect(content[1].tool_call?.output).toBe('stdout:\nhello');
    });

    it('dedupes download-fallback attachments (no file_id) by filepath on re-apply', async () => {
      await saveMessage(mockCtx, { ...mockMessageData, content: toolCallContent() });

      const patch = {
        userId: 'user123',
        messageId: 'msg123',
        conversationId: mockMessageData.conversationId as string,
        toolCallId: 'call_bg',
        attachments: [
          {
            filepath: '/api/files/code/download/sess-1/f1',
            filename: 'big.zip',
            toolCallId: 'call_bg',
          },
          { file_id: 'f2', toolCallId: 'call_bg' },
        ],
      };
      await updateToolCallResult(patch);
      await updateToolCallResult(patch);

      const saved = await Message.findOne({ messageId: 'msg123', user: 'user123' }).lean();
      expect(saved?.attachments).toEqual([
        {
          filepath: '/api/files/code/download/sess-1/f1',
          filename: 'big.zip',
          toolCallId: 'call_bg',
        },
        { file_id: 'f2', toolCallId: 'call_bg' },
      ]);
    });

    it('returns false when the message row does not exist yet (caller retries)', async () => {
      const result = await updateToolCallResult({
        userId: 'user123',
        messageId: 'missing-msg',
        conversationId: mockMessageData.conversationId as string,
        toolCallId: 'call_bg',
        output: 'stdout',
      });
      expect(result.matched).toBe(false);
    });

    it('scopes the patch by agentId when provider ids repeat across agents', async () => {
      /* Handoff runs append multiple agents' parts to ONE response message,
       * and provider ids like call_0 repeat per model response. */
      await saveMessage(mockCtx, {
        ...mockMessageData,
        content: [
          {
            type: 'tool_call',
            agentId: 'agent_a',
            tool_call: { id: 'call_0', name: 'execute_code', output: 'handle-a' },
          },
          {
            type: 'tool_call',
            agentId: 'agent_b',
            tool_call: { id: 'call_0', name: 'execute_code', output: 'handle-b' },
          },
        ],
      });

      const result = await updateToolCallResult({
        userId: 'user123',
        messageId: 'msg123',
        conversationId: mockMessageData.conversationId as string,
        toolCallId: 'call_0',
        agentId: 'agent_b',
        output: 'stdout-b',
      });
      expect(result.matched).toBe(true);

      const saved = await Message.findOne({ messageId: 'msg123', user: 'user123' }).lean();
      const content = saved?.content as Array<{ tool_call?: { output?: string } }>;
      expect(content[0].tool_call?.output).toBe('handle-a');
      expect(content[1].tool_call?.output).toBe('stdout-b');
    });

    it('flags unfinished partial rows so callers keep re-applying until finalize', async () => {
      await saveMessage(mockCtx, {
        ...mockMessageData,
        content: toolCallContent(),
        unfinished: true,
      } as Parameters<typeof saveMessage>[1]);

      const result = await updateToolCallResult({
        userId: 'user123',
        messageId: 'msg123',
        conversationId: mockMessageData.conversationId as string,
        toolCallId: 'call_bg',
        output: 'stdout:\nhello',
      });
      /** The patch still lands (idempotent), but the finalize save will
       *  overwrite this partial row with in-memory content. */
      expect(result).toEqual({ matched: true, unfinished: true });
    });

    it('keeps a sibling AGENT’s attachment when both id and file key collide', async () => {
      /* Handoff agents can share a provider tool-call id AND a claimed
       * file_id (same filename in one conversation); the second agent's
       * anchor must not evict the first agent's card-scoped attachment. */
      await saveMessage(mockCtx, { ...mockMessageData, content: toolCallContent() });

      await updateToolCallResult({
        userId: 'user123',
        messageId: 'msg123',
        conversationId: mockMessageData.conversationId as string,
        toolCallId: 'call_bg',
        agentId: 'agent_a',
        attachments: [{ file_id: 'shared', toolCallId: 'call_bg', agentId: 'agent_a' }],
      });
      await updateToolCallResult({
        userId: 'user123',
        messageId: 'msg123',
        conversationId: mockMessageData.conversationId as string,
        toolCallId: 'call_bg',
        agentId: 'agent_b',
        attachments: [{ file_id: 'shared', toolCallId: 'call_bg', agentId: 'agent_b' }],
      });

      const saved = await Message.findOne({ messageId: 'msg123', user: 'user123' }).lean();
      expect(saved?.attachments).toEqual([
        { file_id: 'shared', toolCallId: 'call_bg', agentId: 'agent_a' },
        { file_id: 'shared', toolCallId: 'call_bg', agentId: 'agent_b' },
      ]);
    });

    it('keeps a sibling tool call’s attachment when file ids repeat across calls', async () => {
      await saveMessage(mockCtx, { ...mockMessageData, content: toolCallContent() });

      await updateToolCallResult({
        userId: 'user123',
        messageId: 'msg123',
        conversationId: mockMessageData.conversationId as string,
        toolCallId: 'call_bg',
        attachments: [{ file_id: 'shared', toolCallId: 'call_bg' }],
      });
      /** A second background call regenerated the same filename — same
       *  claimed file_id, different tool call. The first card must keep
       *  its attachment (the client anchors by toolCallId). */
      await updateToolCallResult({
        userId: 'user123',
        messageId: 'msg123',
        conversationId: mockMessageData.conversationId as string,
        toolCallId: 'call_other',
        attachments: [{ file_id: 'shared', toolCallId: 'call_other' }],
      });

      const saved = await Message.findOne({ messageId: 'msg123', user: 'user123' }).lean();
      expect(saved?.attachments).toEqual([
        { file_id: 'shared', toolCallId: 'call_bg' },
        { file_id: 'shared', toolCallId: 'call_other' },
      ]);
    });

    it('does not match another user’s message', async () => {
      await saveMessage(mockCtx, { ...mockMessageData, content: toolCallContent() });

      const result = await updateToolCallResult({
        userId: 'someone-else',
        messageId: 'msg123',
        conversationId: mockMessageData.conversationId as string,
        toolCallId: 'call_bg',
        output: 'hijacked',
      });
      expect(result.matched).toBe(false);

      const saved = await Message.findOne({ messageId: 'msg123', user: 'user123' }).lean();
      const content = saved?.content as Array<{ tool_call?: { output?: string } }>;
      expect(content[1].tool_call?.output).toBe('{"background_task_id":"task-1"}');
    });
  });

  describe('deleteMessagesSince', () => {
    it('should delete messages only for the authenticated user', async () => {
      const conversationId = uuidv4();

      // Create multiple messages in the same conversation
      await saveMessage(mockCtx, {
        messageId: 'msg1',
        conversationId,
        text: 'First message',
        user: 'user123',
      });

      await saveMessage(mockCtx, {
        messageId: 'msg2',
        conversationId,
        text: 'Second message',
        user: 'user123',
      });

      await waitForTimestampTick();

      await saveMessage(mockCtx, {
        messageId: 'msg3',
        conversationId,
        text: 'Third message',
        user: 'user123',
      });

      // Delete messages since message2 (this should only delete messages created AFTER msg2)
      await deleteMessagesSince(mockCtx.userId, {
        messageId: 'msg2',
        conversationId,
      });

      // Verify msg1 and msg2 remain, msg3 is deleted
      const remainingMessages = await Message.find({ conversationId, user: 'user123' });
      expect(remainingMessages).toHaveLength(2);
      expect(remainingMessages.map((m) => m.messageId)).toContain('msg1');
      expect(remainingMessages.map((m) => m.messageId)).toContain('msg2');
      expect(remainingMessages.map((m) => m.messageId)).not.toContain('msg3');
    });

    it('should return undefined if no message is found', async () => {
      const result = await deleteMessagesSince(mockCtx.userId, {
        messageId: 'nonexistent',
        conversationId: 'convo123',
      });
      expect(result).toBeUndefined();
    });
  });

  describe('getMessages', () => {
    it('should retrieve messages with the correct filter', async () => {
      const conversationId = uuidv4();

      // Save some messages
      await saveMessage(mockCtx, {
        messageId: 'msg1',
        conversationId,
        text: 'First message',
        user: 'user123',
      });

      await saveMessage(mockCtx, {
        messageId: 'msg2',
        conversationId,
        text: 'Second message',
        user: 'user123',
      });

      const messages = await getMessages({ conversationId });
      expect(messages).toHaveLength(2);
      expect(messages[0].text).toBe('First message');
      expect(messages[1].text).toBe('Second message');
    });

    it('should limit retrieved messages when requested', async () => {
      const conversationId = uuidv4();

      await saveMessage(mockCtx, {
        messageId: 'msg1',
        conversationId,
        text: 'First message',
        user: 'user123',
      });

      await saveMessage(mockCtx, {
        messageId: 'msg2',
        conversationId,
        text: 'Second message',
        user: 'user123',
      });

      await saveMessage(mockCtx, {
        messageId: 'msg3',
        conversationId,
        text: 'Third message',
        user: 'user123',
      });

      const messages = await getMessages({ conversationId }, undefined, { limit: 2 });

      expect(messages).toHaveLength(2);
      expect(messages[0].text).toBe('First message');
      expect(messages[1].text).toBe('Second message');
    });
  });

  describe('deleteMessages', () => {
    it('should delete messages with the correct filter', async () => {
      // Save some messages for different users
      await saveMessage(mockCtx, mockMessageData);
      await saveMessage(
        { userId: 'user456' },
        {
          messageId: 'msg456',
          conversationId: uuidv4(),
          text: 'Other user message',
          user: 'user456',
        },
      );

      await deleteMessages({ user: 'user123' });

      // Verify only user123's messages were deleted
      const user123Messages = await Message.find({ user: 'user123' });
      const user456Messages = await Message.find({ user: 'user456' });

      expect(user123Messages).toHaveLength(0);
      expect(user456Messages).toHaveLength(1);
    });
  });

  describe('Conversation Hijacking Prevention', () => {
    it("should not allow editing a message in another user's conversation", async () => {
      const victimConversationId = uuidv4();
      const victimMessageId = 'victim-msg-123';

      // First, save a message as the victim (but we'll try to edit as attacker)
      await saveMessage(
        { userId: 'victim123' },
        {
          messageId: victimMessageId,
          conversationId: victimConversationId,
          text: 'Victim message',
          user: 'victim123',
        },
      );

      // Attacker tries to edit the victim's message
      await expect(
        updateMessage('attacker123', {
          messageId: victimMessageId,
          conversationId: victimConversationId,
          text: 'Hacked message',
        }),
      ).rejects.toThrow('Message not found or user not authorized.');

      // Verify the original message is unchanged
      const originalMessage = await Message.findOne({
        messageId: victimMessageId,
        user: 'victim123',
      });
      expect(originalMessage?.text).toBe('Victim message');
    });

    it("should not allow deleting messages from another user's conversation", async () => {
      const victimConversationId = uuidv4();
      const victimMessageId = 'victim-msg-123';

      // Save a message as the victim
      await saveMessage(
        { userId: 'victim123' },
        {
          messageId: victimMessageId,
          conversationId: victimConversationId,
          text: 'Victim message',
          user: 'victim123',
        },
      );

      // Attacker tries to delete from victim's conversation
      const result = await deleteMessagesSince('attacker123', {
        messageId: victimMessageId,
        conversationId: victimConversationId,
      });

      expect(result).toBeUndefined();

      // Verify the victim's message still exists
      const victimMessage = await Message.findOne({
        messageId: victimMessageId,
        user: 'victim123',
      });
      expect(victimMessage).toBeTruthy();
      expect(victimMessage?.text).toBe('Victim message');
    });

    it("should not allow inserting a new message into another user's conversation", async () => {
      const victimConversationId = uuidv4();

      // Attacker tries to save a message - this should succeed but with attacker's user ID
      const result = await saveMessage(
        { userId: 'attacker123' },
        {
          conversationId: victimConversationId,
          text: 'Inserted malicious message',
          messageId: 'new-msg-123',
          user: 'attacker123',
        },
      );

      expect(result).toBeTruthy();
      expect(result?.user).toBe('attacker123');

      // Verify the message was saved with the attacker's user ID, not as an anonymous message
      const savedMessage = await Message.findOne({ messageId: 'new-msg-123' });
      expect(savedMessage?.user).toBe('attacker123');
      expect(savedMessage?.conversationId).toBe(victimConversationId);
    });

    it('should allow retrieving messages from any conversation', async () => {
      const victimConversationId = uuidv4();

      // Save a message in the victim's conversation
      await saveMessage(
        { userId: 'victim123' },
        {
          messageId: 'victim-msg',
          conversationId: victimConversationId,
          text: 'Victim message',
          user: 'victim123',
        },
      );

      // Anyone should be able to retrieve messages by conversation ID
      const messages = await getMessages({ conversationId: victimConversationId });
      expect(messages).toHaveLength(1);
      expect(messages[0].text).toBe('Victim message');
    });
  });

  describe('isTemporary message handling', () => {
    beforeEach(() => {
      // Reset mocks before each test
      jest.clearAllMocks();
    });

    it('should save a message with expiredAt when isTemporary is true', async () => {
      // Mock app config with 24 hour retention
      mockCtx.interfaceConfig = { temporaryChatRetention: 24 };

      mockCtx.isTemporary = true;

      const beforeSave = new Date();
      const result = await saveMessage(mockCtx, mockMessageData);
      const afterSave = new Date();

      expect(result?.messageId).toBe('msg123');
      expect(result?.expiredAt).toBeDefined();
      expect(result?.expiredAt).toBeInstanceOf(Date);

      // Verify expiredAt is approximately 24 hours in the future
      const expectedExpirationTime = new Date(beforeSave.getTime() + 24 * 60 * 60 * 1000);
      const actualExpirationTime = new Date(result?.expiredAt ?? 0);

      expect(actualExpirationTime.getTime()).toBeGreaterThanOrEqual(
        expectedExpirationTime.getTime() - 1000,
      );
      expect(actualExpirationTime.getTime()).toBeLessThanOrEqual(
        new Date(afterSave.getTime() + 24 * 60 * 60 * 1000 + 1000).getTime(),
      );
    });

    it('should save a message without expiredAt when isTemporary is false', async () => {
      mockCtx.isTemporary = false;

      const result = await saveMessage(mockCtx, mockMessageData);

      expect(result?.messageId).toBe('msg123');
      expect(result?.expiredAt).toBeNull();
    });

    it('should save a message without expiredAt when isTemporary is not provided', async () => {
      // No isTemporary set

      const result = await saveMessage(mockCtx, mockMessageData);

      expect(result?.messageId).toBe('msg123');
      expect(result?.expiredAt).toBeUndefined();
    });

    it('should use custom retention period from config', async () => {
      // Mock app config with 48 hour retention
      mockCtx.interfaceConfig = { temporaryChatRetention: 48 };

      mockCtx.isTemporary = true;

      const beforeSave = new Date();
      const result = await saveMessage(mockCtx, mockMessageData);

      expect(result?.expiredAt).toBeDefined();

      // Verify expiredAt is approximately 48 hours in the future
      const expectedExpirationTime = new Date(beforeSave.getTime() + 48 * 60 * 60 * 1000);
      const actualExpirationTime = new Date(result?.expiredAt ?? 0);

      expect(actualExpirationTime.getTime()).toBeGreaterThanOrEqual(
        expectedExpirationTime.getTime() - 1000,
      );
      expect(actualExpirationTime.getTime()).toBeLessThanOrEqual(
        expectedExpirationTime.getTime() + 1000,
      );
    });

    it('should handle minimum retention period (1 hour)', async () => {
      // Mock app config with less than minimum retention
      mockCtx.interfaceConfig = { temporaryChatRetention: 0.5 }; // Half hour - should be clamped to 1 hour

      mockCtx.isTemporary = true;

      const beforeSave = new Date();
      const result = await saveMessage(mockCtx, mockMessageData);

      expect(result?.expiredAt).toBeDefined();

      // Verify expiredAt is approximately 1 hour in the future (minimum)
      const expectedExpirationTime = new Date(beforeSave.getTime() + 1 * 60 * 60 * 1000);
      const actualExpirationTime = new Date(result?.expiredAt ?? 0);

      expect(actualExpirationTime.getTime()).toBeGreaterThanOrEqual(
        expectedExpirationTime.getTime() - 1000,
      );
      expect(actualExpirationTime.getTime()).toBeLessThanOrEqual(
        expectedExpirationTime.getTime() + 1000,
      );
    });

    it('should handle maximum retention period (8760 hours)', async () => {
      // Mock app config with more than maximum retention
      mockCtx.interfaceConfig = { temporaryChatRetention: 10000 }; // Should be clamped to 8760 hours

      mockCtx.isTemporary = true;

      const beforeSave = new Date();
      const result = await saveMessage(mockCtx, mockMessageData);

      expect(result?.expiredAt).toBeDefined();

      // Verify expiredAt is approximately 8760 hours (1 year) in the future
      const expectedExpirationTime = new Date(beforeSave.getTime() + 8760 * 60 * 60 * 1000);
      const actualExpirationTime = new Date(result?.expiredAt ?? 0);

      expect(actualExpirationTime.getTime()).toBeGreaterThanOrEqual(
        expectedExpirationTime.getTime() - 1000,
      );
      expect(actualExpirationTime.getTime()).toBeLessThanOrEqual(
        expectedExpirationTime.getTime() + 1000,
      );
    });

    it('should set expiredAt for non-temporary message when retentionMode is ALL', async () => {
      mockCtx.isTemporary = false;
      mockCtx.interfaceConfig = {
        temporaryChatRetention: 24,
        retentionMode: RetentionMode.ALL,
      };
      const result = await saveMessage(mockCtx, mockMessageData);
      expect(result?.expiredAt).toBeDefined();
      expect(result?.expiredAt).toBeInstanceOf(Date);
    });

    it('should mark retained message non-temporary when retentionMode is ALL and isTemporary is omitted', async () => {
      mockCtx.isTemporary = undefined;
      mockCtx.interfaceConfig = {
        temporaryChatRetention: 24,
        retentionMode: RetentionMode.ALL,
      };

      const result = await saveMessage(mockCtx, mockMessageData);

      expect(result?.expiredAt).toBeDefined();
      expect(result?.isTemporary).toBe(false);
    });

    it('should preserve existing temporary flag when retentionMode is ALL and isTemporary is omitted', async () => {
      mockCtx.isTemporary = true;
      mockCtx.interfaceConfig = {
        temporaryChatRetention: 24,
        retentionMode: RetentionMode.ALL,
      };

      const firstSave = await saveMessage(mockCtx, mockMessageData);

      mockCtx.isTemporary = undefined;
      const secondSave = await saveMessage(mockCtx, {
        ...mockMessageData,
        text: 'Updated text',
      });

      expect(firstSave?.isTemporary).toBe(true);
      expect(secondSave?.text).toBe('Updated text');
      expect(secondSave?.isTemporary).toBe(true);
      expect(secondSave?.expiredAt).toBeDefined();
    });

    it('should not set expiredAt when retentionMode is temporary and not isTemporary', async () => {
      mockCtx.isTemporary = false;
      mockCtx.interfaceConfig = {
        temporaryChatRetention: 24,
        retentionMode: RetentionMode.TEMPORARY,
      };
      const result = await saveMessage(mockCtx, mockMessageData);
      expect(result?.expiredAt).toBeNull();
    });

    it('should force temporary message and set expiredAt when retentionMode is EPHEMERAL even if isTemporary is false', async () => {
      mockCtx.isTemporary = false;
      mockCtx.interfaceConfig = {
        temporaryChatRetention: 24,
        retentionMode: RetentionMode.EPHEMERAL,
      };
      const result = await saveMessage(mockCtx, mockMessageData);
      expect(result?.isTemporary).toBe(true);
      expect(result?.expiredAt).toBeDefined();
      expect(result?.expiredAt).toBeInstanceOf(Date);
    });

    it('should force temporary message when retentionMode is EPHEMERAL and isTemporary is omitted', async () => {
      mockCtx.isTemporary = undefined;
      mockCtx.interfaceConfig = {
        temporaryChatRetention: 24,
        retentionMode: RetentionMode.EPHEMERAL,
      };
      const result = await saveMessage(mockCtx, mockMessageData);
      expect(result?.isTemporary).toBe(true);
      expect(result?.expiredAt).toBeDefined();
      expect(result?.expiredAt).toBeInstanceOf(Date);
    });

    it('should handle missing config gracefully', async () => {
      // Simulate missing config - should use default retention period
      delete mockCtx.interfaceConfig;

      mockCtx.isTemporary = true;

      const beforeSave = new Date();
      const result = await saveMessage(mockCtx, mockMessageData);
      const afterSave = new Date();

      // Should still save the message with default retention period (30 days)
      expect(result?.messageId).toBe('msg123');
      expect(result?.expiredAt).toBeDefined();
      expect(result?.expiredAt).toBeInstanceOf(Date);

      // Verify expiredAt is approximately 30 days in the future (720 hours)
      const expectedExpirationTime = new Date(beforeSave.getTime() + 720 * 60 * 60 * 1000);
      const actualExpirationTime = new Date(result?.expiredAt ?? 0);

      expect(actualExpirationTime.getTime()).toBeGreaterThanOrEqual(
        expectedExpirationTime.getTime() - 1000,
      );
      expect(actualExpirationTime.getTime()).toBeLessThanOrEqual(
        new Date(afterSave.getTime() + 720 * 60 * 60 * 1000 + 1000).getTime(),
      );
    });

    it('should use default retention when config is not provided', async () => {
      // Mock getAppConfig to return empty config
      mockCtx.interfaceConfig = undefined; // Empty config

      mockCtx.isTemporary = true;

      const beforeSave = new Date();
      const result = await saveMessage(mockCtx, mockMessageData);

      expect(result?.expiredAt).toBeDefined();

      // Default retention is 30 days (720 hours)
      const expectedExpirationTime = new Date(beforeSave.getTime() + 30 * 24 * 60 * 60 * 1000);
      const actualExpirationTime = new Date(result?.expiredAt ?? 0);

      expect(actualExpirationTime.getTime()).toBeGreaterThanOrEqual(
        expectedExpirationTime.getTime() - 1000,
      );
      expect(actualExpirationTime.getTime()).toBeLessThanOrEqual(
        expectedExpirationTime.getTime() + 1000,
      );
    });

    it('should not update expiredAt on message update', async () => {
      // First save a temporary message
      mockCtx.interfaceConfig = { temporaryChatRetention: 24 };

      mockCtx.isTemporary = true;
      const savedMessage = await saveMessage(mockCtx, mockMessageData);
      const originalExpiredAt = savedMessage?.expiredAt;

      // Now update the message without isTemporary flag
      mockCtx.isTemporary = undefined;
      const updatedMessage = await updateMessage(mockCtx.userId, {
        messageId: 'msg123',
        text: 'Updated text',
      });

      // expiredAt should not be in the returned updated message object
      expect(updatedMessage?.expiredAt).toBeUndefined();

      // Verify in database that expiredAt wasn't changed
      const dbMessage = await Message.findOne({ messageId: 'msg123', user: 'user123' });
      expect(dbMessage?.expiredAt).toEqual(originalExpiredAt);
    });

    it('should preserve expiredAt when saving existing temporary message', async () => {
      // First save a temporary message
      mockCtx.interfaceConfig = { temporaryChatRetention: 24 };

      mockCtx.isTemporary = true;
      const firstSave = await saveMessage(mockCtx, mockMessageData);
      const originalExpiredAt = firstSave?.expiredAt;

      // Wait a bit to ensure time difference
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Save again with same messageId but different text
      const updatedData = { ...mockMessageData, text: 'Updated text' };
      const secondSave = await saveMessage(mockCtx, updatedData);

      // Should update text but create new expiredAt
      expect(secondSave?.text).toBe('Updated text');
      expect(secondSave?.expiredAt).toBeDefined();
      expect(new Date(secondSave?.expiredAt ?? 0).getTime()).toBeGreaterThan(
        new Date(originalExpiredAt ?? 0).getTime(),
      );
    });

    it('should preserve temporary retention when saving without isTemporary', async () => {
      mockCtx.interfaceConfig = { temporaryChatRetention: 24 };

      mockCtx.isTemporary = true;
      const firstSave = await saveMessage(mockCtx, mockMessageData);
      const originalExpiredAt = firstSave?.expiredAt;

      mockCtx.isTemporary = undefined;
      const updatedData = { ...mockMessageData, text: 'Updated text' };
      const secondSave = await saveMessage(mockCtx, updatedData);

      expect(secondSave?.text).toBe('Updated text');
      expect(secondSave?.isTemporary).toBe(true);
      expect(secondSave?.expiredAt).toEqual(originalExpiredAt);
    });

    it('should handle bulk operations with temporary messages', async () => {
      // This test verifies bulkSaveMessages doesn't interfere with expiredAt
      const messages = [
        {
          messageId: 'bulk1',
          conversationId: uuidv4(),
          text: 'Bulk message 1',
          user: 'user123',
          expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        {
          messageId: 'bulk2',
          conversationId: uuidv4(),
          text: 'Bulk message 2',
          user: 'user123',
          expiredAt: null,
        },
      ];

      await bulkSaveMessages(messages);

      const savedMessages = await Message.find({
        messageId: { $in: ['bulk1', 'bulk2'] },
      }).lean();

      expect(savedMessages).toHaveLength(2);

      const bulk1 = savedMessages.find((m) => m.messageId === 'bulk1');
      const bulk2 = savedMessages.find((m) => m.messageId === 'bulk2');

      expect(bulk1?.expiredAt).toBeDefined();
      expect(bulk2?.expiredAt).toBeNull();
    });
  });

  describe('forced retention conversation cascade', () => {
    const Conversation = () => mongoose.models.Conversation as mongoose.Model<IConversation>;

    beforeEach(async () => {
      await Conversation().deleteMany({});
    });

    it('converts a permanent parent conversation and backfills its messages', async () => {
      const conversationId = uuidv4();
      await Conversation().create({
        conversationId,
        user: 'user123',
        endpoint: 'openAI',
        title: 'Existing permanent chat',
      });
      const olderMessage = await saveMessage(
        { userId: 'user123' },
        { messageId: uuidv4(), conversationId, text: 'older', user: 'user123' },
      );
      expect(olderMessage?.expiredAt ?? null).toBeNull();

      await saveMessage(
        {
          userId: 'user123',
          interfaceConfig: { temporaryChatRetention: 24, retentionMode: RetentionMode.EPHEMERAL },
        },
        { messageId: uuidv4(), conversationId, text: 'branch', user: 'user123' },
      );

      const convo = await Conversation().findOne({ conversationId }).lean();
      expect(convo?.isTemporary).toBe(true);
      expect(convo?.expiredAt).toBeInstanceOf(Date);

      const messages = await getMessages({ conversationId, user: 'user123' });
      expect(messages).toHaveLength(2);
      for (const message of messages) {
        expect(message.isTemporary).toBe(true);
        expect(message.expiredAt).toBeInstanceOf(Date);
      }
    });

    it('converts an active retained (all-mode) parent when switching to ephemeral', async () => {
      const conversationId = uuidv4();
      const retainedUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      await Conversation().create({
        conversationId,
        user: 'user123',
        endpoint: 'openAI',
        title: 'Retained all-mode chat',
        isTemporary: false,
        expiredAt: retainedUntil,
      });
      await Message.create({
        messageId: uuidv4(),
        conversationId,
        user: 'user123',
        text: 'retained',
        isTemporary: false,
        expiredAt: retainedUntil,
      });

      await saveMessage(
        {
          userId: 'user123',
          interfaceConfig: { temporaryChatRetention: 24, retentionMode: RetentionMode.EPHEMERAL },
        },
        { messageId: uuidv4(), conversationId, text: 'branch', user: 'user123' },
      );

      const convo = await Conversation().findOne({ conversationId }).lean();
      expect(convo?.isTemporary).toBe(true);
      expect(convo?.expiredAt?.getTime()).toBeLessThan(retainedUntil.getTime());

      const messages = await getMessages({ conversationId, user: 'user123' });
      expect(messages).toHaveLength(2);
      for (const message of messages) {
        expect(message.isTemporary).toBe(true);
        expect(message.expiredAt?.getTime()).toBeLessThan(retainedUntil.getTime());
      }
    });

    it('preserves a carried-over message that already expires sooner than the forced window', async () => {
      const conversationId = uuidv4();
      const soonerExpiry = new Date(Date.now() + 30 * 60 * 1000);
      await Conversation().create({
        conversationId,
        user: 'user123',
        endpoint: 'openAI',
        title: 'Permanent chat with a sooner-expiring message',
        isTemporary: false,
      });
      const soonerMessageId = uuidv4();
      await Message.create({
        messageId: soonerMessageId,
        conversationId,
        user: 'user123',
        text: 'all-mode message with its own sooner TTL',
        isTemporary: false,
        expiredAt: soonerExpiry,
      });

      await saveMessage(
        {
          userId: 'user123',
          interfaceConfig: { temporaryChatRetention: 24, retentionMode: RetentionMode.EPHEMERAL },
        },
        { messageId: uuidv4(), conversationId, text: 'follow-up', user: 'user123' },
      );

      const sooner = await Message.findOne({ messageId: soonerMessageId }).lean();
      expect(sooner?.isTemporary).toBe(true);
      expect(sooner?.expiredAt?.getTime()).toBe(soonerExpiry.getTime());
    });

    it('re-caps an already temporary parent and its messages to a shorter ephemeral window', async () => {
      const conversationId = uuidv4();
      const longerExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      await Conversation().create({
        conversationId,
        user: 'user123',
        endpoint: 'openAI',
        title: 'Already temporary chat',
        isTemporary: true,
        expiredAt: longerExpiry,
      });
      await Message.create({
        messageId: uuidv4(),
        conversationId,
        user: 'user123',
        text: 'older temporary message',
        isTemporary: true,
        expiredAt: longerExpiry,
      });

      await saveMessage(
        {
          userId: 'user123',
          interfaceConfig: { temporaryChatRetention: 24, retentionMode: RetentionMode.EPHEMERAL },
        },
        { messageId: uuidv4(), conversationId, text: 'branch', user: 'user123' },
      );

      const convo = await Conversation().findOne({ conversationId }).lean();
      expect(convo?.expiredAt?.getTime()).toBeLessThan(longerExpiry.getTime());

      const messages = await getMessages({ conversationId, user: 'user123' });
      expect(messages).toHaveLength(2);
      for (const message of messages) {
        expect(message.isTemporary).toBe(true);
        expect(message.expiredAt?.getTime()).toBeLessThan(longerExpiry.getTime());
      }
    });

    it('caps a message-only save to a sooner parent expiry instead of orphaning it', async () => {
      const conversationId = uuidv4();
      const parentExpiry = new Date(Date.now() + 60 * 60 * 1000);
      await Conversation().create({
        conversationId,
        user: 'user123',
        endpoint: 'openAI',
        title: 'Ephemeral chat expiring soon',
        isTemporary: true,
        expiredAt: parentExpiry,
      });

      const saved = await saveMessage(
        {
          userId: 'user123',
          interfaceConfig: { temporaryChatRetention: 24, retentionMode: RetentionMode.EPHEMERAL },
        },
        { messageId: uuidv4(), conversationId, text: 'branch', user: 'user123' },
        { context: 'branch', capExpiryToConversation: true },
      );

      expect(saved?.expiredAt?.getTime()).toBe(parentExpiry.getTime());

      const convo = await Conversation().findOne({ conversationId }).lean();
      expect(convo?.expiredAt?.getTime()).toBe(parentExpiry.getTime());
      expect(saved?.expiredAt?.getTime()).toBeLessThanOrEqual(convo?.expiredAt?.getTime() ?? 0);
    });

    it('caps a message-only save to an all-mode parent expiring sooner without extending it', async () => {
      const conversationId = uuidv4();
      const parentExpiry = new Date(Date.now() + 60 * 60 * 1000);
      await Conversation().create({
        conversationId,
        user: 'user123',
        endpoint: 'openAI',
        title: 'All-mode chat expiring soon',
        isTemporary: false,
        expiredAt: parentExpiry,
      });
      const olderMessageId = uuidv4();
      await Message.create({
        messageId: olderMessageId,
        conversationId,
        user: 'user123',
        text: 'older retained message',
        isTemporary: false,
        expiredAt: parentExpiry,
      });

      const saved = await saveMessage(
        {
          userId: 'user123',
          interfaceConfig: { temporaryChatRetention: 24, retentionMode: RetentionMode.EPHEMERAL },
        },
        { messageId: uuidv4(), conversationId, text: 'branch', user: 'user123' },
        { context: 'branch', capExpiryToConversation: true },
      );

      expect(saved?.expiredAt?.getTime()).toBe(parentExpiry.getTime());

      const convo = await Conversation().findOne({ conversationId }).lean();
      expect(convo?.isTemporary).toBe(true);
      expect(convo?.expiredAt?.getTime()).toBe(parentExpiry.getTime());

      const older = await Message.findOne({ messageId: olderMessageId }).lean();
      expect(older?.isTemporary).toBe(true);
      expect(older?.expiredAt?.getTime()).toBe(parentExpiry.getTime());
    });

    it('backfills lagging messages when the parent already expires sooner', async () => {
      const conversationId = uuidv4();
      const parentExpiry = new Date(Date.now() + 60 * 60 * 1000);
      await Conversation().create({
        conversationId,
        user: 'user123',
        endpoint: 'openAI',
        title: 'Ephemeral chat expiring soon',
        isTemporary: true,
        expiredAt: parentExpiry,
      });
      const laggingMessageId = uuidv4();
      await Message.create({
        messageId: laggingMessageId,
        conversationId,
        user: 'user123',
        text: 'older message with no expiry',
      });

      await saveMessage(
        {
          userId: 'user123',
          interfaceConfig: { temporaryChatRetention: 24, retentionMode: RetentionMode.EPHEMERAL },
        },
        { messageId: uuidv4(), conversationId, text: 'branch', user: 'user123' },
        { context: 'branch', capExpiryToConversation: true },
      );

      const lagging = await Message.findOne({ messageId: laggingMessageId }).lean();
      expect(lagging?.isTemporary).toBe(true);
      expect(lagging?.expiredAt?.getTime()).toBe(parentExpiry.getTime());
    });

    it('caps a normal send to a parent expiring sooner so it cannot outlive the conversation', async () => {
      const conversationId = uuidv4();
      const parentExpiry = new Date(Date.now() + 60 * 60 * 1000);
      await Conversation().create({
        conversationId,
        user: 'user123',
        endpoint: 'openAI',
        title: 'Ephemeral chat expiring soon',
        isTemporary: true,
        expiredAt: parentExpiry,
      });

      const saved = await saveMessage(
        {
          userId: 'user123',
          interfaceConfig: { temporaryChatRetention: 24, retentionMode: RetentionMode.EPHEMERAL },
        },
        { messageId: uuidv4(), conversationId, text: 'follow-up', user: 'user123' },
      );

      expect(saved?.expiredAt?.getTime()).toBe(parentExpiry.getTime());

      const convo = await Conversation().findOne({ conversationId }).lean();
      expect(convo?.expiredAt?.getTime()).toBe(parentExpiry.getTime());
      expect(saved?.expiredAt?.getTime()).toBeLessThanOrEqual(convo?.expiredAt?.getTime() ?? 0);
    });

    it('does not touch the parent conversation outside forced retention', async () => {
      const conversationId = uuidv4();
      await Conversation().create({
        conversationId,
        user: 'user123',
        endpoint: 'openAI',
        title: 'Existing permanent chat',
      });

      await saveMessage(
        {
          userId: 'user123',
          interfaceConfig: { temporaryChatRetention: 24, retentionMode: RetentionMode.TEMPORARY },
        },
        { messageId: uuidv4(), conversationId, text: 'edit', user: 'user123' },
      );

      const convo = await Conversation().findOne({ conversationId }).lean();
      expect(convo?.expiredAt ?? null).toBeNull();
    });

    it('caps an existing permanent shared link when converting via a message save', async () => {
      const SharedLink = mongoose.models.SharedLink as mongoose.Model<ISharedLink>;
      await SharedLink.deleteMany({});
      const conversationId = uuidv4();
      await Conversation().create({
        conversationId,
        user: 'user123',
        endpoint: 'openAI',
        title: 'Existing permanent chat',
      });
      await SharedLink.create({ conversationId, user: 'user123', shareId: uuidv4() });

      await saveMessage(
        {
          userId: 'user123',
          interfaceConfig: { temporaryChatRetention: 24, retentionMode: RetentionMode.EPHEMERAL },
        },
        { messageId: uuidv4(), conversationId, text: 'branch', user: 'user123' },
        { context: 'branch', capExpiryToConversation: true },
      );

      const reloaded = await SharedLink.findOne({ conversationId }).lean();
      expect(reloaded?.expiredAt).toBeInstanceOf(Date);
    });
  });

  describe('applyForcedRetention', () => {
    const Conversation = () => mongoose.models.Conversation as mongoose.Model<IConversation>;

    beforeEach(async () => {
      await Conversation().deleteMany({});
    });

    it('converts a permanent message and its conversation when editing under ephemeral mode', async () => {
      const conversationId = uuidv4();
      const editedMessageId = uuidv4();
      await Conversation().create({
        conversationId,
        user: 'user123',
        endpoint: 'openAI',
        title: 'Existing permanent chat',
      });
      await Message.create([
        { messageId: editedMessageId, conversationId, user: 'user123', text: 'first' },
        { messageId: uuidv4(), conversationId, user: 'user123', text: 'second' },
      ]);

      await applyForcedRetention(
        {
          userId: 'user123',
          interfaceConfig: { temporaryChatRetention: 24, retentionMode: RetentionMode.EPHEMERAL },
        },
        { conversationId, messageId: editedMessageId },
        { context: 'edit', capExpiryToConversation: true },
      );

      const convo = await Conversation().findOne({ conversationId }).lean();
      expect(convo?.isTemporary).toBe(true);
      expect(convo?.expiredAt).toBeInstanceOf(Date);

      const messages = await getMessages({ conversationId, user: 'user123' });
      expect(messages).toHaveLength(2);
      for (const message of messages) {
        expect(message.isTemporary).toBe(true);
        expect(message.expiredAt).toBeInstanceOf(Date);
      }
    });

    it('preserves an edited message expiring sooner than its parent under forced retention', async () => {
      const conversationId = uuidv4();
      const editedMessageId = uuidv4();
      const messageDeadline = new Date(Date.now() + 60 * 60 * 1000);
      const parentDeadline = new Date(Date.now() + 12 * 60 * 60 * 1000);
      await Conversation().create({
        conversationId,
        user: 'user123',
        endpoint: 'openAI',
        title: 'Carried-over chat',
        isTemporary: false,
        expiredAt: parentDeadline,
      });
      await Message.create({
        messageId: editedMessageId,
        conversationId,
        user: 'user123',
        text: 'edited',
        isTemporary: false,
        expiredAt: messageDeadline,
      });

      await applyForcedRetention(
        {
          userId: 'user123',
          interfaceConfig: { temporaryChatRetention: 24, retentionMode: RetentionMode.EPHEMERAL },
        },
        { conversationId, messageId: editedMessageId },
        { context: 'edit', capExpiryToConversation: true },
      );

      const message = await Message.findOne({ messageId: editedMessageId, user: 'user123' }).lean();
      expect(message?.isTemporary).toBe(true);
      expect(message?.expiredAt?.getTime()).toBe(messageDeadline.getTime());
    });

    it('refreshes owning project stats when forced retention hides a project chat', async () => {
      const ChatProject = mongoose.models.ChatProject as mongoose.Model<IChatProject>;
      await ChatProject.deleteMany({});
      const conversationId = uuidv4();
      const project = await ChatProject.create({
        name: 'Ephemeral Project',
        user: 'user123',
        conversationCount: 1,
        lastConversationId: conversationId,
        lastConversationAt: new Date(),
      });
      const projectId = project._id!.toString();
      await Conversation().create({
        conversationId,
        user: 'user123',
        endpoint: 'openAI',
        title: 'Project chat',
        isTemporary: false,
        chatProjectId: projectId,
      });
      await Message.create({ messageId: uuidv4(), conversationId, user: 'user123', text: 'hi' });

      await applyForcedRetention(
        {
          userId: 'user123',
          interfaceConfig: { temporaryChatRetention: 24, retentionMode: RetentionMode.EPHEMERAL },
        },
        { conversationId },
        { context: 'tag' },
      );

      const refreshed = await ChatProject.findById(projectId).lean<IChatProject>();
      expect(refreshed?.conversationCount).toBe(0);
      expect(refreshed?.lastConversationId ?? null).toBeNull();
    });

    it('converts a permanent conversation and its messages without a messageId (tag write)', async () => {
      const conversationId = uuidv4();
      await Conversation().create({
        conversationId,
        user: 'user123',
        endpoint: 'openAI',
        title: 'Existing permanent chat',
      });
      await Message.create([
        { messageId: uuidv4(), conversationId, user: 'user123', text: 'first' },
        { messageId: uuidv4(), conversationId, user: 'user123', text: 'second' },
      ]);

      await applyForcedRetention(
        {
          userId: 'user123',
          interfaceConfig: { temporaryChatRetention: 24, retentionMode: RetentionMode.EPHEMERAL },
        },
        { conversationId },
        { context: 'tag' },
      );

      const convo = await Conversation().findOne({ conversationId }).lean();
      expect(convo?.isTemporary).toBe(true);
      expect(convo?.expiredAt).toBeInstanceOf(Date);

      const messages = await getMessages({ conversationId, user: 'user123' });
      expect(messages).toHaveLength(2);
      for (const message of messages) {
        expect(message.isTemporary).toBe(true);
        expect(message.expiredAt).toBeInstanceOf(Date);
      }
    });

    it('is a no-op outside forced retention', async () => {
      const conversationId = uuidv4();
      const messageId = uuidv4();
      await Conversation().create({
        conversationId,
        user: 'user123',
        endpoint: 'openAI',
        title: 'Existing permanent chat',
      });
      await Message.create({ messageId, conversationId, user: 'user123', text: 'first' });

      await applyForcedRetention(
        {
          userId: 'user123',
          interfaceConfig: { temporaryChatRetention: 24, retentionMode: RetentionMode.TEMPORARY },
        },
        { conversationId, messageId },
        { context: 'edit', capExpiryToConversation: true },
      );

      const convo = await Conversation().findOne({ conversationId }).lean();
      expect(convo?.expiredAt ?? null).toBeNull();
      const message = await Message.findOne({ messageId }).lean();
      expect(message?.expiredAt ?? null).toBeNull();
    });
  });

  describe('applyForcedRetentionToTag', () => {
    const Conversation = () => mongoose.models.Conversation as mongoose.Model<IConversation>;
    const SharedLink = () => mongoose.models.SharedLink as mongoose.Model<ISharedLink>;

    beforeEach(async () => {
      await Conversation().deleteMany({});
      await SharedLink().deleteMany({});
    });

    it('converts every permanent conversation carrying the tag under ephemeral mode', async () => {
      const taggedA = uuidv4();
      const taggedB = uuidv4();
      const untagged = uuidv4();
      await Conversation().create([
        { conversationId: taggedA, user: 'user123', endpoint: 'openAI', tags: ['work'] },
        { conversationId: taggedB, user: 'user123', endpoint: 'openAI', tags: ['work', 'urgent'] },
        { conversationId: untagged, user: 'user123', endpoint: 'openAI', tags: ['personal'] },
      ]);
      await Message.create([
        { messageId: uuidv4(), conversationId: taggedA, user: 'user123', text: 'a' },
        { messageId: uuidv4(), conversationId: taggedB, user: 'user123', text: 'b' },
        { messageId: uuidv4(), conversationId: untagged, user: 'user123', text: 'c' },
      ]);

      await applyForcedRetentionToTag(
        {
          userId: 'user123',
          interfaceConfig: { temporaryChatRetention: 24, retentionMode: RetentionMode.EPHEMERAL },
        },
        { tag: 'work' },
        { context: 'DELETE /api/tags/:tag' },
      );

      for (const conversationId of [taggedA, taggedB]) {
        const convo = await Conversation().findOne({ conversationId }).lean();
        expect(convo?.isTemporary).toBe(true);
        expect(convo?.expiredAt).toBeInstanceOf(Date);
        const messages = await getMessages({ conversationId, user: 'user123' });
        for (const message of messages) {
          expect(message.isTemporary).toBe(true);
          expect(message.expiredAt).toBeInstanceOf(Date);
        }
      }

      const untouched = await Conversation().findOne({ conversationId: untagged }).lean();
      expect(untouched?.isTemporary ?? null).not.toBe(true);
      expect(untouched?.expiredAt ?? null).toBeNull();
    });

    it('preserves earlier expirations per tagged conversation when cascading forced retention', async () => {
      const soonerConversationId = uuidv4();
      const permanentConversationId = uuidv4();
      const soonerExpiry = new Date(Date.now() + 60 * 60 * 1000);
      await Conversation().create([
        {
          conversationId: soonerConversationId,
          user: 'user123',
          endpoint: 'openAI',
          tags: ['work'],
          isTemporary: false,
          expiredAt: soonerExpiry,
        },
        {
          conversationId: permanentConversationId,
          user: 'user123',
          endpoint: 'openAI',
          tags: ['work'],
        },
      ]);
      await Message.create([
        {
          messageId: uuidv4(),
          conversationId: soonerConversationId,
          user: 'user123',
          text: 'sooner',
          isTemporary: false,
          expiredAt: soonerExpiry,
        },
        {
          messageId: uuidv4(),
          conversationId: permanentConversationId,
          user: 'user123',
          text: 'permanent',
        },
      ]);
      await SharedLink().create([
        {
          conversationId: soonerConversationId,
          user: 'user123',
          shareId: uuidv4(),
          expiredAt: soonerExpiry,
        },
        {
          conversationId: permanentConversationId,
          user: 'user123',
          shareId: uuidv4(),
        },
      ]);

      await applyForcedRetentionToTag(
        {
          userId: 'user123',
          interfaceConfig: { temporaryChatRetention: 24, retentionMode: RetentionMode.EPHEMERAL },
        },
        { tag: 'work' },
        { context: 'PUT /api/tags/:tag' },
      );

      const soonerConvo = await Conversation()
        .findOne({ conversationId: soonerConversationId })
        .lean();
      expect(soonerConvo?.isTemporary).toBe(true);
      expect(soonerConvo?.expiredAt?.getTime()).toBe(soonerExpiry.getTime());
      const soonerMessage = await Message.findOne({ conversationId: soonerConversationId }).lean();
      expect(soonerMessage?.isTemporary).toBe(true);
      expect(soonerMessage?.expiredAt?.getTime()).toBe(soonerExpiry.getTime());
      const soonerShare = await SharedLink()
        .findOne({ conversationId: soonerConversationId })
        .lean();
      expect(soonerShare?.expiredAt?.getTime()).toBe(soonerExpiry.getTime());

      const permanentConvo = await Conversation()
        .findOne({ conversationId: permanentConversationId })
        .lean();
      expect(permanentConvo?.isTemporary).toBe(true);
      expect(permanentConvo?.expiredAt).toBeInstanceOf(Date);
      expect(permanentConvo?.expiredAt?.getTime()).toBeGreaterThan(soonerExpiry.getTime());
      const permanentMessage = await Message.findOne({
        conversationId: permanentConversationId,
      }).lean();
      expect(permanentMessage?.isTemporary).toBe(true);
      expect(permanentMessage?.expiredAt?.getTime()).toBeGreaterThan(soonerExpiry.getTime());
      const permanentShare = await SharedLink()
        .findOne({ conversationId: permanentConversationId })
        .lean();
      expect(permanentShare?.expiredAt?.getTime()).toBeGreaterThan(soonerExpiry.getTime());
    });

    it('is a no-op outside forced retention', async () => {
      const conversationId = uuidv4();
      await Conversation().create({
        conversationId,
        user: 'user123',
        endpoint: 'openAI',
        tags: ['work'],
      });

      await applyForcedRetentionToTag(
        {
          userId: 'user123',
          interfaceConfig: { temporaryChatRetention: 24, retentionMode: RetentionMode.ALL },
        },
        { tag: 'work' },
        { context: 'PUT /api/tags/:tag' },
      );

      const convo = await Conversation().findOne({ conversationId }).lean();
      expect(convo?.expiredAt ?? null).toBeNull();
    });

    it('ignores a non-string tag instead of matching every conversation (NoSQL injection)', async () => {
      const conversationId = uuidv4();
      await Conversation().create({
        conversationId,
        user: 'user123',
        endpoint: 'openAI',
        tags: ['work'],
      });

      await applyForcedRetentionToTag(
        {
          userId: 'user123',
          interfaceConfig: { temporaryChatRetention: 24, retentionMode: RetentionMode.EPHEMERAL },
        },
        { tag: { $gt: '' } as unknown as string },
        { context: 'PUT /api/tags/:tag' },
      );

      const convo = await Conversation().findOne({ conversationId }).lean();
      expect(convo?.isTemporary ?? null).not.toBe(true);
      expect(convo?.expiredAt ?? null).toBeNull();
    });
  });

  describe('sweepForcedRetention', () => {
    const Conversation = () => mongoose.models.Conversation as mongoose.Model<IConversation>;
    const SharedLink = () => mongoose.models.SharedLink as mongoose.Model<ISharedLink>;
    const File = () => mongoose.models.File as mongoose.Model<IMongoFile>;

    beforeEach(async () => {
      await Conversation().deleteMany({});
      await SharedLink().deleteMany({});
      await File().deleteMany({});
    });

    it('converts untouched permanent conversations, messages, and shares and skips conforming ones', async () => {
      const forcedExpiredAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const permanentId = uuidv4();
      const conformingId = uuidv4();
      const soonerExpiry = new Date(Date.now() + 30 * 60 * 1000);

      await Conversation().create([
        { conversationId: permanentId, user: 'user123', endpoint: 'openAI', isTemporary: false },
        {
          conversationId: conformingId,
          user: 'user123',
          endpoint: 'openAI',
          isTemporary: true,
          expiredAt: soonerExpiry,
        },
      ]);
      await Message.create([
        { messageId: uuidv4(), conversationId: permanentId, user: 'user123', text: 'permanent' },
        {
          messageId: uuidv4(),
          conversationId: conformingId,
          user: 'user123',
          text: 'conforming',
          isTemporary: true,
          expiredAt: soonerExpiry,
        },
      ]);
      await SharedLink().create({
        conversationId: permanentId,
        user: 'user123',
        shareId: uuidv4(),
      });

      const result = await sweepForcedRetention(
        Conversation(),
        Message,
        SharedLink(),
        File(),
        forcedExpiredAt,
      );
      expect(result).toEqual({ conversations: 1, errors: 0, projects: [] });

      const permanent = await Conversation().findOne({ conversationId: permanentId }).lean();
      expect(permanent?.isTemporary).toBe(true);
      expect(permanent?.expiredAt?.getTime()).toBe(forcedExpiredAt.getTime());

      const permanentMessages = await getMessages({ conversationId: permanentId, user: 'user123' });
      for (const message of permanentMessages) {
        expect(message.isTemporary).toBe(true);
        expect(message.expiredAt?.getTime()).toBe(forcedExpiredAt.getTime());
      }

      const share = await SharedLink().findOne({ conversationId: permanentId }).lean();
      expect(share?.expiredAt?.getTime()).toBe(forcedExpiredAt.getTime());

      const conforming = await Conversation().findOne({ conversationId: conformingId }).lean();
      expect(conforming?.expiredAt?.getTime()).toBe(soonerExpiry.getTime());
    });

    it("caps a converted conversation's permanent files while preserving sooner and unrelated ones", async () => {
      const forcedExpiredAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const soonerExpiry = new Date(Date.now() + 30 * 60 * 1000);
      const conversationId = uuidv4();
      const unrelatedConversationId = uuidv4();
      const permanentFileId = uuidv4();
      const soonerFileId = uuidv4();
      const unrelatedFileId = uuidv4();

      await Conversation().create({
        conversationId,
        user: 'user123',
        endpoint: 'openAI',
        isTemporary: false,
      });
      await File().collection.insertMany([
        {
          file_id: permanentFileId,
          conversationId,
          user: new mongoose.Types.ObjectId(),
          expiredAt: null,
        },
        {
          file_id: soonerFileId,
          conversationId,
          user: new mongoose.Types.ObjectId(),
          expiredAt: soonerExpiry,
        },
        {
          file_id: unrelatedFileId,
          conversationId: unrelatedConversationId,
          user: new mongoose.Types.ObjectId(),
          expiredAt: null,
        },
      ]);

      await sweepForcedRetention(Conversation(), Message, SharedLink(), File(), forcedExpiredAt);

      const permanentFile = await File().findOne({ file_id: permanentFileId }).lean();
      expect(permanentFile?.expiredAt?.getTime()).toBe(forcedExpiredAt.getTime());

      const soonerFile = await File().findOne({ file_id: soonerFileId }).lean();
      expect(soonerFile?.expiredAt?.getTime()).toBe(soonerExpiry.getTime());

      const unrelatedFile = await File().findOne({ file_id: unrelatedFileId }).lean();
      expect(unrelatedFile?.expiredAt ?? null).toBeNull();
    });

    it('collects converted project memberships so callers can refresh project stats', async () => {
      const forcedExpiredAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const chatProjectId = new mongoose.Types.ObjectId().toString();

      await Conversation().create([
        {
          conversationId: uuidv4(),
          user: 'user123',
          endpoint: 'openAI',
          isTemporary: false,
          chatProjectId,
        },
        {
          conversationId: uuidv4(),
          user: 'user123',
          endpoint: 'openAI',
          isTemporary: false,
          chatProjectId,
        },
        { conversationId: uuidv4(), user: 'user123', endpoint: 'openAI', isTemporary: false },
      ]);

      const result = await sweepForcedRetention(
        Conversation(),
        Message,
        SharedLink(),
        File(),
        forcedExpiredAt,
      );

      expect(result.conversations).toBe(3);
      expect(result.projects).toEqual([{ user: 'user123', chatProjectId }]);
    });

    it('aligns a permanent message to a sooner parent deadline instead of the forced window', async () => {
      const forcedExpiredAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const conversationId = uuidv4();
      const soonerExpiry = new Date(Date.now() + 30 * 60 * 1000);

      await Conversation().create({
        conversationId,
        user: 'user123',
        endpoint: 'openAI',
        isTemporary: false,
        expiredAt: soonerExpiry,
      });
      const permanentMessageId = uuidv4();
      await Message.create({
        messageId: permanentMessageId,
        conversationId,
        user: 'user123',
        text: 'permanent',
        isTemporary: false,
      });

      await sweepForcedRetention(Conversation(), Message, SharedLink(), File(), forcedExpiredAt);

      const convo = await Conversation().findOne({ conversationId }).lean();
      expect(convo?.expiredAt?.getTime()).toBe(soonerExpiry.getTime());
      const message = await Message.findOne({ messageId: permanentMessageId }).lean();
      expect(message?.isTemporary).toBe(true);
      expect(message?.expiredAt?.getTime()).toBe(soonerExpiry.getTime());
    });

    it('assigns the forced deadline to a legacy message whose expiredAt is explicitly null', async () => {
      const forcedExpiredAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const conversationId = uuidv4();
      await Conversation().create({
        conversationId,
        user: 'user123',
        endpoint: 'openAI',
        isTemporary: false,
      });
      const legacyMessageId = uuidv4();
      await Message.create({
        messageId: legacyMessageId,
        conversationId,
        user: 'user123',
        text: 'legacy permanent',
        isTemporary: false,
        expiredAt: null,
      });

      await sweepForcedRetention(Conversation(), Message, SharedLink(), File(), forcedExpiredAt);

      const message = await Message.findOne({ messageId: legacyMessageId }).lean();
      expect(message?.isTemporary).toBe(true);
      expect(message?.expiredAt?.getTime()).toBe(forcedExpiredAt.getTime());
    });

    it('leaves a conversation non-conforming when a child backfill fails so a re-run retries it', async () => {
      const forcedExpiredAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const conversationId = uuidv4();
      await Conversation().create({
        conversationId,
        user: 'user123',
        endpoint: 'openAI',
        isTemporary: false,
      });

      const throwingSharedLink = {
        updateMany: jest.fn().mockRejectedValue(new Error('backfill failed')),
      } as unknown as mongoose.Model<ISharedLink>;

      const failed = await sweepForcedRetention(
        Conversation(),
        Message,
        throwingSharedLink,
        File(),
        forcedExpiredAt,
      );
      expect(failed).toEqual({ conversations: 0, errors: 1, projects: [] });

      const stillPermanent = await Conversation().findOne({ conversationId }).lean();
      expect(stillPermanent?.isTemporary ?? null).not.toBe(true);
      expect(stillPermanent?.expiredAt ?? null).toBeNull();

      const retried = await sweepForcedRetention(
        Conversation(),
        Message,
        SharedLink(),
        File(),
        forcedExpiredAt,
      );
      expect(retried).toEqual({ conversations: 1, errors: 0, projects: [] });

      const converted = await Conversation().findOne({ conversationId }).lean();
      expect(converted?.isTemporary).toBe(true);
      expect(converted?.expiredAt?.getTime()).toBe(forcedExpiredAt.getTime());
    });

    it('scopes the sweep to the active tenant context, leaving other tenants untouched', async () => {
      const forcedExpiredAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const tenantAConversationId = uuidv4();
      const tenantBConversationId = uuidv4();
      await Conversation().collection.insertMany([
        {
          conversationId: tenantAConversationId,
          user: 'user123',
          endpoint: 'openAI',
          isTemporary: false,
          tenantId: 'tenant-a',
        },
        {
          conversationId: tenantBConversationId,
          user: 'user123',
          endpoint: 'openAI',
          isTemporary: false,
          tenantId: 'tenant-b',
        },
      ]);

      const result = await tenantStorage.run({ tenantId: 'tenant-a' }, async () =>
        sweepForcedRetention(Conversation(), Message, SharedLink(), File(), forcedExpiredAt),
      );
      expect(result).toEqual({ conversations: 1, errors: 0, projects: [] });

      const tenantA = await Conversation().collection.findOne({
        conversationId: tenantAConversationId,
      });
      expect(tenantA?.isTemporary).toBe(true);

      const tenantB = await Conversation().collection.findOne({
        conversationId: tenantBConversationId,
      });
      expect(tenantB?.isTemporary ?? null).not.toBe(true);
      expect(tenantB?.expiredAt ?? null).toBeNull();
    });
  });

  describe('cascadeForcedConversationRetention', () => {
    const Conversation = () => mongoose.models.Conversation as mongoose.Model<IConversation>;
    const SharedLink = () => mongoose.models.SharedLink as mongoose.Model<ISharedLink>;
    const File = () => mongoose.models.File as mongoose.Model<IMongoFile>;

    beforeEach(async () => {
      await Conversation().deleteMany({});
      await SharedLink().deleteMany({});
    });

    it('leaves the conversation non-conforming when a child backfill fails so a re-run retries it', async () => {
      const forcedExpiredAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const conversationId = uuidv4();
      await Conversation().create({
        conversationId,
        user: 'user123',
        endpoint: 'openAI',
        isTemporary: false,
      });

      const throwingFile = {
        updateMany: jest.fn().mockRejectedValue(new Error('file backfill failed')),
      } as unknown as mongoose.Model<IMongoFile>;

      await expect(
        cascadeForcedConversationRetention(
          Conversation(),
          Message,
          SharedLink(),
          throwingFile,
          'user123',
          conversationId,
          forcedExpiredAt,
        ),
      ).rejects.toThrow('file backfill failed');

      const stillPermanent = await Conversation().findOne({ conversationId }).lean();
      expect(stillPermanent?.isTemporary ?? null).not.toBe(true);
      expect(stillPermanent?.expiredAt ?? null).toBeNull();

      await cascadeForcedConversationRetention(
        Conversation(),
        Message,
        SharedLink(),
        File(),
        'user123',
        conversationId,
        forcedExpiredAt,
      );

      const converted = await Conversation().findOne({ conversationId }).lean();
      expect(converted?.isTemporary).toBe(true);
      expect(converted?.expiredAt?.getTime()).toBe(forcedExpiredAt.getTime());
    });
  });

  describe('Message cursor pagination', () => {
    /**
     * Helper to create messages with specific timestamps
     * Uses collection.insertOne to bypass Mongoose timestamps
     */
    const createMessageWithTimestamp = async (
      index: number,
      conversationId: string,
      createdAt: Date,
    ) => {
      const messageId = uuidv4();
      await Message.collection.insertOne({
        messageId,
        conversationId,
        user: 'user123',
        text: `Message ${index}`,
        isCreatedByUser: index % 2 === 0,
        createdAt,
        updatedAt: createdAt,
      });
      return Message.findOne({ messageId }).lean<IMessage>();
    };

    /**
     * Simulates the pagination logic from api/server/routes/messages.js
     * This tests the exact query pattern used in the route
     */
    const getMessagesByCursor = async ({
      conversationId,
      user,
      pageSize = 25,
      cursor = null as string | null,
      sortBy = 'createdAt',
      sortDirection = 'desc',
    }: {
      conversationId: string;
      user: string;
      pageSize?: number;
      cursor?: string | null;
      sortBy?: string;
      sortDirection?: string;
    }) => {
      const sortOrder = sortDirection === 'asc' ? 1 : -1;
      const sortField = ['createdAt', 'updatedAt'].includes(sortBy) ? sortBy : 'createdAt';
      const cursorOperator = sortDirection === 'asc' ? '$gt' : '$lt';

      const filter: Record<string, unknown> = { conversationId, user };
      if (cursor) {
        filter[sortField] = { [cursorOperator]: new Date(cursor) };
      }

      const messages = await Message.find(filter)
        .sort({ [sortField]: sortOrder })
        .limit(pageSize + 1)
        .lean();

      let nextCursor: string | null = null;
      if (messages.length > pageSize) {
        messages.pop(); // Remove extra item used to detect next page
        // Create cursor from the last RETURNED item (not the popped one)
        nextCursor = (messages[messages.length - 1] as Record<string, unknown>)[
          sortField
        ] as string;
      }

      return { messages, nextCursor };
    };

    it('should return messages for a conversation with pagination', async () => {
      const conversationId = uuidv4();
      const baseTime = new Date('2026-01-01T00:00:00.000Z');

      // Create 30 messages to test pagination
      for (let i = 0; i < 30; i++) {
        const createdAt = new Date(baseTime.getTime() - i * 60000); // Each 1 minute apart
        await createMessageWithTimestamp(i, conversationId, createdAt);
      }

      // Fetch first page (pageSize 25)
      const page1 = await getMessagesByCursor({
        conversationId,
        user: 'user123',
        pageSize: 25,
      });

      expect(page1.messages).toHaveLength(25);
      expect(page1.nextCursor).toBeTruthy();

      // Fetch second page using cursor
      const page2 = await getMessagesByCursor({
        conversationId,
        user: 'user123',
        pageSize: 25,
        cursor: page1.nextCursor,
      });

      // Should get remaining 5 messages
      expect(page2.messages).toHaveLength(5);
      expect(page2.nextCursor).toBeNull();

      // Verify no duplicates and no gaps
      const allMessageIds = [
        ...page1.messages.map((m) => m.messageId),
        ...page2.messages.map((m) => m.messageId),
      ];
      const uniqueIds = new Set(allMessageIds);

      expect(uniqueIds.size).toBe(30); // All 30 messages accounted for
      expect(allMessageIds.length).toBe(30); // No duplicates
    });

    it('should not skip message at page boundary (item 26 bug fix)', async () => {
      const conversationId = uuidv4();
      const baseTime = new Date('2026-01-01T12:00:00.000Z');

      // Create exactly 26 messages
      const messages: (IMessage | null)[] = [];
      for (let i = 0; i < 26; i++) {
        const createdAt = new Date(baseTime.getTime() - i * 60000);
        const msg = await createMessageWithTimestamp(i, conversationId, createdAt);
        messages.push(msg);
      }

      // The 26th message (index 25) should be on page 2
      const item26 = messages[25];

      // Fetch first page with pageSize 25
      const page1 = await getMessagesByCursor({
        conversationId,
        user: 'user123',
        pageSize: 25,
      });

      expect(page1.messages).toHaveLength(25);
      expect(page1.nextCursor).toBeTruthy();

      // Item 26 should NOT be in page 1
      const page1Ids = page1.messages.map((m) => m.messageId);
      expect(page1Ids).not.toContain(item26!.messageId);

      // Fetch second page
      const page2 = await getMessagesByCursor({
        conversationId,
        user: 'user123',
        pageSize: 25,
        cursor: page1.nextCursor,
      });

      // Item 26 MUST be in page 2 (this was the bug - it was being skipped)
      expect(page2.messages).toHaveLength(1);
      expect((page2.messages[0] as { messageId: string }).messageId).toBe(item26!.messageId);
    });

    it('should sort by createdAt DESC by default', async () => {
      const conversationId = uuidv4();

      // Create messages with specific timestamps
      const msg1 = await createMessageWithTimestamp(
        1,
        conversationId,
        new Date('2026-01-01T00:00:00.000Z'),
      );
      const msg2 = await createMessageWithTimestamp(
        2,
        conversationId,
        new Date('2026-01-02T00:00:00.000Z'),
      );
      const msg3 = await createMessageWithTimestamp(
        3,
        conversationId,
        new Date('2026-01-03T00:00:00.000Z'),
      );

      const result = await getMessagesByCursor({
        conversationId,
        user: 'user123',
      });

      // Should be sorted by createdAt DESC (newest first) by default
      expect(result?.messages).toHaveLength(3);
      expect((result?.messages[0] as { messageId: string }).messageId).toBe(msg3!.messageId);
      expect((result?.messages[1] as { messageId: string }).messageId).toBe(msg2!.messageId);
      expect((result?.messages[2] as { messageId: string }).messageId).toBe(msg1!.messageId);
    });

    it('should support ascending sort direction', async () => {
      const conversationId = uuidv4();

      const msg1 = await createMessageWithTimestamp(
        1,
        conversationId,
        new Date('2026-01-01T00:00:00.000Z'),
      );
      const msg2 = await createMessageWithTimestamp(
        2,
        conversationId,
        new Date('2026-01-02T00:00:00.000Z'),
      );

      const result = await getMessagesByCursor({
        conversationId,
        user: 'user123',
        sortDirection: 'asc',
      });

      // Should be sorted by createdAt ASC (oldest first)
      expect(result?.messages).toHaveLength(2);
      expect((result?.messages[0] as { messageId: string }).messageId).toBe(msg1!.messageId);
      expect((result?.messages[1] as { messageId: string }).messageId).toBe(msg2!.messageId);
    });

    it('should handle empty conversation', async () => {
      const conversationId = uuidv4();

      const result = await getMessagesByCursor({
        conversationId,
        user: 'user123',
      });

      expect(result?.messages).toHaveLength(0);
      expect(result?.nextCursor).toBeNull();
    });

    it('should only return messages for the specified user', async () => {
      const conversationId = uuidv4();
      const createdAt = new Date();

      // Create a message for user123
      await Message.collection.insertOne({
        messageId: uuidv4(),
        conversationId,
        user: 'user123',
        text: 'User message',
        createdAt,
        updatedAt: createdAt,
      });

      // Create a message for a different user
      await Message.collection.insertOne({
        messageId: uuidv4(),
        conversationId,
        user: 'otherUser',
        text: 'Other user message',
        createdAt,
        updatedAt: createdAt,
      });

      const result = await getMessagesByCursor({
        conversationId,
        user: 'user123',
      });

      // Should only return user123's message
      expect(result?.messages).toHaveLength(1);
      expect((result?.messages[0] as { user: string }).user).toBe('user123');
    });

    it('should handle exactly pageSize number of messages (no next page)', async () => {
      const conversationId = uuidv4();
      const baseTime = new Date('2026-01-01T00:00:00.000Z');

      // Create exactly 25 messages (equal to default pageSize)
      for (let i = 0; i < 25; i++) {
        const createdAt = new Date(baseTime.getTime() - i * 60000);
        await createMessageWithTimestamp(i, conversationId, createdAt);
      }

      const result = await getMessagesByCursor({
        conversationId,
        user: 'user123',
        pageSize: 25,
      });

      expect(result?.messages).toHaveLength(25);
      expect(result?.nextCursor).toBeNull(); // No next page
    });

    it('should handle pageSize of 1', async () => {
      const conversationId = uuidv4();
      const baseTime = new Date('2026-01-01T00:00:00.000Z');

      // Create 3 messages
      for (let i = 0; i < 3; i++) {
        const createdAt = new Date(baseTime.getTime() - i * 60000);
        await createMessageWithTimestamp(i, conversationId, createdAt);
      }

      // Fetch with pageSize 1
      let cursor: string | null = null;
      const allMessages: unknown[] = [];

      for (let page = 0; page < 5; page++) {
        const result = await getMessagesByCursor({
          conversationId,
          user: 'user123',
          pageSize: 1,
          cursor,
        });

        allMessages.push(...(result?.messages ?? []));
        cursor = result?.nextCursor;

        if (!cursor) {
          break;
        }
      }

      // Should get all 3 messages without duplicates
      expect(allMessages).toHaveLength(3);
      const uniqueIds = new Set(allMessages.map((m) => (m as { messageId: string }).messageId));
      expect(uniqueIds.size).toBe(3);
    });

    it('should handle messages with same createdAt timestamp', async () => {
      const conversationId = uuidv4();
      const sameTime = new Date('2026-01-01T12:00:00.000Z');

      // Create multiple messages with the exact same timestamp
      const messages: (IMessage | null)[] = [];
      for (let i = 0; i < 5; i++) {
        const msg = await createMessageWithTimestamp(i, conversationId, sameTime);
        messages.push(msg);
      }

      const result = await getMessagesByCursor({
        conversationId,
        user: 'user123',
        pageSize: 10,
      });

      // All messages should be returned
      expect(result?.messages).toHaveLength(5);
    });
  });

  describe('tenantId stripping', () => {
    it('saveMessage should not write caller-supplied tenantId to the document', async () => {
      const messageId = uuidv4();
      const conversationId = uuidv4();
      const result = await saveMessage(
        { userId: 'user123' },
        { messageId, conversationId, text: 'Tenant test', tenantId: 'malicious-tenant' },
      );

      expect(result).not.toBeNull();
      expect(result).toBeDefined();
      const doc = await Message.findOne({ messageId }).lean();
      expect(doc).not.toBeNull();
      expect(doc?.text).toBe('Tenant test');
      expect(doc?.tenantId).toBeUndefined();
    });

    it('bulkSaveMessages should not overwrite tenantId via update payload', async () => {
      const messageId = uuidv4();
      const conversationId = uuidv4();

      await tenantStorage.run({ tenantId: 'real-tenant' }, async () => {
        await Message.create({
          messageId,
          conversationId,
          user: 'user123',
          text: 'Original',
        });
      });

      await tenantStorage.run({ tenantId: 'real-tenant' }, async () => {
        await bulkSaveMessages([
          {
            messageId,
            conversationId,
            user: 'user123',
            text: 'Updated',
            tenantId: 'malicious-tenant',
          },
        ]);
      });

      const doc = await runAsSystem(async () => Message.findOne({ messageId }).lean());
      expect(doc).not.toBeNull();
      expect(doc?.text).toBe('Updated');
      expect(doc?.tenantId).toBe('real-tenant');
    });

    it('recordMessage should not write caller-supplied tenantId to the document', async () => {
      const messageId = uuidv4();
      const conversationId = uuidv4();
      await recordMessage({
        user: 'user123',
        messageId,
        conversationId,
        text: 'Record tenant test',
        tenantId: 'malicious-tenant',
      });

      const doc = await Message.findOne({ messageId }).lean();
      expect(doc).not.toBeNull();
      expect(doc?.text).toBe('Record tenant test');
      expect(doc?.tenantId).toBeUndefined();
    });

    it('updateMessage should not write caller-supplied tenantId to the document', async () => {
      const messageId = uuidv4();
      const conversationId = uuidv4();
      await saveMessage({ userId: 'user123' }, { messageId, conversationId, text: 'Original' });

      await updateMessage('user123', {
        messageId,
        text: 'Updated',
        tenantId: 'malicious-tenant',
      });

      const doc = await Message.findOne({ messageId }).lean();
      expect(doc?.text).toBe('Updated');
      expect(doc?.tenantId).toBeUndefined();
    });
  });
});
