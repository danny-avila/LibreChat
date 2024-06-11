const fs = require('fs');
const path = require('path');
const { EModelEndpoint, Constants, openAISettings } = require('librechat-data-provider');
const { bulkSaveConvos: _bulkSaveConvos } = require('~/models/Conversation');
const { ImportBatchBuilder } = require('./importBatchBuilder');
const { bulkSaveMessages } = require('~/models/Message');
const getLogStores = require('~/cache/getLogStores');
const { getImporter } = require('./importers');

jest.mock('~/cache/getLogStores');
const mockedCacheGet = jest.fn();
getLogStores.mockImplementation(() => ({
  get: mockedCacheGet,
}));

// Mock the database methods
jest.mock('~/models/Conversation', () => ({
  bulkSaveConvos: jest.fn(),
}));
jest.mock('~/models/Message', () => ({
  bulkSaveMessages: jest.fn(),
}));

afterEach(() => {
  jest.clearAllMocks();
});

describe('importChatGptConvo', () => {
  it('should import conversation correctly', async () => {
    const expectedNumberOfMessages = 19;
    const jsonData = JSON.parse(
      fs.readFileSync(path.join(__dirname, '__data__', 'chatgpt-export.json'), 'utf8'),
    );
    const requestUserId = 'user-123';
    const importBatchBuilder = new ImportBatchBuilder(requestUserId);

    // Spy on instance methods
    jest.spyOn(importBatchBuilder, 'startConversation');
    jest.spyOn(importBatchBuilder, 'saveMessage');
    jest.spyOn(importBatchBuilder, 'finishConversation');
    jest.spyOn(importBatchBuilder, 'saveBatch');

    const importer = getImporter(jsonData);
    await importer(jsonData, requestUserId, () => importBatchBuilder);

    expect(importBatchBuilder.startConversation).toHaveBeenCalledWith(EModelEndpoint.openAI);
    expect(importBatchBuilder.saveMessage).toHaveBeenCalledTimes(expectedNumberOfMessages);
    expect(importBatchBuilder.finishConversation).toHaveBeenCalledTimes(jsonData.length);
    expect(importBatchBuilder.saveBatch).toHaveBeenCalled();
  });

  it('should maintain correct message hierarchy (tree parent/children relationship)', async () => {
    const jsonData = JSON.parse(
      fs.readFileSync(path.join(__dirname, '__data__', 'chatgpt-tree.json'), 'utf8'),
    );
    const requestUserId = 'user-123';
    const importBatchBuilder = new ImportBatchBuilder(requestUserId);

    jest.spyOn(importBatchBuilder, 'saveMessage');
    jest.spyOn(importBatchBuilder, 'saveBatch');

    const importer = getImporter(jsonData);
    await importer(jsonData, requestUserId, () => importBatchBuilder);

    const entries = Object.keys(jsonData[0].mapping);
    const messageEntries = entries.filter(
      (id) =>
        jsonData[0].mapping[id].message &&
        jsonData[0].mapping[id].message.author.role !== 'system' &&
        jsonData[0].mapping[id].message.content,
    );

    expect(importBatchBuilder.saveMessage).toHaveBeenCalledTimes(messageEntries.length);

    const idToUUIDMap = new Map();
    importBatchBuilder.saveMessage.mock.calls.forEach((call, index) => {
      const originalId = messageEntries[index];
      idToUUIDMap.set(originalId, call[0].messageId);
    });

    expect(idToUUIDMap.size).toBe(messageEntries.length);

    messageEntries.forEach((id) => {
      const { parent } = jsonData[0].mapping[id];

      const expectedParentId = parent
        ? idToUUIDMap.get(parent) ?? Constants.NO_PARENT
        : Constants.NO_PARENT;

      const actualMessageId = idToUUIDMap.get(id);
      const actualParentId = actualMessageId
        ? importBatchBuilder.saveMessage.mock.calls.find(
          (call) => call[0].messageId === actualMessageId,
        )[0].parentMessageId
        : Constants.NO_PARENT;

      expect(actualParentId).toBe(expectedParentId);
    });

    expect(importBatchBuilder.saveBatch).toHaveBeenCalled();
  });
});

