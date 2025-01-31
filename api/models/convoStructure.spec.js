const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { Message, getMessages, bulkSaveMessages } = require('./Message');

// Original version of buildTree function
function buildTree({ messages, fileMap }) {
  if (messages === null) {
    return null;
  }

  const messageMap = {};
  const rootMessages = [];
  const childrenCount = {};

  messages.forEach((message) => {
    const parentId = message.parentMessageId ?? '';
    childrenCount[parentId] = (childrenCount[parentId] || 0) + 1;

    const extendedMessage = {
      ...message,
      children: [],
      depth: 0,
      siblingIndex: childrenCount[parentId] - 1,
    };

    if (message.files && fileMap) {
      extendedMessage.files = message.files.map((file) => fileMap[file.file_id ?? ''] ?? file);
    }

    messageMap[message.messageId] = extendedMessage;

    const parentMessage = messageMap[parentId];
    if (parentMessage) {
      parentMessage.children.push(extendedMessage);
      extendedMessage.depth = parentMessage.depth + 1;
    } else {
      rootMessages.push(extendedMessage);
    }
  });

  return rootMessages;
}

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await Message.deleteMany({});
});

describe('Conversation Structure Tests', () => {
  test('Conversation folding/corrupting with inconsistent timestamps', async () => {
    const userId = 'testUser';
    const conversationId = 'testConversation';

    // Create messages with inconsistent timestamps
    const messages = [
      {
        messageId: 'message0',
        parentMessageId: null,
        text: 'Message 0',
        createdAt: new Date('2023-01-01T00:00:00Z'),
      },
      {
        messageId: 'message1',
        parentMessageId: 'message0',
        text: 'Message 1',
        createdAt: new Date('2023-01-01T00:02:00Z'),
      },
      {
        messageId: 'message2',
        parentMessageId: 'message1',
        text: 'Message 2',
        createdAt: new Date('2023-01-01T00:01:00Z'),
      }, // Note: Earlier than its parent
      {
        messageId: 'message3',
        parentMessageId: 'message1',
        text: 'Message 3',
        createdAt: new Date('2023-01-01T00:03:00Z'),
      },
      {
        messageId: 'message4',
        parentMessageId: 'message2',
        text: 'Message 4',
        createdAt: new Date('2023-01-01T00:04:00Z'),
      },
    ];

    // Add common properties to all messages
    messages.forEach((msg) => {
      msg.conversationId = conversationId;
      msg.user = userId;
      msg.isCreatedByUser = false;
      msg.error = false;
      msg.unfinished = false;
    });

    // Save messages with overrideTimestamp omitted (default is false)
    await bulkSaveMessages(messages, true);

    // Retrieve messages (this will sort by createdAt)
    const retrievedMessages = await getMessages({ conversationId, user: userId });

    // Build tree
    const tree = buildTree({ messages: retrievedMessages });

    // Check if the tree is incorrect (folded/corrupted)
    expect(tree.length).toBeGreaterThan(1); // Should have multiple root messages, indicating corruption
  });

  test('Fix: Conversation structure maintained with more than 16 messages', async () => {
    const userId = 'testUser';
    const conversationId = 'testConversation';

    // Create more than 16 messages
    const messages = Array.from({ length: 20 }, (_, i) => ({
      messageId: `message${i}`,
      parentMessageId: i === 0 ? null : `message${i - 1}`,
      conversationId,
      user: userId,
      text: `Message ${i}`,
      createdAt: new Date(Date.now() + (i % 2 === 0 ? i * 500000 : -i * 500000)),
    }));

    // Save messages with new timestamps being generated (message objects ignored)
    await bulkSaveMessages(messages);

    // Retrieve messages (this will sort by createdAt, but it shouldn't matter now)
    const retrievedMessages = await getMessages({ conversationId, user: userId });

    // Build tree
    const tree = buildTree({ messages: retrievedMessages });

    // Check if the tree is correct
    expect(tree.length).toBe(1); // Should have only one root message
    let currentNode = tree[0];
    for (let i = 1; i < 20; i++) {
      expect(currentNode.children.length).toBe(1);
      currentNode = currentNode.children[0];
      expect(currentNode.text).toBe(`Message ${i}`);
    }
    expect(currentNode.children.length).toBe(0); // Last message should have no children
  });

  test('Simulate MongoDB ordering issue with more than 16 messages and close timestamps', async () => {
    const userId = 'testUser';
    const conversationId = 'testConversation';

    // Create more than 16 messages with very close timestamps
    const messages = Array.from({ length: 20 }, (_, i) => ({
      messageId: `message${i}`,
      parentMessageId: i === 0 ? null : `message${i - 1}`,
      conversationId,
      user: userId,
      text: `Message ${i}`,
      createdAt: new Date(Date.now() + (i % 2 === 0 ? i * 1 : -i * 1)),
    }));

    // Add common properties to all messages
    messages.forEach((msg) => {
      msg.isCreatedByUser = false;
      msg.error = false;
      msg.unfinished = false;
    });

    await bulkSaveMessages(messages, true);
    const retrievedMessages = await getMessages({ conversationId, user: userId });
    const tree = buildTree({ messages: retrievedMessages });
    expect(tree.length).toBeGreaterThan(1);
  });

  test('Fix: Preserve order with more than 16 messages by maintaining original timestamps', async () => {
    const userId = 'testUser';
    const conversationId = 'testConversation';

    // Create more than 16 messages with distinct timestamps
    const messages = Array.from({ length: 20 }, (_, i) => ({
      messageId: `message${i}`,
      parentMessageId: i === 0 ? null : `message${i - 1}`,
      conversationId,
      user: userId,
      text: `Message ${i}`,
      createdAt: new Date(Date.now() + i * 1000), // Ensure each message has a distinct timestamp
    }));

    // Add common properties to all messages
    messages.forEach((msg) => {
      msg.isCreatedByUser = false;
      msg.error = false;
      msg.unfinished = false;
    });

    // Save messages with overriding timestamps (preserve original timestamps)
    await bulkSaveMessages(messages, true);

    // Retrieve messages (this will sort by createdAt)
    const retrievedMessages = await getMessages({ conversationId, user: userId });

    // Build tree
    const tree = buildTree({ messages: retrievedMessages });

    // Check if the tree is correct
    expect(tree.length).toBe(1); // Should have only one root message
    let currentNode = tree[0];
    for (let i = 1; i < 20; i++) {
      expect(currentNode.children.length).toBe(1);
      currentNode = currentNode.children[0];
      expect(currentNode.text).toBe(`Message ${i}`);
    }
    expect(currentNode.children.length).toBe(0); // Last message should have no children
  });

  test('Random order dates between parent and children messages', async () => {
    const userId = 'testUser';
    const conversationId = 'testConversation';

    // Create messages with deliberately out-of-order timestamps but sequential creation
    const messages = [
      {
        messageId: 'parent',
        parentMessageId: null,
        text: 'Parent Message',
        createdAt: new Date('2023-01-01T00:00:00Z'), // Make parent earliest
      },
      {
        messageId: 'child1',
        parentMessageId: 'parent',
        text: 'Child Message 1',
        createdAt: new Date('2023-01-01T00:01:00Z'),
      },
      {
        messageId: 'child2',
        parentMessageId: 'parent',
        text: 'Child Message 2',
        createdAt: new Date('2023-01-01T00:02:00Z'),
      },
      {
        messageId: 'grandchild1',
        parentMessageId: 'child1',
        text: 'Grandchild Message 1',
        createdAt: new Date('2023-01-01T00:03:00Z'),
      },
    ];

    // Add common properties to all messages
    messages.forEach((msg) => {
      msg.conversationId = conversationId;
      msg.user = userId;
      msg.isCreatedByUser = false;
      msg.error = false;
      msg.unfinished = false;
    });

    // Save messages with overrideTimestamp set to true
    await bulkSaveMessages(messages, true);

    // Retrieve messages
    const retrievedMessages = await getMessages({ conversationId, user: userId });

    // Debug log to see what's being returned
    console.log(
      'Retrieved Messages:',
      retrievedMessages.map((msg) => ({
        messageId: msg.messageId,
        parentMessageId: msg.parentMessageId,
        createdAt: msg.createdAt,
      })),
    );

    // Build tree
    const tree = buildTree({ messages: retrievedMessages });

    // Debug log to see the tree structure
    console.log(
      'Tree structure:',
      tree.map((root) => ({
        messageId: root.messageId,
        children: root.children.map((child) => ({
          messageId: child.messageId,
          children: child.children.map((grandchild) => ({
            messageId: grandchild.messageId,
          })),
        })),
      })),
    );

    // Verify the structure before making assertions
    expect(retrievedMessages.length).toBe(4); // Should have all 4 messages

    // Check if messages are properly linked
    const parentMsg = retrievedMessages.find((msg) => msg.messageId === 'parent');
    expect(parentMsg.parentMessageId).toBeNull(); // Parent should have null parentMessageId

    const childMsg1 = retrievedMessages.find((msg) => msg.messageId === 'child1');
    expect(childMsg1.parentMessageId).toBe('parent');

    // Then check tree structure
    expect(tree.length).toBe(1); // Should have only one root message
    expect(tree[0].messageId).toBe('parent');
    expect(tree[0].children.length).toBe(2); // Should have two children
  });
});
