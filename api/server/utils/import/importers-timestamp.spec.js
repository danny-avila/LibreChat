const { Constants } = require('librechat-data-provider');
const { ImportBatchBuilder } = require('./importBatchBuilder');
const { getImporter } = require('./importers');

// Mock the database methods
jest.mock('~/models', () => ({
  bulkSaveConvos: jest.fn(),
  bulkSaveMessages: jest.fn(),
}));
jest.mock('~/cache/getLogStores');
const getLogStores = require('~/cache/getLogStores');
const mockedCacheGet = jest.fn();
getLogStores.mockImplementation(() => ({
  get: mockedCacheGet,
}));

describe('Import Timestamp Ordering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCacheGet.mockResolvedValue(null);
  });

  describe('LibreChat Import - Timestamp Issues', () => {
    test('should maintain proper timestamp order between parent and child messages', async () => {
      // Create a LibreChat export with out-of-order timestamps
      const jsonData = {
        conversationId: 'test-convo-123',
        title: 'Test Conversation',
        messages: [
          {
            messageId: 'parent-1',
            parentMessageId: Constants.NO_PARENT,
            text: 'Parent Message',
            sender: 'user',
            isCreatedByUser: true,
            createdAt: '2023-01-01T00:02:00Z', // Parent created AFTER child
          },
          {
            messageId: 'child-1',
            parentMessageId: 'parent-1',
            text: 'Child Message',
            sender: 'assistant',
            isCreatedByUser: false,
            createdAt: '2023-01-01T00:01:00Z', // Child created BEFORE parent
          },
          {
            messageId: 'grandchild-1',
            parentMessageId: 'child-1',
            text: 'Grandchild Message',
            sender: 'user',
            isCreatedByUser: true,
            createdAt: '2023-01-01T00:00:30Z', // Even earlier
          },
        ],
      };

      const requestUserId = 'user-123';
      const importBatchBuilder = new ImportBatchBuilder(requestUserId);
      jest.spyOn(importBatchBuilder, 'saveMessage');

      const importer = getImporter(jsonData);
      await importer(jsonData, requestUserId, () => importBatchBuilder);

      // Check the actual messages stored in the builder
      const savedMessages = importBatchBuilder.messages;

      const parent = savedMessages.find((msg) => msg.text === 'Parent Message');
      const child = savedMessages.find((msg) => msg.text === 'Child Message');
      const grandchild = savedMessages.find((msg) => msg.text === 'Grandchild Message');

      // Verify all messages were found
      expect(parent).toBeDefined();
      expect(child).toBeDefined();
      expect(grandchild).toBeDefined();

      // FIXED behavior: timestamps ARE corrected
      expect(new Date(child.createdAt).getTime()).toBeGreaterThan(
        new Date(parent.createdAt).getTime(),
      );
      expect(new Date(grandchild.createdAt).getTime()).toBeGreaterThan(
        new Date(child.createdAt).getTime(),
      );
    });

    test('should handle complex multi-branch scenario with out-of-order timestamps', async () => {
      const jsonData = {
        conversationId: 'complex-test-123',
        title: 'Complex Test',
        messages: [
          // Branch 1: Root -> A -> B with reversed timestamps
          {
            messageId: 'root-1',
            parentMessageId: Constants.NO_PARENT,
            text: 'Root 1',
            sender: 'user',
            isCreatedByUser: true,
            createdAt: '2023-01-01T00:03:00Z',
          },
          {
            messageId: 'a-1',
            parentMessageId: 'root-1',
            text: 'A1',
            sender: 'assistant',
            isCreatedByUser: false,
            createdAt: '2023-01-01T00:02:00Z', // Before parent
          },
          {
            messageId: 'b-1',
            parentMessageId: 'a-1',
            text: 'B1',
            sender: 'user',
            isCreatedByUser: true,
            createdAt: '2023-01-01T00:01:00Z', // Before grandparent
          },
          // Branch 2: Root -> C -> D with mixed timestamps
          {
            messageId: 'root-2',
            parentMessageId: Constants.NO_PARENT,
            text: 'Root 2',
            sender: 'user',
            isCreatedByUser: true,
            createdAt: '2023-01-01T00:00:30Z', // Earlier than branch 1
          },
          {
            messageId: 'c-2',
            parentMessageId: 'root-2',
            text: 'C2',
            sender: 'assistant',
            isCreatedByUser: false,
            createdAt: '2023-01-01T00:04:00Z', // Much later
          },
          {
            messageId: 'd-2',
            parentMessageId: 'c-2',
            text: 'D2',
            sender: 'user',
            isCreatedByUser: true,
            createdAt: '2023-01-01T00:02:30Z', // Between root and parent
          },
        ],
      };

      const requestUserId = 'user-123';
      const importBatchBuilder = new ImportBatchBuilder(requestUserId);
      jest.spyOn(importBatchBuilder, 'saveMessage');

      const importer = getImporter(jsonData);
      await importer(jsonData, requestUserId, () => importBatchBuilder);

      const savedMessages = importBatchBuilder.messages;

      // Verify that timestamps are preserved as-is (not corrected)
      const root1 = savedMessages.find((msg) => msg.text === 'Root 1');
      const a1 = savedMessages.find((msg) => msg.text === 'A1');
      const b1 = savedMessages.find((msg) => msg.text === 'B1');
      const root2 = savedMessages.find((msg) => msg.text === 'Root 2');
      const c2 = savedMessages.find((msg) => msg.text === 'C2');
      const d2 = savedMessages.find((msg) => msg.text === 'D2');

      // Branch 1: timestamps should now be in correct order
      expect(new Date(a1.createdAt).getTime()).toBeGreaterThan(new Date(root1.createdAt).getTime());
      expect(new Date(b1.createdAt).getTime()).toBeGreaterThan(new Date(a1.createdAt).getTime());

      // Branch 2: all timestamps should be properly ordered
      expect(new Date(c2.createdAt).getTime()).toBeGreaterThan(new Date(root2.createdAt).getTime());
      expect(new Date(d2.createdAt).getTime()).toBeGreaterThan(new Date(c2.createdAt).getTime());
    });

    test('recursive format should NOW have timestamp protection', async () => {
      // Create a recursive LibreChat export with out-of-order timestamps
      const jsonData = {
        conversationId: 'recursive-test-123',
        title: 'Recursive Test',
        recursive: true,
        messages: [
          {
            messageId: 'parent-1',
            parentMessageId: Constants.NO_PARENT,
            text: 'Parent Message',
            sender: 'User',
            isCreatedByUser: true,
            createdAt: '2023-01-01T00:02:00Z', // Parent created AFTER child
            children: [
              {
                messageId: 'child-1',
                parentMessageId: 'parent-1',
                text: 'Child Message',
                sender: 'Assistant',
                isCreatedByUser: false,
                createdAt: '2023-01-01T00:01:00Z', // Child created BEFORE parent
                children: [
                  {
                    messageId: 'grandchild-1',
                    parentMessageId: 'child-1',
                    text: 'Grandchild Message',
                    sender: 'User',
                    isCreatedByUser: true,
                    createdAt: '2023-01-01T00:00:30Z', // Even earlier
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      };

      const requestUserId = 'user-123';
      const importBatchBuilder = new ImportBatchBuilder(requestUserId);

      const importer = getImporter(jsonData);
      await importer(jsonData, requestUserId, () => importBatchBuilder);

      const savedMessages = importBatchBuilder.messages;

      // Messages should be saved
      expect(savedMessages).toHaveLength(3);

      // In recursive format, timestamps are NOT included in the saved messages
      // The saveMessage method doesn't receive createdAt for recursive imports
      const parent = savedMessages.find((msg) => msg.text === 'Parent Message');
      const child = savedMessages.find((msg) => msg.text === 'Child Message');
      const grandchild = savedMessages.find((msg) => msg.text === 'Grandchild Message');

      expect(parent).toBeDefined();
      expect(child).toBeDefined();
      expect(grandchild).toBeDefined();

      // Recursive imports NOW preserve and correct timestamps
      expect(parent.createdAt).toBeDefined();
      expect(child.createdAt).toBeDefined();
      expect(grandchild.createdAt).toBeDefined();

      // Timestamps should be corrected to maintain proper order
      expect(new Date(child.createdAt).getTime()).toBeGreaterThan(
        new Date(parent.createdAt).getTime(),
      );
      expect(new Date(grandchild.createdAt).getTime()).toBeGreaterThan(
        new Date(child.createdAt).getTime(),
      );
    });
  });

  describe('ChatGPT Import - Timestamp Issues', () => {
    test('should correct timestamp inversions (child before parent)', async () => {
      // Simulate ChatGPT export with timestamp inversion (like tool call results)
      const jsonData = [
        {
          title: 'Timestamp Inversion Test',
          create_time: 1000,
          mapping: {
            'root-node': {
              id: 'root-node',
              message: null,
              parent: null,
              children: ['parent-msg'],
            },
            'parent-msg': {
              id: 'parent-msg',
              message: {
                id: 'parent-msg',
                author: { role: 'user' },
                create_time: 1000.1, // Parent: 1000.1
                content: { content_type: 'text', parts: ['Parent message'] },
                metadata: {},
              },
              parent: 'root-node',
              children: ['child-msg'],
            },
            'child-msg': {
              id: 'child-msg',
              message: {
                id: 'child-msg',
                author: { role: 'assistant' },
                create_time: 1000.095, // Child: 1000.095 (5ms BEFORE parent)
                content: { content_type: 'text', parts: ['Child message'] },
                metadata: {},
              },
              parent: 'parent-msg',
              children: [],
            },
          },
        },
      ];

      const requestUserId = 'user-123';
      const importBatchBuilder = new ImportBatchBuilder(requestUserId);
      jest.spyOn(importBatchBuilder, 'saveMessage');

      const importer = getImporter(jsonData);
      await importer(jsonData, requestUserId, () => importBatchBuilder);

      const savedMessages = importBatchBuilder.messages;
      const parent = savedMessages.find((msg) => msg.text === 'Parent message');
      const child = savedMessages.find((msg) => msg.text === 'Child message');

      expect(parent).toBeDefined();
      expect(child).toBeDefined();

      // Child timestamp should be adjusted to be after parent
      expect(new Date(child.createdAt).getTime()).toBeGreaterThan(
        new Date(parent.createdAt).getTime(),
      );
    });

    test('should use conv.create_time for null message timestamps', async () => {
      const convCreateTime = 1500000000; // Conversation create time
      const jsonData = [
        {
          title: 'Null Timestamp Test',
          create_time: convCreateTime,
          mapping: {
            'root-node': {
              id: 'root-node',
              message: null,
              parent: null,
              children: ['msg-with-null-time'],
            },
            'msg-with-null-time': {
              id: 'msg-with-null-time',
              message: {
                id: 'msg-with-null-time',
                author: { role: 'user' },
                create_time: null, // Null timestamp
                content: { content_type: 'text', parts: ['Message with null time'] },
                metadata: {},
              },
              parent: 'root-node',
              children: ['msg-with-valid-time'],
            },
            'msg-with-valid-time': {
              id: 'msg-with-valid-time',
              message: {
                id: 'msg-with-valid-time',
                author: { role: 'assistant' },
                create_time: convCreateTime + 10, // Valid timestamp
                content: { content_type: 'text', parts: ['Message with valid time'] },
                metadata: {},
              },
              parent: 'msg-with-null-time',
              children: [],
            },
          },
        },
      ];

      const requestUserId = 'user-123';
      const importBatchBuilder = new ImportBatchBuilder(requestUserId);
      jest.spyOn(importBatchBuilder, 'saveMessage');

      const importer = getImporter(jsonData);
      await importer(jsonData, requestUserId, () => importBatchBuilder);

      const savedMessages = importBatchBuilder.messages;
      const nullTimeMsg = savedMessages.find((msg) => msg.text === 'Message with null time');
      const validTimeMsg = savedMessages.find((msg) => msg.text === 'Message with valid time');

      expect(nullTimeMsg).toBeDefined();
      expect(validTimeMsg).toBeDefined();

      // Null timestamp should fall back to conv.create_time
      expect(nullTimeMsg.createdAt).toEqual(new Date(convCreateTime * 1000));

      // Child should still be after parent (timestamp adjustment)
      expect(new Date(validTimeMsg.createdAt).getTime()).toBeGreaterThan(
        new Date(nullTimeMsg.createdAt).getTime(),
      );
    });
  });

  describe('Comparison with Fork Functionality', () => {
    test('fork functionality correctly handles timestamp issues (for comparison)', async () => {
      const { cloneMessagesWithTimestamps } = require('./fork');

      const messagesToClone = [
        {
          messageId: 'parent',
          parentMessageId: Constants.NO_PARENT,
          text: 'Parent Message',
          createdAt: '2023-01-01T00:02:00Z', // Parent created AFTER child
        },
        {
          messageId: 'child',
          parentMessageId: 'parent',
          text: 'Child Message',
          createdAt: '2023-01-01T00:01:00Z', // Child created BEFORE parent
        },
      ];

      const importBatchBuilder = new ImportBatchBuilder('user-123');
      jest.spyOn(importBatchBuilder, 'saveMessage');

      cloneMessagesWithTimestamps(messagesToClone, importBatchBuilder);

      const savedMessages = importBatchBuilder.messages;
      const parent = savedMessages.find((msg) => msg.text === 'Parent Message');
      const child = savedMessages.find((msg) => msg.text === 'Child Message');

      // Fork functionality DOES correct the timestamps
      expect(new Date(child.createdAt).getTime()).toBeGreaterThan(
        new Date(parent.createdAt).getTime(),
      );
    });
  });
});