describe('importLibreChatConvo', () => {
  const jsonDataNonRecursiveBranches = JSON.parse(
    fs.readFileSync(path.join(__dirname, '__data__', 'librechat-opts-nonr-branches.json'), 'utf8'),
  );

  it('should import conversation correctly', async () => {
    mockedCacheGet.mockResolvedValue({
      [EModelEndpoint.openAI]: {},
    });
    const expectedNumberOfMessages = 6;
    const jsonData = JSON.parse(
      fs.readFileSync(path.join(__dirname, '__data__', 'librechat-export.json'), 'utf8'),
    );
    const requestUserId = 'user-123';
    const importBatchBuilder = new ImportBatchBuilder(requestUserId);

    // Spy on instance methods
    jest.spyOn(importBatchBuilder, 'startConversation');
    jest.spyOn(importBatchBuilder, 'saveMessage');
    jest.spyOn(importBatchBuilder, 'finishConversation');
    jest.spyOn(importBatchBuilder, 'saveBatch');

    const importer = getImporter(jsonData);
    await importer(jsonData, requestUserId, () => importBatchBuilder);

    expect(importBatchBuilder.startConversation).toHaveBeenCalledWith(EModelEndpoint.openAI);
    expect(importBatchBuilder.saveMessage).toHaveBeenCalledTimes(expectedNumberOfMessages);
    expect(importBatchBuilder.finishConversation).toHaveBeenCalledTimes(1);
    expect(importBatchBuilder.saveBatch).toHaveBeenCalled();
  });

  it('should import linear, non-recursive thread correctly with correct endpoint', async () => {
    mockedCacheGet.mockResolvedValue({
      [EModelEndpoint.azureOpenAI]: {},
    });

    const jsonData = JSON.parse(
      fs.readFileSync(path.join(__dirname, '__data__', 'librechat-linear.json'), 'utf8'),
    );
    const requestUserId = 'user-123';
    const importBatchBuilder = new ImportBatchBuilder(requestUserId);

    jest.spyOn(importBatchBuilder, 'startConversation');
    jest.spyOn(importBatchBuilder, 'saveMessage');
    jest.spyOn(importBatchBuilder, 'finishConversation');
    jest.spyOn(importBatchBuilder, 'saveBatch');

    const importer = getImporter(jsonData);
    await importer(jsonData, requestUserId, () => importBatchBuilder);

    expect(bulkSaveMessages).toHaveBeenCalledTimes(1);

    const messages = bulkSaveMessages.mock.calls[0][0];
    let lastMessageId = Constants.NO_PARENT;
    for (const message of messages) {
      expect(message.parentMessageId).toBe(lastMessageId);
      lastMessageId = message.messageId;
    }

    expect(importBatchBuilder.startConversation).toHaveBeenCalledWith(EModelEndpoint.azureOpenAI);
    expect(importBatchBuilder.saveMessage).toHaveBeenCalledTimes(jsonData.messages.length);
    expect(importBatchBuilder.finishConversation).toHaveBeenCalled();
    expect(importBatchBuilder.saveBatch).toHaveBeenCalled();
  });

  it('should maintain correct message hierarchy (tree parent/children relationship)', async () => {
    const jsonData = JSON.parse(
      fs.readFileSync(path.join(__dirname, '__data__', 'librechat-tree.json'), 'utf8'),
    );
    const requestUserId = 'user-123';
    const importBatchBuilder = new ImportBatchBuilder(requestUserId);
    jest.spyOn(importBatchBuilder, 'saveMessage');
    jest.spyOn(importBatchBuilder, 'saveBatch');

    // When
    const importer = getImporter(jsonData);
    await importer(jsonData, requestUserId, () => importBatchBuilder);

    // Create a map to track original message IDs to new UUIDs
    const idToUUIDMap = new Map();
    importBatchBuilder.saveMessage.mock.calls.forEach((call) => {
      const message = call[0];
      idToUUIDMap.set(message.originalMessageId, message.messageId);
    });

    const checkChildren = (children, parentId) => {
      children.forEach((child) => {
        const childUUID = idToUUIDMap.get(child.messageId);
        const expectedParentId = idToUUIDMap.get(parentId) ?? null;
        const messageCall = importBatchBuilder.saveMessage.mock.calls.find(
          (call) => call[0].messageId === childUUID,
        );

        const actualParentId = messageCall[0].parentMessageId;
        expect(actualParentId).toBe(expectedParentId);

        if (child.children && child.children.length > 0) {
          checkChildren(child.children, child.messageId);
        }
      });
    };

    // Start hierarchy validation from root messages
    checkChildren(jsonData.messages, null);

    expect(importBatchBuilder.saveBatch).toHaveBeenCalled();
  });

  it('should maintain correct message hierarchy (non-recursive)', async () => {
    const jsonData = jsonDataNonRecursiveBranches;
    const requestUserId = 'user-123';
    const importBatchBuilder = new ImportBatchBuilder(requestUserId);
    jest.spyOn(importBatchBuilder, 'saveMessage');
    jest.spyOn(importBatchBuilder, 'saveBatch');

    const importer = getImporter(jsonData);
    await importer(jsonData, requestUserId, () => importBatchBuilder);

    const textToMessageMap = new Map();
    importBatchBuilder.saveMessage.mock.calls.forEach((call) => {
      const message = call[0];
      textToMessageMap.set(message.text, message);
    });

    const relationships = {
      'tell me a long story': [
        'Of course! Settle in for a tale of adventure across time and space.\n\n---\n\nOnce upon a time in the small, sleepy village of Eldoria, there was a young woman named Elara who longed for adventure. Eldoria was a place of routine and simplicity, nestled between rolling hills and dense forests, but Elara always felt that there was more to the world than the boundaries',
        'Sure, I can craft a long story for you. Here it goes:\n\n### The Chronicles of Elenor: The Luminary of Anduril\n\nIn an age long forgotten by men, in a world kissed by the glow of dual suns, the Kingdom of Anduril flourished. Verdant valleys graced its land, majestic mountains shielded',
      ],
      'tell me a long long story': [
        'Of course! Here’s a detailed and engaging story:\n\n---\n\n### The Legend of Eldoria\n\nNestled between towering mountains and dense, ancient forests was the enigmatic kingdom of Eldoria. This realm, clo aked in perpetual twilight, was the stuff of legends. It was said that the land was blessed by the gods and guarded by mythical creatures. Eldoria was a place where magic and realism intertwined seamlessly, creating a land of beauty, wonder, and peril.\n\nIn the heart of this kingdom lay the grand city of Lumina, known',
      ],
    };

    Object.keys(relationships).forEach((parentText) => {
      const parentMessage = textToMessageMap.get(parentText);
      const childrenTexts = relationships[parentText];

      childrenTexts.forEach((childText) => {
        const childMessage = textToMessageMap.get(childText);
        expect(childMessage.parentMessageId).toBe(parentMessage.messageId);
      });
    });

    expect(importBatchBuilder.saveBatch).toHaveBeenCalled();
  });

  it('should retain properties from the original conversation as well as new settings', async () => {
    mockedCacheGet.mockResolvedValue({
      [EModelEndpoint.azureOpenAI]: {},
    });
    const requestUserId = 'user-123';
    const importBatchBuilder = new ImportBatchBuilder(requestUserId);
    jest.spyOn(importBatchBuilder, 'finishConversation');

    const importer = getImporter(jsonDataNonRecursiveBranches);
    await importer(jsonDataNonRecursiveBranches, requestUserId, () => importBatchBuilder);

    expect(importBatchBuilder.finishConversation).toHaveBeenCalledTimes(1);

    const [_title, createdAt, originalConvo] = importBatchBuilder.finishConversation.mock.calls[0];
    const convo = importBatchBuilder.conversations[0];

    expect(convo).toEqual({
      ...jsonDataNonRecursiveBranches.options,
      user: requestUserId,
      conversationId: importBatchBuilder.conversationId,
      title: originalConvo.title || 'Imported Chat',
      createdAt: createdAt,
      updatedAt: createdAt,
      overrideTimestamp: true,
      endpoint: importBatchBuilder.endpoint,
      model: originalConvo.model || openAISettings.model.default,
    });

    expect(convo.title).toBe('Original');
    expect(convo.createdAt).toBeInstanceOf(Date);
    expect(convo.endpoint).toBe(EModelEndpoint.azureOpenAI);
    expect(convo.model).toBe('gpt-4o');
  });

  describe('finishConversation', () => {
    it('should retain properties from the original conversation as well as update with new settings', () => {
      const requestUserId = 'user-123';
      const builder = new ImportBatchBuilder(requestUserId);
      builder.conversationId = 'conv-id-123';
      builder.messages = [{ text: 'Hello, world!' }];

      const originalConvo = {
        _id: 'old-convo-id',
        model: 'custom-model',
      };

      builder.endpoint = 'test-endpoint';

      const title = 'New Chat Title';
      const createdAt = new Date('2023-10-01T00:00:00Z');

      const result = builder.finishConversation(title, createdAt, originalConvo);

      expect(result).toEqual({
        conversation: {
          user: requestUserId,
          conversationId: builder.conversationId,
          title: 'New Chat Title',
          createdAt: createdAt,
          updatedAt: createdAt,
          overrideTimestamp: true,
          endpoint: 'test-endpoint',
          model: 'custom-model',
        },
        messages: builder.messages,
      });

      expect(builder.conversations).toContainEqual({
        user: requestUserId,
        conversationId: builder.conversationId,
        title: 'New Chat Title',
        createdAt: createdAt,
        updatedAt: createdAt,
        overrideTimestamp: true,
        endpoint: 'test-endpoint',
        model: 'custom-model',
      });
    });

    it('should use default values if not provided in the original conversation or as parameters', () => {
      const requestUserId = 'user-123';
      const builder = new ImportBatchBuilder(requestUserId);
      builder.conversationId = 'conv-id-123';
      builder.messages = [{ text: 'Hello, world!' }];
      builder.endpoint = 'test-endpoint';
      const result = builder.finishConversation();
      expect(result.conversation.title).toBe('Imported Chat');
      expect(result.conversation.model).toBe(openAISettings.model.default);
    });
  });
});

