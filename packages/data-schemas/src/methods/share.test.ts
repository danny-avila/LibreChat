import { nanoid } from 'nanoid';
import mongoose from 'mongoose';
import { Constants } from 'librechat-data-provider';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createShareMethods, type ShareMethods } from './share';
import type { SchemaWithMeiliMethods } from '~/models/plugins/mongoMeili';
import type * as t from '~/types';

describe('Share Methods', () => {
  let mongoServer: MongoMemoryServer;
  let shareMethods: ShareMethods;
  let SharedLink: mongoose.Model<t.ISharedLink>;
  let Message: mongoose.Model<t.IMessage>;
  let Conversation: SchemaWithMeiliMethods;

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
        isPublic: { type: Boolean, default: true },
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
        parentMessageId: String,
        attachments: [mongoose.Schema.Types.Mixed],
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
        isPublic: true,
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
        expect(msg.user).toBeUndefined(); // User should be removed
      });
    });

    test('should return null for non-public share', async () => {
      const shareId = `share_${nanoid()}`;

      await SharedLink.create({
        shareId,
        conversationId: 'conv123',
        user: 'user123',
        isPublic: false,
      });

      const result = await shareMethods.getSharedMessages(shareId);
      expect(result).toBeNull();
    });

    test('should return null for non-existent share', async () => {
      const result = await shareMethods.getSharedMessages('non_existent_share');
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
        isPublic: true,
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
          isPublic: true,
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

    test('should filter by isPublic parameter', async () => {
      const userId = new mongoose.Types.ObjectId().toString();

      await SharedLink.create([
        {
          shareId: 'public_share',
          conversationId: 'conv1',
          user: userId,
          title: 'Public Share',
          isPublic: true,
        },
        {
          shareId: 'private_share',
          conversationId: 'conv2',
          user: userId,
          title: 'Private Share',
          isPublic: false,
        },
      ]);

      const publicResults = await shareMethods.getSharedLinks(userId, undefined, 10, true);
      const privateResults = await shareMethods.getSharedLinks(userId, undefined, 10, false);

      expect(publicResults.links).toHaveLength(1);
      expect(publicResults.links[0].title).toBe('Public Share');

      expect(privateResults.links).toHaveLength(1);
      expect(privateResults.links[0].title).toBe('Private Share');
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
          isPublic: true,
        },
        {
          shareId: 'share2',
          conversationId: 'conv2',
          user: userId,
          title: 'Non-matching Share',
          isPublic: true,
        },
      ]);

      const result = await shareMethods.getSharedLinks(
        userId,
        undefined,
        10,
        true,
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
          isPublic: true,
        },
        {
          shareId: 'share2',
          conversationId: 'conv2',
          user: userId2,
          title: 'User 2 Share',
          isPublic: true,
        },
        {
          shareId: 'share3',
          conversationId: 'conv3',
          user: userId1,
          title: 'Another User 1 Share',
          isPublic: true,
        },
      ]);

      // Search as userId1
      const result1 = await shareMethods.getSharedLinks(
        userId1,
        undefined,
        10,
        true,
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
        true,
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
          isPublic: true,
        },
        {
          shareId: 'share2',
          conversationId: 'conv2',
          user: userId2,
          title: 'User 2 Share',
          isPublic: true,
        },
        {
          shareId: 'share3',
          conversationId: 'conv3',
          user: userId1,
          title: 'Another User 1 Share',
          isPublic: true,
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
        isPublic: true,
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

      expect(result.shareId).not.toBe(oldShareId); // Should generate new shareId
      expect(result.conversationId).toBe(conversationId);

      // Verify updated share
      const updatedShare = await SharedLink.findOne({ shareId: result.shareId }).populate(
        'messages',
      );
      expect(updatedShare?.messages).toHaveLength(2);
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
        isPublic: true,
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
        isPublic: true,
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
        isPublic: true,
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
        isPublic: true,
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
        isPublic: true,
      });

      const result = await shareMethods.getSharedLink(userId, conversationId);

      expect(result.success).toBe(true);
      expect(result.shareId).toBe(shareId);
    });

    test('should return null shareId if not found', async () => {
      const result = await shareMethods.getSharedLink('user123', 'conv123');

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
        isPublic: true,
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

    test('should only return public shares', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const conversationId = `conv_${nanoid()}`;
      const shareId = `share_${nanoid()}`;

      // Create a non-public share
      await SharedLink.create({
        shareId,
        conversationId,
        user: userId,
        isPublic: false,
      });

      const result = await shareMethods.getSharedLink(userId, conversationId);

      expect(result.success).toBe(false);
      expect(result.shareId).toBeNull();
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
        { shareId: 'share1', conversationId: 'conv1', user: userId1, isPublic: true },
        { shareId: 'share2', conversationId: 'conv2', user: userId1, isPublic: false },
        { shareId: 'share3', conversationId: 'conv3', user: userId2, isPublic: true },
        { shareId: 'share4', conversationId: 'conv4', user: userId2, isPublic: true },
        { shareId: 'share5', conversationId: 'conv5', user: userId3, isPublic: true },
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
        { shareId: 'share1', conversationId: conversationId1, user: userId, isPublic: true },
        { shareId: 'share2', conversationId: conversationId1, user: userId, isPublic: false },
        { shareId: 'share3', conversationId: conversationId2, user: userId, isPublic: true },
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
        { shareId: 'share1', conversationId, user: userId1, isPublic: true },
        { shareId: 'share2', conversationId, user: userId2, isPublic: true },
        { shareId: 'share3', conversationId: 'other-conv', user: userId1, isPublic: true },
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
        { shareId: 'share1', conversationId, user: userId, isPublic: true },
        {
          shareId: 'share2',
          conversationId,
          user: userId,
          isPublic: true,
          targetMessageId: 'msg1',
        },
        {
          shareId: 'share3',
          conversationId,
          user: userId,
          isPublic: true,
          targetMessageId: 'msg2',
        },
        { shareId: 'share4', conversationId, user: userId, isPublic: false },
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
        isPublic: true,
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
        isPublic: true,
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
        isPublic: true,
      });

      const result = await shareMethods.getSharedMessages(shareId);

      expect(result?.messages[0].parentMessageId).toBe(Constants.NO_PARENT);
    });
  });
});
