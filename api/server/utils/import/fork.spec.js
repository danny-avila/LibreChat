const { Constants } = require('librechat-data-provider');

jest.mock('~/models/Conversation', () => ({
  getConvo: jest.fn(),
  bulkSaveConvos: jest.fn(),
}));

jest.mock('~/models/Message', () => ({
  getMessages: jest.fn(),
  bulkSaveMessages: jest.fn(),
}));

let mockIdCounter = 0;
jest.mock('uuid', () => {
  return {
    v4: jest.fn(() => {
      mockIdCounter++;
      return mockIdCounter.toString();
    }),
  };
});

const { forkConversation, getMessagesUpToTargetLevel } = require('./fork');
const { getConvo, bulkSaveConvos } = require('~/models/Conversation');
const { getMessages, bulkSaveMessages } = require('~/models/Message');

/**
 *
 * @param {TMessage[]} messages - The list of messages to visualize.
 * @param {string | null} parentId - The parent message ID.
 * @param {string} prefix - The prefix to use for each line.
 * @returns
 */
function printMessageTree(messages, parentId = Constants.NO_PARENT, prefix = '') {
  let treeVisual = '';

  const childMessages = messages.filter((msg) => msg.parentMessageId === parentId);
  for (let index = 0; index < childMessages.length; index++) {
    const msg = childMessages[index];
    const isLast = index === childMessages.length - 1;
    const connector = isLast ? '└── ' : '├── ';

    treeVisual += `${prefix}${connector}[${msg.messageId}]: ${
      msg.parentMessageId !== Constants.NO_PARENT ? `Child of ${msg.parentMessageId}` : 'Root'
    }\n`;
    treeVisual += printMessageTree(messages, msg.messageId, prefix + (isLast ? '    ' : '|   '));
  }

  return treeVisual;
}

const mockMessages = [
  {
    messageId: '0',
    parentMessageId: Constants.NO_PARENT,
    text: 'Root message 1',
    createdAt: '2021-01-01',
  },
  {
    messageId: '1',
    parentMessageId: Constants.NO_PARENT,
    text: 'Root message 2',
    createdAt: '2021-01-01',
  },
  { messageId: '2', parentMessageId: '1', text: 'Child of 1', createdAt: '2021-01-02' },
  { messageId: '3', parentMessageId: '1', text: 'Child of 1', createdAt: '2021-01-03' },
  { messageId: '4', parentMessageId: '2', text: 'Child of 2', createdAt: '2021-01-04' },
  { messageId: '5', parentMessageId: '2', text: 'Child of 2', createdAt: '2021-01-05' },
  { messageId: '6', parentMessageId: '3', text: 'Child of 3', createdAt: '2021-01-06' },
  { messageId: '7', parentMessageId: '3', text: 'Child of 3', createdAt: '2021-01-07' },
  { messageId: '8', parentMessageId: '7', text: 'Child of 7', createdAt: '2021-01-07' },
];

const mockConversation = { convoId: 'abc123', title: 'Original Title' };

describe('forkConversation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIdCounter = 0;
    getConvo.mockResolvedValue(mockConversation);
    getMessages.mockResolvedValue(mockMessages);
    bulkSaveConvos.mockResolvedValue(null);
    bulkSaveMessages.mockResolvedValue(null);
  });

  test('visualize message tree structure', () => {
    const visual = printMessageTree(mockMessages);
    console.debug(visual);
    expect(visual).toBeTruthy();
  });

  test('should fork conversation without branches', async () => {
    const result = await forkConversation({
      originalConvoId: 'abc123',
      targetMessageId: '3',
      requestUserId: 'user1',
      includeBranches: false,
    });
    console.debug(printMessageTree(result.messages));

    // Reversed order due to setup in function
    const expectedMessagesTexts = ['Child of 1', 'Root message 2'];
    expect(getMessages).toHaveBeenCalled();
    expect(bulkSaveMessages).toHaveBeenCalledWith(
      expect.arrayContaining(
        expectedMessagesTexts.map((text) => expect.objectContaining({ text })),
      ),
    );
  });

  test('should fork conversation without branches (deeper)', async () => {
    const result = await forkConversation({
      originalConvoId: 'abc123',
      targetMessageId: '8',
      requestUserId: 'user1',
      includeBranches: false,
    });
    console.debug(printMessageTree(result.messages));

    const expectedMessagesTexts = ['Child of 7', 'Child of 3', 'Child of 1', 'Root message 2'];
    expect(getMessages).toHaveBeenCalled();
    expect(bulkSaveMessages).toHaveBeenCalledWith(
      expect.arrayContaining(
        expectedMessagesTexts.map((text) => expect.objectContaining({ text })),
      ),
    );
  });

  test('should fork conversation with branches (direct path)', async () => {
    const result = await forkConversation({
      originalConvoId: 'abc123',
      targetMessageId: '3',
      requestUserId: 'user1',
      includeBranches: true,
      includeAllDescendants: false,
    });

    console.debug(printMessageTree(result.messages));

    const expectedMessagesTexts = ['Root message 2', 'Child of 1', 'Child of 1'];
    expect(getMessages).toHaveBeenCalled();
    expect(bulkSaveMessages).toHaveBeenCalledWith(
      expect.arrayContaining(
        expectedMessagesTexts.map((text) => expect.objectContaining({ text })),
      ),
    );
  });

  test('should handle errors during message fetching', async () => {
    getMessages.mockRejectedValue(new Error('Failed to fetch messages'));

    await expect(
      forkConversation({
        originalConvoId: 'abc123',
        targetMessageId: '3',
        requestUserId: 'user1',
        includeBranches: true,
      }),
    ).rejects.toThrow('Failed to fetch messages');
  });
});

describe('getMessagesUpToTargetLevel', () => {
  const mockMessages = [
    { messageId: '7', parentMessageId: Constants.NO_PARENT, text: 'Message 7' },
    { messageId: '8', parentMessageId: Constants.NO_PARENT, text: 'Message 8' },
    { messageId: '5', parentMessageId: '7', text: 'Message 5' },
    { messageId: '6', parentMessageId: '7', text: 'Message 6' },
    { messageId: '9', parentMessageId: '8', text: 'Message 9' },
    { messageId: '2', parentMessageId: '5', text: 'Message 2' },
    { messageId: '3', parentMessageId: '5', text: 'Message 3' },
    { messageId: '1', parentMessageId: '6', text: 'Message 1' },
    { messageId: '4', parentMessageId: '6', text: 'Message 4' },
    { messageId: '10', parentMessageId: '3', text: 'Message 10' },
  ];
  test('should get all messages up to target level', async () => {
    const result = getMessagesUpToTargetLevel(mockMessages, '5');
    const mappedResult = result.map((msg) => msg.text);
    console.debug(
      '[getMessagesUpToTargetLevel] should get all messages up to target level\n',
      mappedResult,
    );
    console.debug('mockMessage\n', printMessageTree(mockMessages));
    console.debug('result\n', printMessageTree(result));
    expect(mappedResult).toEqual(['Message 7', 'Message 8', 'Message 5', 'Message 6', 'Message 9']);
  });
});
