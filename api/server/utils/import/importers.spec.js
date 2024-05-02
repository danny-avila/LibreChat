const fs = require('fs');
const path = require('path');
const { EModelEndpoint, Constants } = require('librechat-data-provider');
const { ImportBatchBuilder } = require('./importBatchBuilder');
const { getImporter } = require('./importers');

// Mocking the ImportBatchBuilder class and its methods
jest.mock('./importBatchBuilder', () => {
  return {
    ImportBatchBuilder: jest.fn().mockImplementation(() => {
      return {
        startConversation: jest.fn().mockResolvedValue(undefined),
        addUserMessage: jest.fn().mockResolvedValue(undefined),
        addGptMessage: jest.fn().mockResolvedValue(undefined),
        saveMessage: jest.fn().mockResolvedValue(undefined),
        finishConversation: jest.fn().mockResolvedValue(undefined),
        saveBatch: jest.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

describe('importChatGptConvo', () => {
  it('should import conversation correctly', async () => {
    const expectedNumberOfMessages = 10;
    const expectedNumberOfConversations = 2;
    // Given
    const jsonData = JSON.parse(
      fs.readFileSync(path.join(__dirname, '__data__', 'chatgpt-export.json'), 'utf8'),
    );
    const requestUserId = 'user-123';
    const mockedBuilderFactory = jest.fn().mockReturnValue(new ImportBatchBuilder(requestUserId));

    // When
    const importer = getImporter(jsonData);
    await importer(jsonData, requestUserId, mockedBuilderFactory);

    // Then
    expect(mockedBuilderFactory).toHaveBeenCalledWith(requestUserId);
    const mockImportBatchBuilder = mockedBuilderFactory.mock.results[0].value;

    expect(mockImportBatchBuilder.startConversation).toHaveBeenCalledWith(EModelEndpoint.openAI);
    expect(mockImportBatchBuilder.saveMessage).toHaveBeenCalledTimes(expectedNumberOfMessages); // Adjust expected number
    expect(mockImportBatchBuilder.finishConversation).toHaveBeenCalledTimes(
      expectedNumberOfConversations,
    ); // Adjust expected number
    expect(mockImportBatchBuilder.saveBatch).toHaveBeenCalled();
  });
  it('should maintain correct message hierarchy (tree parent/children relationship)', async () => {
    // Prepare test data with known hierarchy
    const jsonData = JSON.parse(
      fs.readFileSync(path.join(__dirname, '__data__', 'chatgpt-tree.json'), 'utf8'),
    );

    const requestUserId = 'user-123';
    const mockedBuilderFactory = jest.fn().mockReturnValue(new ImportBatchBuilder(requestUserId));

    // When
    const importer = getImporter(jsonData);
    await importer(jsonData, requestUserId, mockedBuilderFactory);

    // Then
    expect(mockedBuilderFactory).toHaveBeenCalledWith(requestUserId);
    const mockImportBatchBuilder = mockedBuilderFactory.mock.results[0].value;

    const entries = Object.keys(jsonData[0].mapping);
    // Filter entries that should be processed (not system and have content)
    const messageEntries = entries.filter(
      (id) =>
        jsonData[0].mapping[id].message &&
        jsonData[0].mapping[id].message.author.role !== 'system' &&
        jsonData[0].mapping[id].message.content.parts.join('').trim() !== '',
    );

    // Expect the saveMessage to be called for each valid entry
    expect(mockImportBatchBuilder.saveMessage).toHaveBeenCalledTimes(messageEntries.length);

    const idToUuidMap = new Map();
    // Map original IDs to dynamically generated UUIDs
    mockImportBatchBuilder.saveMessage.mock.calls.forEach((call, index) => {
      const originalId = messageEntries[index];
      idToUuidMap.set(originalId, call[0].messageId);
    });

    // Validate the UUID map contains all expected entries
    expect(idToUuidMap.size).toBe(messageEntries.length);

    // Validate correct parent-child relationships
    messageEntries.forEach((id) => {
      const { parent } = jsonData[0].mapping[id];

      const expectedParentUuid = parent
        ? idToUuidMap.get(parent) ?? Constants.NO_PARENT
        : Constants.NO_PARENT;

      const actualParentUuid = idToUuidMap.get(id)
        ? mockImportBatchBuilder.saveMessage.mock.calls.find(
          (call) => call[0].messageId === idToUuidMap.get(id),
        )[0].parentMessageId
        : Constants.NO_PARENT;

      expect(actualParentUuid).toBe(expectedParentUuid);
    });

    expect(mockImportBatchBuilder.saveBatch).toHaveBeenCalled();
  });
});

describe('importLibreChatConvo', () => {
  it('should import conversation correctly', async () => {
    const expectedNumberOfMessages = 6;
    const expectedNumberOfConversations = 1;

    // Given
    const jsonData = JSON.parse(
      fs.readFileSync(path.join(__dirname, '__data__', 'librechat-export.json'), 'utf8'),
    );
    const requestUserId = 'user-123';
    const mockedBuilderFactory = jest.fn().mockReturnValue(new ImportBatchBuilder(requestUserId));

    // When
    const importer = getImporter(jsonData);
    await importer(jsonData, requestUserId, mockedBuilderFactory);

    // Then
    const mockImportBatchBuilder = mockedBuilderFactory.mock.results[0].value;
    expect(mockImportBatchBuilder.startConversation).toHaveBeenCalledWith(EModelEndpoint.openAI);
    expect(mockImportBatchBuilder.saveMessage).toHaveBeenCalledTimes(expectedNumberOfMessages); // Adjust expected number
    expect(mockImportBatchBuilder.finishConversation).toHaveBeenCalledTimes(
      expectedNumberOfConversations,
    ); // Adjust expected number
    expect(mockImportBatchBuilder.saveBatch).toHaveBeenCalled();
  });
});

describe('importChatBotUiConvo', () => {
  it('should import custom conversation correctly', async () => {
    // Given
    const jsonData = JSON.parse(
      fs.readFileSync(path.join(__dirname, '__data__', 'chatbotui-export.json'), 'utf8'),
    );
    const requestUserId = 'custom-user-456';
    const mockedBuilderFactory = jest.fn().mockReturnValue(new ImportBatchBuilder(requestUserId));

    // When
    const importer = getImporter(jsonData);
    await importer(jsonData, requestUserId, mockedBuilderFactory);

    // Then
    const mockImportBatchBuilder = mockedBuilderFactory.mock.results[0].value;
    expect(mockImportBatchBuilder.startConversation).toHaveBeenCalledWith('openAI');

    // User messages
    expect(mockImportBatchBuilder.addUserMessage).toHaveBeenCalledTimes(3);
    expect(mockImportBatchBuilder.addUserMessage).toHaveBeenNthCalledWith(
      1,
      'Hello what are you able to do?',
    );
    expect(mockImportBatchBuilder.addUserMessage).toHaveBeenNthCalledWith(
      3,
      'Give me the code that inverts binary tree in COBOL',
    );

    // GPT messages
    expect(mockImportBatchBuilder.addGptMessage).toHaveBeenCalledTimes(3);
    expect(mockImportBatchBuilder.addGptMessage).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/^Hello! As an AI developed by OpenAI/),
      'gpt-4-1106-preview',
    );
    expect(mockImportBatchBuilder.addGptMessage).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('```cobol'),
      'gpt-3.5-turbo',
    );

    expect(mockImportBatchBuilder.finishConversation).toHaveBeenCalledTimes(2);
    expect(mockImportBatchBuilder.finishConversation).toHaveBeenNthCalledWith(
      1,
      'Hello what are you able to do?',
      expect.any(Date),
    );
    expect(mockImportBatchBuilder.finishConversation).toHaveBeenNthCalledWith(
      2,
      'Give me the code that inverts ...',
      expect.any(Date),
    );

    expect(mockImportBatchBuilder.saveBatch).toHaveBeenCalled();
  });
});

describe('getImporter', () => {
  it('should throw an error if the import type is not supported', () => {
    // Given
    const jsonData = { unsupported: 'data' };

    // When
    expect(() => getImporter(jsonData)).toThrow('Unsupported import type');
  });
});