describe('importChatBotUiConvo', () => {
  it('should import custom conversation correctly', async () => {
    const jsonData = JSON.parse(
      fs.readFileSync(path.join(__dirname, '__data__', 'chatbotui-export.json'), 'utf8'),
    );
    const requestUserId = 'custom-user-456';
    const importBatchBuilder = new ImportBatchBuilder(requestUserId);

    // Spy on instance methods
    jest.spyOn(importBatchBuilder, 'startConversation');
    jest.spyOn(importBatchBuilder, 'saveMessage');
    jest.spyOn(importBatchBuilder, 'addUserMessage');
    jest.spyOn(importBatchBuilder, 'addGptMessage');
    jest.spyOn(importBatchBuilder, 'finishConversation');
    jest.spyOn(importBatchBuilder, 'saveBatch');

    const importer = getImporter(jsonData);
    await importer(jsonData, requestUserId, () => importBatchBuilder);

    expect(importBatchBuilder.startConversation).toHaveBeenCalledWith(EModelEndpoint.openAI);
    expect(importBatchBuilder.addUserMessage).toHaveBeenCalledTimes(3);
    expect(importBatchBuilder.addUserMessage).toHaveBeenNthCalledWith(
      1,
      'Hello what are you able to do?',
    );
    expect(importBatchBuilder.addUserMessage).toHaveBeenNthCalledWith(
      3,
      'Give me the code that inverts binary tree in COBOL',
    );

    expect(importBatchBuilder.addGptMessage).toHaveBeenCalledTimes(3);
    expect(importBatchBuilder.addGptMessage).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/^Hello! As an AI developed by OpenAI/),
      'gpt-4-1106-preview',
    );
    expect(importBatchBuilder.addGptMessage).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('```cobol'),
      'gpt-3.5-turbo',
    );

    expect(importBatchBuilder.finishConversation).toHaveBeenCalledTimes(2);
    expect(importBatchBuilder.finishConversation).toHaveBeenNthCalledWith(
      1,
      'Hello what are you able to do?',
      expect.any(Date),
    );
    expect(importBatchBuilder.finishConversation).toHaveBeenNthCalledWith(
      2,
      'Give me the code that inverts ...',
      expect.any(Date),
    );

    expect(importBatchBuilder.saveBatch).toHaveBeenCalled();
  });
});

describe('getImporter', () => {
  it('should throw an error if the import type is not supported', () => {
    const jsonData = { unsupported: 'data' };
    expect(() => getImporter(jsonData)).toThrow('Unsupported import type');
  });
});
