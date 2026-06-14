import { nanoid } from 'nanoid';
import mongoose from 'mongoose';
import { Constants } from 'librechat-data-provider';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { SchemaWithMeiliMethods } from '~/models/plugins/mongoMeili';
import type * as t from '~/types';
import { createShareMethods, type ShareMethods } from './share';

describe('Share Methods', () => {
  let mongoServer: MongoMemoryServer;
  let shareMethods: ShareMethods;
  let SharedLink: mongoose.Model<t.ISharedLink>;
  let Message: mongoose.Model<t.IMessage>;
  let Conversation: SchemaWithMeiliMethods;
  let File: mongoose.Model<t.IMongoFile>;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Create schemas
    const sharedLinkSchema = new mongoose.Schema<t.ISharedLink>(
      {
        conversationId: { type: String, required: true },
        title: { type: String, index: true },
        user: { type: String, index: true },
        messages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
        shareId: { type: String, index: true },
        targetMessageId: { type: String, required: false, index: true },
        expiredAt: { type: Date },
        fileSnapshots: { type: [mongoose.Schema.Types.Mixed], default: undefined },
      },
      { timestamps: true },
    );

    const fileSchema = new mongoose.Schema(
      {
        user: { type: String, required: true },
        file_id: { type: String, required: true, index: true },
        filename: { type: String, required: true },
        filepath: { type: String, required: true },
        storageKey: String,
        type: String,
        bytes: Number,
        source: String,
        width: Number,
        height: Number,
        text: String,
        textFormat: { type: String, enum: ['html', 'text'] },
        status: { type: String, enum: ['pending', 'ready', 'failed'] },
        previewError: String,
        tenantId: String,
      },
      { timestamps: true },
    );

    const messageSchema = new mongoose.Schema<t.IMessage>(
      {
        messageId: { type: String, required: true },
        conversationId: { type: String, required: true },
        user: { type: String, required: true },
        text: String,
        isCreatedByUser: Boolean,
        model: String,
        iconURL: String,
        endpoint: String,
        conversationSignature: String,
        clientId: String,
        plugin: mongoose.Schema.Types.Mixed,
        metadata: mongoose.Schema.Types.Mixed,
        feedback: mongoose.Schema.Types.Mixed,
        manualSkills: [String],
        alwaysAppliedSkills: [String],
        parentMessageId: String,
        attachments: [mongoose.Schema.Types.Mixed],
        files: [mongoose.Schema.Types.Mixed],
        content: [mongoose.Schema.Types.Mixed],
      },
      { timestamps: true },
    );

    const conversationSchema = new mongoose.Schema<t.IConversation>(
      {
        conversationId: { type: String, required: true },
        title: String,
        user: String,
      },
      { timestamps: true },
    );

    // Register models
    SharedLink =
      mongoose.models.SharedLink || mongoose.model<t.ISharedLink>('SharedLink', sharedLinkSchema);
    Message = mongoose.models.Message || mongoose.model<t.IMessage>('Message', messageSchema);
    Conversation = (mongoose.models.Conversation ||
      mongoose.model<t.IConversation>(
        'Conversation',
        conversationSchema,
      )) as SchemaWithMeiliMethods;
    File = mongoose.models.File || mongoose.model<t.IMongoFile>('File', fileSchema);

    // Create share methods
    shareMethods = createShareMethods(mongoose);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await SharedLink.deleteMany({});
    await Message.deleteMany({});
    await Conversation.deleteMany({});
    await File.deleteMany({});
  });

  describe('createSharedLink', () => {
    test('should create a new shared link', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;

      // Create test conversation
      await Conversation.create({
        conversationId,
        title: 'Test Conversation',
        user: userId,
      });

      // Create test messages
      await Message.create([
        {
          messageId: `msg_${nanoid()}`,
          conversationId,
          user: userId,
          text: 'Hello',
          isCreatedByUser: true,
        },
        {
          messageId: `msg_${nanoid()}`,
          conversationId,
          user: userId,
          text: 'World',
          isCreatedByUser: false,
          model: 'gpt-4',
        },
      ]);

      const result = await shareMethods.createSharedLink(userId, conversationId);

      expect(result).toBeDefined();
      expect(result._id).toBeDefined();
      expect(result.shareId).toBeDefined();
      expect(result.conversationId).toBe(conversationId);

      // Verify the share was created in the database
      const savedShare = await SharedLink.findOne({ shareId: result.shareId });
      expect(savedShare).toBeDefined();
      expect(savedShare?.user).toBe(userId);
      expect(savedShare?.title).toBe('Test Conversation');
      expect(savedShare?.messages).toHaveLength(2);
    });

    test('should throw error if share already exists', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;

      await Conversation.create({
        conversationId,
        title: 'Test Conversation',
        user: userId,
      });

      // Create messages so we can create a share
      await Message.create({
        messageId: `msg_${nanoid()}`,
        conversationId,
        user: userId,
        text: 'Test message',
        isCreatedByUser: true,
      });

      // Create first share
      await shareMethods.createSharedLink(userId, conversationId);

      // Try to create duplicate
      await expect(shareMethods.createSharedLink(userId, conversationId)).rejects.toThrow(
        'Share already exists',
      );
    });

    test('should ignore expired shares when checking for duplicates', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;
      const expiredShareId = `share_${nanoid()}`;

      await Conversation.create({
        conversationId,
        title: 'Test Conversation',
        user: userId,
      });

      const message = await Message.create({
        messageId: `msg_${nanoid()}`,
        conversationId,
        user: userId,
        text: 'Test message',
        isCreatedByUser: true,
      });

      await SharedLink.create({
        shareId: expiredShareId,
        conversationId,
        user: userId,
        messages: [message._id],
        expiredAt: new Date(Date.now() - 60 * 60 * 1000),
      });

      const result = await shareMethods.createSharedLink(userId, conversationId);

      expect(result.shareId).toBeDefined();
      expect(result.shareId).not.toBe(expiredShareId);
      expect(result.conversationId).toBe(conversationId);
    });

    test('should throw error with missing parameters', async () => {
      await expect(shareMethods.createSharedLink('', 'conv123')).rejects.toThrow(
        'Missing required parameters',
      );

      await expect(shareMethods.createSharedLink('user123', '')).rejects.toThrow(
        'Missing required parameters',
      );
    });

    test('should only include messages from the same user', async () => {
      const userId1 = new mongoose.Types.ObjectId().toString();
      const userId2 = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;

      await Conversation.create({
        conversationId,
        title: 'Test Conversation',
        user: userId1,
      });

      // Create messages from different users
      await Message.create([
        {
          messageId: `msg_${nanoid()}`,
          conversationId,
          user: userId1,
          text: 'User 1 message',
          isCreatedByUser: true,
        },
        {
          messageId: `msg_${nanoid()}`,
          conversationId,
          user: userId2,
          text: 'User 2 message',
          isCreatedByUser: true,
        },
      ]);

      const result = await shareMethods.createSharedLink(userId1, conversationId);

      const savedShare = await SharedLink.findOne({ shareId: result.shareId }).populate('messages');
      expect(savedShare?.messages).toHaveLength(1);
      expect((savedShare?.messages?.[0] as unknown as t.IMessage | undefined)?.text).toBe(
        'User 1 message',
      );
    });

    test('should not allow user to create shared link for conversation they do not own', async () => {
      const ownerUserId = new mongoose.Types.ObjectId().toString();
      const otherUserId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;

      // Create conversation owned by ownerUserId
      await Conversation.create({
        conversationId,
        title: 'Owner Conversation',
        user: ownerUserId,
      });

      // Create messages for the conversation
      await Message.create([
        {
          messageId: `msg_${nanoid()}`,
          conversationId,
          user: ownerUserId,
          text: 'Owner message',
          isCreatedByUser: true,
        },
      ]);

      // Try to create a shared link as a different user
      await expect(shareMethods.createSharedLink(otherUserId, conversationId)).rejects.toThrow(
        'Conversation not found or access denied',
      );

      // Verify no share was created
      const shares = await SharedLink.find({ conversationId });
      expect(shares).toHaveLength(0);
    });

    test('should not allow creating share for conversation with no messages', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;

      // Create conversation without any messages
      await Conversation.create({
        conversationId,
        title: 'Empty Conversation',
        user: userId,
      });

      // Try to create a shared link for conversation with no messages
      await expect(shareMethods.createSharedLink(userId, conversationId)).rejects.toThrow(
        'No messages to share',
      );

      // Verify no share was created
      const shares = await SharedLink.find({ conversationId });
      expect(shares).toHaveLength(0);
    });
  });

  describe('getSharedMessages', () => {
    test('should retrieve and anonymize shared messages', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;
      const shareId = `share_${nanoid()}`;

      // Create messages
      const messages = await Message.create([
        {
          messageId: `msg_${nanoid()}`,
          conversationId,
          user: userId,
          text: 'Hello',
          isCreatedByUser: true,
          parentMessageId: Constants.NO_PARENT,
        },
        {
          messageId: `msg_${nanoid()}`,
          conversationId,
          user: userId,
          text: 'World',
          isCreatedByUser: false,
          model: 'gpt-4',
          parentMessageId: Constants.NO_PARENT,
        },
      ]);

      // Create shared link
      await SharedLink.create({
        shareId,
        conversationId,
        user: userId,
        title: 'Test Share',
        messages: messages.map((m) => m._id),
      });

      const result = await shareMethods.getSharedMessages(shareId);

      expect(result).toBeDefined();
      expect(result?.shareId).toBe(shareId);
      expect(result?.conversationId).not.toBe(conversationId); // Should be anonymized
      expect(result?.messages).toHaveLength(2);

      // Check anonymization
      result?.messages.forEach((msg) => {
        expect(msg.messageId).toMatch(/^msg_/); // Should be anonymized with msg_ prefix
        expect(msg.messageId).not.toBe(messages[0].messageId); // Should be different from original
        expect(msg.conversationId).toBe(result.conversationId);
        expect((msg as Record<string, unknown>).user).toBeUndefined(); // User should be removed
      });
    });

    test('should return null for non-existent share', async () => {
      const result = await shareMethods.getSharedMessages('non_existent_share');
      expect(result).toBeNull();
    });

    test('should return null for expired share', async () => {
      const shareId = `share_${nanoid()}`;

      await SharedLink.create({
        shareId,
        conversationId: 'conv123',
        user: 'user123',
        expiredAt: new Date(Date.now() - 60 * 60 * 1000),
      });

      const result = await shareMethods.getSharedMessages(shareId);
      expect(result).toBeNull();
    });

    test('should handle messages with attachments', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;
      const shareId = `share_${nanoid()}`;

      const message = await Message.create({
        messageId: `msg_${nanoid()}`,
        conversationId,
        user: userId,
        text: 'Message with attachment',
        isCreatedByUser: true,
        attachments: [
          {
            file_id: 'file123',
            filename: 'test.pdf',
            type: 'application/pdf',
          },
        ],
      });

      await SharedLink.create({
        shareId,
        conversationId,
        user: userId,
        messages: [message._id],
      });

      const result = await shareMethods.getSharedMessages(shareId);

      expect(result?.messages[0].attachments).toHaveLength(1);
      expect(
        (result?.messages[0].attachments?.[0] as unknown as t.IMessage | undefined)?.messageId,
      ).toBe(result?.messages[0].messageId);
      expect(
        (result?.messages[0].attachments?.[0] as unknown as t.IMessage | undefined)?.conversationId,
      ).toBe(result?.conversationId);
    });

    test('strips storage-internal fields while preserving shared render data', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;
      const shareId = `share_${nanoid()}`;

      const message = await Message.create({
        messageId: `msg_${nanoid()}`,
        conversationId,
        user: userId,
        text: 'safe text',
        isCreatedByUser: false,
        model: 'gpt-4',
        iconURL: 'https://cdn.example.com/icon.png',
        endpoint: 'openAI',
        conversationSignature: 'signature',
        clientId: 'client-id',
        plugin: { latest: 'internal' },
        metadata: { codeEnvRef: 'internal-ref' },
        feedback: { rating: 'thumbsDown', tag: { key: 'inaccurate' }, text: 'private note' },
        manualSkills: ['research'],
        alwaysAppliedSkills: ['brand-voice'],
        files: [
          {
            file_id: 'file123',
            filename: 'upload.png',
            type: 'image/png',
            width: 100,
            height: 100,
            filepath: '/images/upload.png',
            conversationId,
            user: userId,
            tenantId: 'tenant-a',
            storageKey: 'private/upload.png',
            source: 's3',
          },
        ],
        attachments: [
          {
            toolCallId: 'call_abc',
            type: 'web_search',
            web_search: { results: [{ title: 'Cited source', link: 'https://example.com' }] },
            filename: 'result.json',
            filepath: '/images/result.json',
            storageKey: 'private/result.json',
            metadata: { codeEnvRef: 'internal-ref' },
          },
        ],
      });

      await SharedLink.create({
        shareId,
        conversationId,
        user: userId,
        messages: [message._id],
      });

      const result = await shareMethods.getSharedMessages(shareId);
      const shared = result?.messages[0];

      expect(shared?.text).toBe('safe text');
      // Custom message icon is render metadata and should be preserved.
      expect(shared?.iconURL).toBe('https://cdn.example.com/icon.png');
      // Non-assistant model and internal message fields must not be disclosed.
      expect(shared?.model).toBeUndefined();
      expect(shared).not.toHaveProperty('endpoint');
      expect(shared).not.toHaveProperty('conversationSignature');
      expect(shared).not.toHaveProperty('clientId');
      expect(shared).not.toHaveProperty('plugin');
      expect(shared).not.toHaveProperty('metadata');
      // Private owner feedback is not render data and must not leak publicly.
      expect(shared).not.toHaveProperty('feedback');
      // Skill badges are non-sensitive UI metadata and should still render.
      expect(shared?.manualSkills).toEqual(['research']);
      expect(shared?.alwaysAppliedSkills).toEqual(['brand-voice']);

      // User-uploaded files keep their render URL (filepath/preview) but drop storage internals.
      const file = shared?.files?.[0];
      expect(file).toMatchObject({ filename: 'upload.png', type: 'image/png' });
      expect(file?.filepath).toBe('/images/upload.png');
      expect(file).not.toHaveProperty('storageKey');
      expect(file).not.toHaveProperty('user');
      expect(file).not.toHaveProperty('tenantId');
      expect(file).not.toHaveProperty('source');
      // The file's conversation id is rewritten to the anonymized id, not the original.
      expect(file?.conversationId).toBe(shared?.conversationId);
      expect(file?.conversationId).not.toBe(conversationId);

      // Tool-call attachments keep their correlation id, payload, and render URL so
      // citations still render, while storage-only fields are removed.
      const attachment = shared?.attachments?.[0];
      expect(attachment).toMatchObject({
        toolCallId: 'call_abc',
        type: 'web_search',
        web_search: { results: [{ title: 'Cited source', link: 'https://example.com' }] },
        filepath: '/images/result.json',
      });
      expect(attachment).not.toHaveProperty('storageKey');
      expect(attachment).not.toHaveProperty('metadata');
    });
  });

  describe('getSharedLinks', () => {
    test('should retrieve paginated shared links for a user', async () => {
      const userId = new mongoose.Types.ObjectId().toString();

      // Create multiple shared links
      const sharePromises = Array.from({ length: 15 }, (_, i) =>
        SharedLink.create({
          shareId: `share_${i}`,
          conversationId: `conv_${i}`,
          user: userId,
          title: `Share ${i}`,
          createdAt: new Date(Date.now() - i * 1000 * 60), // Different timestamps
        }),
      );

      await Promise.all(sharePromises);

      const result = await shareMethods.getSharedLinks(userId, undefined, 10);

      expect(result.links).toHaveLength(10);
      expect(result.hasNextPage).toBe(true);
      expect(result.nextCursor).toBeDefined();

      // Check ordering (newest first by default)
      expect(result.links[0].title).toBe('Share 0');
      expect(result.links[9].title).toBe('Share 9');
    });

    test('should exclude expired shares', async () => {
      const userId = new mongoose.Types.ObjectId().toString();

      await SharedLink.create([
        {
          shareId: 'active_share',
          conversationId: 'conv1',
          user: userId,
          title: 'Active Share',
          expiredAt: new Date(Date.now() + 60 * 60 * 1000),
        },
        {
          shareId: 'expired_share',
          conversationId: 'conv2',
          user: userId,
          title: 'Expired Share',
          expiredAt: new Date(Date.now() - 60 * 60 * 1000),
        },
      ]);

      const result = await shareMethods.getSharedLinks(userId, undefined, 10);

      expect(result.links).toHaveLength(1);
      expect(result.links[0].shareId).toBe('active_share');
    });

    test('should handle search with mocked meiliSearch and user filter', async () => {
      const userId = new mongoose.Types.ObjectId().toString();

      // Mock meiliSearch method
      const meiliSearchMock = jest.fn().mockResolvedValue({
        hits: [{ conversationId: 'conv1' }],
      });
      Conversation.meiliSearch = meiliSearchMock;

      await SharedLink.create([
        {
          shareId: 'share1',
          conversationId: 'conv1',
          user: userId,
          title: 'Matching Share',
        },
        {
          shareId: 'share2',
          conversationId: 'conv2',
          user: userId,
          title: 'Non-matching Share',
        },
      ]);

      const result = await shareMethods.getSharedLinks(
        userId,
        undefined,
        10,
        'createdAt',
        'desc',
        'search term',
      );

      expect(result.links).toHaveLength(1);
      expect(result.links[0].title).toBe('Matching Share');

      // Verify that meiliSearch was called with the correct user filter
      expect(meiliSearchMock).toHaveBeenCalledWith('search term', { filter: `user = "${userId}"` });
    });

    test('should handle empty results', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const result = await shareMethods.getSharedLinks(userId);

      expect(result.links).toHaveLength(0);
      expect(result.hasNextPage).toBe(false);
      expect(result.nextCursor).toBeUndefined();
    });

    test('should only return shares from search results for the current user', async () => {
      const userId1 = new mongoose.Types.ObjectId().toString();
      const userId2 = new mongoose.Types.ObjectId().toString();

      // Mock meiliSearch to simulate finding conversations from both users
      const meiliSearchMock = jest.fn().mockImplementation((searchTerm, params) => {
        // Simulate MeiliSearch filtering by user
        const filter = params?.filter;
        if (filter && filter.includes(userId1)) {
          return Promise.resolve({
            hits: [{ conversationId: 'conv1' }, { conversationId: 'conv3' }],
          });
        } else if (filter && filter.includes(userId2)) {
          return Promise.resolve({ hits: [{ conversationId: 'conv2' }] });
        }
        // Without filter, would return all conversations (security issue)
        return Promise.resolve({
          hits: [
            { conversationId: 'conv1' },
            { conversationId: 'conv2' },
            { conversationId: 'conv3' },
          ],
        });
      });
      Conversation.meiliSearch = meiliSearchMock;

      // Create shares for different users
      await SharedLink.create([
        {
          shareId: 'share1',
          conversationId: 'conv1',
          user: userId1,
          title: 'User 1 Share',
        },
        {
          shareId: 'share2',
          conversationId: 'conv2',
          user: userId2,
          title: 'User 2 Share',
        },
        {
          shareId: 'share3',
          conversationId: 'conv3',
          user: userId1,
          title: 'Another User 1 Share',
        },
      ]);

      // Search as userId1
      const result1 = await shareMethods.getSharedLinks(
        userId1,
        undefined,
        10,
        'createdAt',
        'desc',
        'search term',
      );

      // Should only get shares from conversations belonging to userId1
      expect(result1.links).toHaveLength(2);
      expect(result1.links.every((link) => link.title.includes('User 1'))).toBe(true);

      // Verify correct filter was used
      expect(meiliSearchMock).toHaveBeenCalledWith('search term', {
        filter: `user = "${userId1}"`,
      });

      // Search as userId2
      const result2 = await shareMethods.getSharedLinks(
        userId2,
        undefined,
        10,
        'createdAt',
        'desc',
        'search term',
      );

      // Should only get shares from conversations belonging to userId2
      expect(result2.links).toHaveLength(1);
      expect(result2.links[0].title).toBe('User 2 Share');

      // Verify correct filter was used for second user
      expect(meiliSearchMock).toHaveBeenCalledWith('search term', {
        filter: `user = "${userId2}"`,
      });
    });

    test('should only return shares for the specified user', async () => {
      const userId1 = new mongoose.Types.ObjectId().toString();
      const userId2 = new mongoose.Types.ObjectId().toString();

      // Create shares for different users
      await SharedLink.create([
        {
          shareId: 'share1',
          conversationId: 'conv1',
          user: userId1,
          title: 'User 1 Share',
        },
        {
          shareId: 'share2',
          conversationId: 'conv2',
          user: userId2,
          title: 'User 2 Share',
        },
        {
          shareId: 'share3',
          conversationId: 'conv3',
          user: userId1,
          title: 'Another User 1 Share',
        },
      ]);

      const result1 = await shareMethods.getSharedLinks(userId1);
      const result2 = await shareMethods.getSharedLinks(userId2);

      expect(result1.links).toHaveLength(2);
      expect(result1.links.every((link) => link.title.includes('User 1'))).toBe(true);

      expect(result2.links).toHaveLength(1);
      expect(result2.links[0].title).toBe('User 2 Share');
    });
  });

  describe('updateSharedLink', () => {
    test('should update shared link with new messages', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;
      const oldShareId = `share_${nanoid()}`;

      // Create initial messages
      const initialMessages = await Message.create([
        {
          messageId: `msg_1`,
          conversationId,
          user: userId,
          text: 'Initial message',
          isCreatedByUser: true,
        },
      ]);

      // Create shared link
      await SharedLink.create({
        shareId: oldShareId,
        conversationId,
        user: userId,
        messages: initialMessages.map((m) => m._id),
      });

      // Add new message
      await Message.create({
        messageId: `msg_2`,
        conversationId,
        user: userId,
        text: 'New message',
        isCreatedByUser: false,
      });

      const result = await shareMethods.updateSharedLink(userId, oldShareId);

      expect(result._id).toBeDefined();
      expect(result.shareId).not.toBe(oldShareId); // Should generate new shareId
      expect(result.conversationId).toBe(conversationId);

      // Verify updated share
      const updatedShare = await SharedLink.findOne({ shareId: result.shareId }).populate(
        'messages',
      );
      expect(updatedShare?.messages).toHaveLength(2);
    });

    test('should preserve stale expiration when updating without an expiration decision', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;
      const shareId = `share_${nanoid()}`;
      const expiresAt = new Date('2030-01-01T00:00:00.000Z');

      await SharedLink.create({
        shareId,
        conversationId,
        user: userId,
        messages: [],
        expiredAt: expiresAt,
      });
      await Message.create({
        messageId: `msg_${nanoid()}`,
        conversationId,
        user: userId,
        text: 'Retained no longer applies',
        isCreatedByUser: true,
      });

      const result = await shareMethods.updateSharedLink(userId, shareId);
      const updatedShare = await SharedLink.findOne({ shareId: result.shareId }).lean();

      expect(updatedShare?.expiredAt?.toISOString()).toBe(expiresAt.toISOString());
    });

    test('should clear stale expiration when updating with null expiration', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;
      const shareId = `share_${nanoid()}`;
      const expiresAt = new Date('2030-01-01T00:00:00.000Z');

      await SharedLink.create({
        shareId,
        conversationId,
        user: userId,
        messages: [],
        expiredAt: expiresAt,
      });
      await Message.create({
        messageId: `msg_${nanoid()}`,
        conversationId,
        user: userId,
        text: 'Retained no longer applies',
        isCreatedByUser: true,
      });

      const result = await shareMethods.updateSharedLink(userId, shareId, undefined, null);
      const updatedShare = await SharedLink.findOne({ shareId: result.shareId }).lean();

      expect(updatedShare?.expiredAt).toBeUndefined();
    });

    test('should throw error if share not found', async () => {
      await expect(shareMethods.updateSharedLink('user123', 'non_existent')).rejects.toThrow(
        'Share not found',
      );
    });

    test('should throw error with missing parameters', async () => {
      await expect(shareMethods.updateSharedLink('', 'share123')).rejects.toThrow(
        'Missing required parameters',
      );
    });

    test('should only update with messages from the same user', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const otherUserId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;
      const shareId = `share_${nanoid()}`;

      // Create initial share
      await SharedLink.create({
        shareId,
        conversationId,
        user: userId,
        messages: [],
      });

      // Add messages from different users
      await Message.create([
        {
          messageId: `msg_1`,
          conversationId,
          user: userId,
          text: 'User message',
          isCreatedByUser: true,
        },
        {
          messageId: `msg_2`,
          conversationId,
          user: otherUserId,
          text: 'Other user message',
          isCreatedByUser: true,
        },
      ]);

      const result = await shareMethods.updateSharedLink(userId, shareId);

      const updatedShare = await SharedLink.findOne({ shareId: result.shareId }).populate(
        'messages',
      );
      expect(updatedShare?.messages).toHaveLength(1);
      expect((updatedShare?.messages?.[0] as unknown as t.IMessage | undefined)?.text).toBe(
        'User message',
      );
    });

    test('should update branch target to the latest refreshed message', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;
      const shareId = `share_${nanoid()}`;
      const rootMessageId = `msg_${nanoid()}`;
      const oldAnswerId = `msg_${nanoid()}`;
      const rerunPromptId = `msg_${nanoid()}`;
      const rerunAnswerId = `msg_${nanoid()}`;

      await Conversation.create({
        conversationId,
        title: 'Analysis Conversation',
        user: userId,
      });

      const initialMessages = await Message.create([
        {
          messageId: rootMessageId,
          conversationId,
          user: userId,
          text: 'Analyze February 2023 to October 2025',
          isCreatedByUser: true,
          parentMessageId: Constants.NO_PARENT,
        },
        {
          messageId: oldAnswerId,
          conversationId,
          user: userId,
          text: 'Old analysis result',
          isCreatedByUser: false,
          parentMessageId: rootMessageId,
        },
      ]);

      await SharedLink.create({
        shareId,
        conversationId,
        user: userId,
        messages: initialMessages.map((message) => message._id),
        targetMessageId: oldAnswerId,
      });

      await Message.create([
        {
          messageId: rerunPromptId,
          conversationId,
          user: userId,
          text: 'Rerun for March 2023 to January 2026',
          isCreatedByUser: true,
          parentMessageId: oldAnswerId,
        },
        {
          messageId: rerunAnswerId,
          conversationId,
          user: userId,
          text: 'Updated analysis result',
          isCreatedByUser: false,
          parentMessageId: rerunPromptId,
        },
      ]);

      const result = await shareMethods.updateSharedLink(userId, shareId, rerunAnswerId);
      const updatedShare = await SharedLink.findOne({ shareId: result.shareId }).populate(
        'messages',
      );
      const sharedMessages = await shareMethods.getSharedMessages(result.shareId);

      expect(result.shareId).not.toBe(shareId);
      expect(result.targetMessageId).toBe(rerunAnswerId);
      expect(updatedShare?.targetMessageId).toBe(rerunAnswerId);
      expect(updatedShare?.messages).toHaveLength(4);
      expect(sharedMessages?.messages.map((message) => message.text)).toEqual([
        'Analyze February 2023 to October 2025',
        'Old analysis result',
        'Rerun for March 2023 to January 2026',
        'Updated analysis result',
      ]);
    });

    test('should preserve existing branch target when refresh has no target override', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;
      const shareId = `share_${nanoid()}`;
      const targetMessageId = `msg_${nanoid()}`;

      await SharedLink.create({
        shareId,
        conversationId,
        user: userId,
        messages: [],
        targetMessageId,
      });

      const result = await shareMethods.updateSharedLink(userId, shareId);
      const updatedShare = await SharedLink.findOne({ shareId: result.shareId });

      expect(result.targetMessageId).toBe(targetMessageId);
      expect(updatedShare?.targetMessageId).toBe(targetMessageId);
    });

    test('should not allow user to update shared link they do not own', async () => {
      const ownerUserId = new mongoose.Types.ObjectId().toString();
      const otherUserId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;
      const shareId = `share_${nanoid()}`;

      // Create shared link owned by ownerUserId
      await SharedLink.create({
        shareId,
        conversationId,
        user: ownerUserId,
        messages: [],
      });

      // Try to update as a different user
      await expect(shareMethods.updateSharedLink(otherUserId, shareId)).rejects.toThrow(
        'Share not found',
      );

      // Verify the original share still exists and is unchanged
      const originalShare = await SharedLink.findOne({ shareId });
      expect(originalShare).toBeDefined();
      expect(originalShare?.user).toBe(ownerUserId);
    });
  });

  describe('deleteSharedLink', () => {
    test('should delete shared link', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const shareId = `share_${nanoid()}`;

      await SharedLink.create({
        shareId,
        conversationId: 'conv123',
        user: userId,
      });

      const result = await shareMethods.deleteSharedLink(userId, shareId);

      expect(result).toBeDefined();
      expect(result?.success).toBe(true);
      expect(result?.shareId).toBe(shareId);

      // Verify deletion
      const deletedShare = await SharedLink.findOne({ shareId });
      expect(deletedShare).toBeNull();
    });

    test('should return null if share not found', async () => {
      const result = await shareMethods.deleteSharedLink('user123', 'non_existent');
      expect(result).toBeNull();
    });

    test('should not delete share from different user', async () => {
      const userId1 = new mongoose.Types.ObjectId().toString();
      const userId2 = new mongoose.Types.ObjectId().toString();
      const shareId = `share_${nanoid()}`;

      await SharedLink.create({
        shareId,
        conversationId: 'conv123',
        user: userId1,
      });

      const result = await shareMethods.deleteSharedLink(userId2, shareId);
      expect(result).toBeNull();

      // Verify share still exists
      const share = await SharedLink.findOne({ shareId });
      expect(share).toBeDefined();
    });

    test('should handle missing parameters for deleteSharedLink', async () => {
      await expect(shareMethods.deleteSharedLink('', 'share123')).rejects.toThrow(
        'Missing required parameters',
      );

      await expect(shareMethods.deleteSharedLink('user123', '')).rejects.toThrow(
        'Missing required parameters',
      );
    });
  });

  describe('getSharedLink', () => {
    test('should retrieve existing shared link', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;
      const shareId = `share_${nanoid()}`;

      await SharedLink.create({
        shareId,
        conversationId,
        user: userId,
      });

      const result = await shareMethods.getSharedLink(userId, conversationId);

      expect(result._id).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.shareId).toBe(shareId);
    });

    test('should return null shareId if not found', async () => {
      const result = await shareMethods.getSharedLink('user123', 'conv123');

      expect(result.success).toBe(false);
      expect(result.shareId).toBeNull();
    });

    test('should return null shareId for expired shares', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;

      await SharedLink.create({
        shareId: 'share123',
        conversationId,
        user: userId,
        expiredAt: new Date(Date.now() - 60 * 60 * 1000),
      });

      const result = await shareMethods.getSharedLink(userId, conversationId);

      expect(result.success).toBe(false);
      expect(result.shareId).toBeNull();
    });

    test('should not return share from different user', async () => {
      const userId1 = new mongoose.Types.ObjectId().toString();
      const userId2 = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;

      await SharedLink.create({
        shareId: 'share123',
        conversationId,
        user: userId1,
      });

      const result = await shareMethods.getSharedLink(userId2, conversationId);

      expect(result.success).toBe(false);
      expect(result.shareId).toBeNull();
    });

    test('should handle missing parameters for getSharedLink', async () => {
      await expect(shareMethods.getSharedLink('', 'conv123')).rejects.toThrow(
        'Missing required parameters',
      );

      await expect(shareMethods.getSharedLink('user123', '')).rejects.toThrow(
        'Missing required parameters',
      );
    });
  });

  describe('deleteAllSharedLinks', () => {
    test('should delete all shared links for a user', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const otherUserId = new mongoose.Types.ObjectId().toString();

      // Create shares for different users
      await SharedLink.create([
        { shareId: 'share1', conversationId: 'conv1', user: userId },
        { shareId: 'share2', conversationId: 'conv2', user: userId },
        { shareId: 'share3', conversationId: 'conv3', user: otherUserId },
      ]);

      const result = await shareMethods.deleteAllSharedLinks(userId);

      expect(result.deletedCount).toBe(2);
      expect(result.message).toContain('successfully');

      // Verify only user's shares were deleted
      const remainingShares = await SharedLink.find({});
      expect(remainingShares).toHaveLength(1);
      expect(remainingShares[0].user).toBe(otherUserId);
    });

    test('should handle when no shares exist', async () => {
      const result = await shareMethods.deleteAllSharedLinks('user123');

      expect(result.deletedCount).toBe(0);
      expect(result.message).toContain('successfully');
    });

    test('should only delete shares belonging to the specified user', async () => {
      const userId1 = new mongoose.Types.ObjectId().toString();
      const userId2 = new mongoose.Types.ObjectId().toString();
      const userId3 = new mongoose.Types.ObjectId().toString();

      // Create multiple shares for different users
      await SharedLink.create([
        { shareId: 'share1', conversationId: 'conv1', user: userId1 },
        { shareId: 'share2', conversationId: 'conv2', user: userId1 },
        { shareId: 'share3', conversationId: 'conv3', user: userId2 },
        { shareId: 'share4', conversationId: 'conv4', user: userId2 },
        { shareId: 'share5', conversationId: 'conv5', user: userId3 },
      ]);

      // Delete all shares for userId1
      const result = await shareMethods.deleteAllSharedLinks(userId1);
      expect(result.deletedCount).toBe(2);

      // Verify shares for other users still exist
      const remainingShares = await SharedLink.find({});
      expect(remainingShares).toHaveLength(3);
      expect(remainingShares.every((share) => share.user !== userId1)).toBe(true);

      // Verify specific users' shares remain
      const user2Shares = await SharedLink.find({ user: userId2 });
      expect(user2Shares).toHaveLength(2);

      const user3Shares = await SharedLink.find({ user: userId3 });
      expect(user3Shares).toHaveLength(1);
    });
  });

  describe('deleteConvoSharedLink', () => {
    test('should delete all shared links for a specific conversation', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId1 = 'conv-to-delete';
      const conversationId2 = 'conv-to-keep';

      await SharedLink.create([
        { shareId: 'share1', conversationId: conversationId1, user: userId },
        { shareId: 'share2', conversationId: conversationId1, user: userId },
        { shareId: 'share3', conversationId: conversationId2, user: userId },
      ]);

      const result = await shareMethods.deleteConvoSharedLink(userId, conversationId1);

      expect(result.deletedCount).toBe(2);
      expect(result.message).toContain('successfully');

      const remainingShares = await SharedLink.find({});
      expect(remainingShares).toHaveLength(1);
      expect(remainingShares[0].conversationId).toBe(conversationId2);
    });

    test('should only delete shares for the specified user and conversation', async () => {
      const userId1 = new mongoose.Types.ObjectId().toString();
      const userId2 = new mongoose.Types.ObjectId().toString();
      const conversationId = 'shared-conv';

      await SharedLink.create([
        { shareId: 'share1', conversationId, user: userId1 },
        { shareId: 'share2', conversationId, user: userId2 },
        { shareId: 'share3', conversationId: 'other-conv', user: userId1 },
      ]);

      const result = await shareMethods.deleteConvoSharedLink(userId1, conversationId);

      expect(result.deletedCount).toBe(1);

      const remainingShares = await SharedLink.find({});
      expect(remainingShares).toHaveLength(2);
      expect(
        remainingShares.some((s) => s.user === userId2 && s.conversationId === conversationId),
      ).toBe(true);
      expect(
        remainingShares.some((s) => s.user === userId1 && s.conversationId === 'other-conv'),
      ).toBe(true);
    });

    test('should handle when no shares exist for the conversation', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = 'nonexistent-conv';

      const result = await shareMethods.deleteConvoSharedLink(userId, conversationId);

      expect(result.deletedCount).toBe(0);
      expect(result.message).toContain('successfully');
    });

    test('should throw error when userId is missing', async () => {
      await expect(shareMethods.deleteConvoSharedLink('', 'conv123')).rejects.toThrow(
        'Missing required parameters',
      );
    });

    test('should throw error when conversationId is missing', async () => {
      await expect(shareMethods.deleteConvoSharedLink('user123', '')).rejects.toThrow(
        'Missing required parameters',
      );
    });

    test('should delete multiple shared links for same conversation', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = 'conv-with-many-shares';

      await SharedLink.create([
        { shareId: 'share1', conversationId, user: userId },
        {
          shareId: 'share2',
          conversationId,
          user: userId,
          targetMessageId: 'msg1',
        },
        {
          shareId: 'share3',
          conversationId,
          user: userId,
          targetMessageId: 'msg2',
        },
        { shareId: 'share4', conversationId, user: userId },
      ]);

      const result = await shareMethods.deleteConvoSharedLink(userId, conversationId);

      expect(result.deletedCount).toBe(4);

      const remainingShares = await SharedLink.find({ conversationId, user: userId });
      expect(remainingShares).toHaveLength(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle conversation with special characters in ID', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = 'conv|with|pipes';

      await Conversation.create({
        conversationId,
        title: 'Special Conversation',
        user: userId,
      });

      // Create a message so we can create a share
      await Message.create({
        messageId: `msg_${nanoid()}`,
        conversationId,
        user: userId,
        text: 'Test message',
        isCreatedByUser: true,
      });

      const result = await shareMethods.createSharedLink(userId, conversationId);

      expect(result).toBeDefined();
      expect(result.conversationId).toBe(conversationId);
    });

    test('should handle messages with assistant_id', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;
      const shareId = `share_${nanoid()}`;

      const message = await Message.create({
        messageId: `msg_${nanoid()}`,
        conversationId,
        user: userId,
        text: 'Assistant message',
        isCreatedByUser: false,
        model: 'asst_123456',
      });

      await SharedLink.create({
        shareId,
        conversationId,
        user: userId,
        messages: [message._id],
      });

      const result = await shareMethods.getSharedMessages(shareId);

      expect(result?.messages[0].model).toMatch(/^a_/); // Should be anonymized
    });

    test('should handle concurrent operations', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationIds = Array.from({ length: 5 }, () => `conv_${nanoid()}`);

      // Create conversations and messages
      await Promise.all(
        conversationIds.map(async (id) => {
          await Conversation.create({
            conversationId: id,
            title: `Conversation ${id}`,
            user: userId,
          });
          // Create a message for each conversation
          await Message.create({
            messageId: `msg_${nanoid()}`,
            conversationId: id,
            user: userId,
            text: `Message for ${id}`,
            isCreatedByUser: true,
          });
        }),
      );

      // Concurrent share creation
      const createPromises = conversationIds.map((id) => shareMethods.createSharedLink(userId, id));

      const results = await Promise.all(createPromises);

      expect(results).toHaveLength(5);
      results.forEach((result, index) => {
        expect(result.shareId).toBeDefined();
        expect(result.conversationId).toBe(conversationIds[index]);
      });
    });

    test('should handle database errors gracefully', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;

      // Create conversation and message first
      await Conversation.create({
        conversationId,
        title: 'Test Conversation',
        user: userId,
      });

      await Message.create({
        messageId: `msg_${nanoid()}`,
        conversationId,
        user: userId,
        text: 'Test message',
        isCreatedByUser: true,
      });

      // Mock a database error
      const originalCreate = SharedLink.create;
      SharedLink.create = jest.fn().mockRejectedValue(new Error('Database error'));

      await expect(shareMethods.createSharedLink(userId, conversationId)).rejects.toThrow(
        'Error creating shared link',
      );

      SharedLink.create = originalCreate;
    });
  });

  describe('Anonymization', () => {
    beforeEach(() => {
      // Ensure any mocks are restored before each test
      jest.restoreAllMocks();
    });

    test('should consistently anonymize IDs', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;
      const shareId = `share_${nanoid()}`;
      const messageId1 = `msg_${nanoid()}`;
      const messageId2 = `msg_${nanoid()}`;

      const messages = await Message.create([
        {
          messageId: messageId1,
          conversationId,
          user: userId,
          text: 'First message',
          isCreatedByUser: true,
          parentMessageId: Constants.NO_PARENT,
        },
        {
          messageId: messageId2,
          conversationId,
          user: userId,
          text: 'Second message',
          isCreatedByUser: false,
          parentMessageId: messageId1, // Reference to first message
        },
      ]);

      await SharedLink.create({
        shareId,
        conversationId,
        user: userId,
        messages: messages.map((m) => m._id),
      });

      const result = await shareMethods.getSharedMessages(shareId);

      // Check that anonymization is consistent within the same result
      expect(result?.messages).toHaveLength(2);

      // The second message's parentMessageId should match the first message's anonymized ID
      expect(result?.messages[1].parentMessageId).toBe(result?.messages[0].messageId);

      // Both messages should have the same anonymized conversationId
      expect(result?.messages[0].conversationId).toBe(result?.conversationId);
      expect(result?.messages[1].conversationId).toBe(result?.conversationId);
    });

    test('should handle NO_PARENT constant correctly', async () => {
      const { Constants } = await import('librechat-data-provider');
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;
      const shareId = `share_${nanoid()}`;

      const message = await Message.create({
        messageId: `msg_${nanoid()}`,
        conversationId,
        user: userId,
        text: 'Root message',
        isCreatedByUser: true,
        parentMessageId: Constants.NO_PARENT,
      });

      await SharedLink.create({
        shareId,
        conversationId,
        user: userId,
        messages: [message._id],
      });

      const result = await shareMethods.getSharedMessages(shareId);

      expect(result?.messages[0].parentMessageId).toBe(Constants.NO_PARENT);
    });
  });

  describe('file snapshots', () => {
    const seedConversation = async (userId: string, conversationId: string) => {
      await Conversation.create({ conversationId, title: 'Files Convo', user: userId });
    };

    const createFile = async (
      userId: string,
      overrides: Partial<t.IMongoFile> = {},
    ): Promise<string> => {
      const file_id = `file_${nanoid()}`;
      await File.create({
        user: userId,
        file_id,
        filename: 'report.pdf',
        filepath: `/uploads/${userId}/${file_id}`,
        type: 'application/pdf',
        bytes: 1024,
        source: 'local',
        ...overrides,
      });
      return file_id;
    };

    test('createSharedLink captures snapshots from message files and attachments', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;
      await seedConversation(userId, conversationId);

      const imageId = await createFile(userId, {
        type: 'image/png',
        filename: 'pic.png',
        filepath: `/images/${userId}/pic.png`,
        width: 100,
        height: 80,
      });
      const docId = await createFile(userId);

      await Message.create([
        {
          messageId: `msg_${nanoid()}`,
          conversationId,
          user: userId,
          text: 'with image',
          isCreatedByUser: true,
          files: [{ file_id: imageId, type: 'image/png', filepath: `/images/${userId}/pic.png` }],
        },
        {
          messageId: `msg_${nanoid()}`,
          conversationId,
          user: userId,
          text: 'with attachment',
          isCreatedByUser: false,
          attachments: [{ file_id: docId, type: 'application/pdf' }],
        },
      ]);

      const result = await shareMethods.createSharedLink(userId, conversationId);
      const saved = await SharedLink.findOne({ shareId: result.shareId }).lean();

      expect(saved?.fileSnapshots).toHaveLength(2);
      const byId = new Map(saved?.fileSnapshots?.map((s) => [s.file_id, s]));
      expect(byId.get(imageId)?.source).toBe('local');
      expect(byId.get(imageId)?.storageKey).toBeUndefined();
      expect(byId.get(docId)?.filename).toBe('report.pdf');
      expect(byId.get(docId)?.filepath).toBe(`/uploads/${userId}/${docId}`);
    });

    test('createSharedLink with snapshotFiles=false stores no snapshots', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;
      await seedConversation(userId, conversationId);
      const docId = await createFile(userId);
      await Message.create({
        messageId: `msg_${nanoid()}`,
        conversationId,
        user: userId,
        text: 'hi',
        isCreatedByUser: true,
        files: [{ file_id: docId }],
      });

      const result = await shareMethods.createSharedLink(
        userId,
        conversationId,
        undefined,
        undefined,
        false,
      );
      const saved = await SharedLink.findOne({ shareId: result.shareId }).lean();
      expect(saved?.fileSnapshots).toBeUndefined();
    });

    test('snapshots skip non-streamable sources and missing file records', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;
      await seedConversation(userId, conversationId);

      const remoteId = await createFile(userId, { source: 'openai' });
      const ghostId = `file_${nanoid()}`; // referenced but no File doc

      await Message.create({
        messageId: `msg_${nanoid()}`,
        conversationId,
        user: userId,
        text: 'hi',
        isCreatedByUser: true,
        files: [{ file_id: remoteId }, { file_id: ghostId }],
      });

      const result = await shareMethods.createSharedLink(userId, conversationId);
      const saved = await SharedLink.findOne({ shareId: result.shareId }).lean();
      expect(saved?.fileSnapshots ?? []).toHaveLength(0);
    });

    test('getSharedMessages rewrites snapshotted file URLs to the share route', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;
      await seedConversation(userId, conversationId);
      const docId = await createFile(userId);

      await Message.create({
        messageId: `msg_${nanoid()}`,
        conversationId,
        user: userId,
        text: 'doc',
        isCreatedByUser: true,
        files: [
          { file_id: docId, type: 'application/pdf', filepath: `/uploads/${userId}/${docId}` },
        ],
      });

      const { shareId } = await shareMethods.createSharedLink(userId, conversationId);
      const result = await shareMethods.getSharedMessages(shareId);

      const file = (result?.messages[0].files?.[0] ?? {}) as Record<string, unknown>;
      expect(file.filepath).toBe(`/api/share/${shareId}/files/${docId}`);
      // owner storage path must not leak
      expect(String(file.filepath)).not.toContain(userId);
    });

    test('getSharedMessages leaves non-snapshotted files untouched', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;
      await seedConversation(userId, conversationId);
      const remoteId = await createFile(userId, { source: 'openai' });
      const originalPath = `/uploads/${userId}/${remoteId}`;

      await Message.create({
        messageId: `msg_${nanoid()}`,
        conversationId,
        user: userId,
        text: 'doc',
        isCreatedByUser: true,
        files: [{ file_id: remoteId, filepath: originalPath }],
      });

      const { shareId } = await shareMethods.createSharedLink(userId, conversationId);
      const result = await shareMethods.getSharedMessages(shareId);
      const file = (result?.messages[0].files?.[0] ?? {}) as Record<string, unknown>;
      expect(file.filepath).toBe(originalPath);
    });

    test('updateSharedLink recomputes snapshots from current messages', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;
      await seedConversation(userId, conversationId);
      await Message.create({
        messageId: `msg_${nanoid()}`,
        conversationId,
        user: userId,
        text: 'no files yet',
        isCreatedByUser: true,
      });

      const created = await shareMethods.createSharedLink(userId, conversationId);
      let saved = await SharedLink.findOne({ shareId: created.shareId }).lean();
      expect(saved?.fileSnapshots ?? []).toHaveLength(0);

      const docId = await createFile(userId);
      await Message.create({
        messageId: `msg_${nanoid()}`,
        conversationId,
        user: userId,
        text: 'now with a file',
        isCreatedByUser: false,
        files: [{ file_id: docId }],
      });

      const updated = await shareMethods.updateSharedLink(userId, created.shareId);
      saved = await SharedLink.findOne({ shareId: updated.shareId }).lean();
      expect(saved?.fileSnapshots).toHaveLength(1);
      expect(saved?.fileSnapshots?.[0].file_id).toBe(docId);
    });

    test('getSharedLinkFile returns the entry, null for unknown files', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;
      await seedConversation(userId, conversationId);
      const docId = await createFile(userId);
      await Message.create({
        messageId: `msg_${nanoid()}`,
        conversationId,
        user: userId,
        text: 'doc',
        isCreatedByUser: true,
        files: [{ file_id: docId }],
      });

      const { shareId } = await shareMethods.createSharedLink(userId, conversationId);

      const found = await shareMethods.getSharedLinkFile(shareId, docId);
      expect(found.file?.file_id).toBe(docId);
      expect(found.hasSnapshots).toBe(true);

      const missing = await shareMethods.getSharedLinkFile(shareId, 'file_does_not_exist');
      expect(missing.file).toBeNull();
      expect(missing.hasSnapshots).toBe(true);
    });

    test('backfillSharedLinkFiles populates a legacy share missing snapshots', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;
      await seedConversation(userId, conversationId);
      const docId = await createFile(userId);
      const message = await Message.create({
        messageId: `msg_${nanoid()}`,
        conversationId,
        user: userId,
        text: 'doc',
        isCreatedByUser: true,
        files: [{ file_id: docId }],
      });

      const shareId = `share_${nanoid()}`;
      // legacy share: no fileSnapshots
      await SharedLink.create({
        shareId,
        conversationId,
        user: userId,
        messages: [message._id],
      });

      const before = await shareMethods.getSharedLinkFile(shareId, docId);
      expect(before.file).toBeNull();
      expect(before.hasSnapshots).toBe(false);

      const backfilled = await shareMethods.backfillSharedLinkFiles(shareId, docId);
      expect((backfilled as t.SharedFileSnapshot)?.file_id).toBe(docId);

      const saved = await SharedLink.findOne({ shareId }).lean();
      expect(saved?.fileSnapshots).toHaveLength(1);
    });

    test('does not snapshot a file owned by another user', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const otherUserId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;
      await seedConversation(userId, conversationId);
      // File belongs to another user but is referenced in the sharer's message.
      const victimId = await createFile(otherUserId);

      await Message.create({
        messageId: `msg_${nanoid()}`,
        conversationId,
        user: userId,
        text: 'borrowed file id',
        isCreatedByUser: true,
        files: [{ file_id: victimId }],
      });

      const result = await shareMethods.createSharedLink(userId, conversationId);
      const saved = await SharedLink.findOne({ shareId: result.shareId }).lean();
      expect(saved?.fileSnapshots ?? []).toHaveLength(0);
    });

    test('getSharedMessages does not rewrite URLs when snapshotFiles is disabled', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;
      await seedConversation(userId, conversationId);
      const docId = await createFile(userId);
      const originalPath = `/uploads/${userId}/${docId}`;
      await Message.create({
        messageId: `msg_${nanoid()}`,
        conversationId,
        user: userId,
        text: 'doc',
        isCreatedByUser: true,
        files: [{ file_id: docId, filepath: originalPath }],
      });

      const { shareId } = await shareMethods.createSharedLink(userId, conversationId);
      const result = await shareMethods.getSharedMessages(shareId, undefined, {
        snapshotFiles: false,
      });
      const file = (result?.messages[0].files?.[0] ?? {}) as Record<string, unknown>;
      expect(file.filepath).toBe(originalPath);
    });

    test('getSharedMessages backfills and rewrites a legacy share on read', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;
      await seedConversation(userId, conversationId);
      const docId = await createFile(userId);
      const message = await Message.create({
        messageId: `msg_${nanoid()}`,
        conversationId,
        user: userId,
        text: 'doc',
        isCreatedByUser: true,
        files: [{ file_id: docId, filepath: `/uploads/${userId}/${docId}` }],
      });

      const shareId = `share_${nanoid()}`;
      await SharedLink.create({
        shareId,
        conversationId,
        user: userId,
        messages: [message._id],
      });

      const result = await shareMethods.getSharedMessages(shareId);
      const file = (result?.messages[0].files?.[0] ?? {}) as Record<string, unknown>;
      expect(file.filepath).toBe(`/api/share/${shareId}/files/${docId}`);

      // snapshot persisted by the lazy backfill
      const saved = await SharedLink.findOne({ shareId }).lean();
      expect(saved?.fileSnapshots).toHaveLength(1);
    });

    test('does not snapshot transient text-source files', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;
      await seedConversation(userId, conversationId);
      const textId = await createFile(userId, { source: 'text' });
      await Message.create({
        messageId: `msg_${nanoid()}`,
        conversationId,
        user: userId,
        text: 'rag context',
        isCreatedByUser: true,
        files: [{ file_id: textId }],
      });

      const result = await shareMethods.createSharedLink(userId, conversationId);
      const saved = await SharedLink.findOne({ shareId: result.shareId }).lean();
      expect(saved?.fileSnapshots ?? []).toHaveLength(0);
    });

    test('updateSharedLink clears snapshots when snapshotFiles is disabled', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;
      await seedConversation(userId, conversationId);
      const docId = await createFile(userId);
      await Message.create({
        messageId: `msg_${nanoid()}`,
        conversationId,
        user: userId,
        text: 'doc',
        isCreatedByUser: true,
        files: [{ file_id: docId }],
      });

      const created = await shareMethods.createSharedLink(userId, conversationId);
      let saved = await SharedLink.findOne({ shareId: created.shareId }).lean();
      expect(saved?.fileSnapshots).toHaveLength(1);

      const updated = await shareMethods.updateSharedLink(
        userId,
        created.shareId,
        undefined,
        undefined,
        false,
      );
      saved = await SharedLink.findOne({ shareId: updated.shareId }).lean();
      expect(saved?.fileSnapshots).toBeUndefined();
    });
  });
});
