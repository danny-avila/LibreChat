const { getImporter } = require('./importers');
const fs = require('fs');
const path = require('path');
const { ImportBatchBuilder } = require('./importBatchBuilder');

// Mocking the ImportBatchBuilder class and its methods
jest.mock('./importBatchBuilder', () => {
  return {
    ImportBatchBuilder: jest.fn().mockImplementation(() => {
      return {
        startConversation: jest.fn().mockResolvedValue(undefined),
        addUserMessage: jest.fn().mockResolvedValue(undefined),
        addGptMessage: jest.fn().mockResolvedValue(undefined),
        finishConversation: jest.fn().mockResolvedValue(undefined),
        saveBatch: jest.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

describe('importChatGptConvo', () => {
  it('should import conversation correctly', async () => {
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
    expect(mockImportBatchBuilder.startConversation).toHaveBeenCalledWith('openAI');

    expect(mockImportBatchBuilder.addUserMessage).toHaveBeenCalledTimes(5);
    expect(mockImportBatchBuilder.addUserMessage).toHaveBeenNthCalledWith(
      1,
      'What is the fuel consumption of vw  transporter with 8 people in l/km',
    );
    expect(mockImportBatchBuilder.addUserMessage).toHaveBeenNthCalledWith(
      2,
      'What about 10 year old model',
    );
    expect(mockImportBatchBuilder.addUserMessage).toHaveBeenNthCalledWith(5, 'give me code in C#');

    expect(mockImportBatchBuilder.addGptMessage).toHaveBeenCalledTimes(5);
    expect(mockImportBatchBuilder.addGptMessage).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/^The fuel consumption of a/),
      'gpt-4',
    );
    // make sure that the link format is correct
    expect(mockImportBatchBuilder.addGptMessage).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        '[Volkswagen Transporter Review - Drive](https://www.drive.com.au/reviews/volkswagen-transporter-review/)',
      ),
      'gpt-4',
    );
    expect(mockImportBatchBuilder.addGptMessage).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining('```csharp'),
      'text-davinci-002-render-sha',
    );

    expect(mockImportBatchBuilder.finishConversation).toHaveBeenCalledTimes(2);
    expect(mockImportBatchBuilder.finishConversation).toHaveBeenNthCalledWith(
      1,
      'Conversation 1. Web Search',
      new Date(1704629915775.304),
    );
    expect(mockImportBatchBuilder.finishConversation).toHaveBeenNthCalledWith(
      2,
      'Conversation 2',
      new Date(1697373097899.566),
    );

    expect(mockImportBatchBuilder.saveBatch).toHaveBeenCalled();
  });
});

describe('importLibreChatConvo', () => {
  it('should import conversation correctly', async () => {
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
    expect(mockedBuilderFactory).toHaveBeenCalledWith(requestUserId);
    const mockImportBatchBuilder = mockedBuilderFactory.mock.results[0].value;
    expect(mockImportBatchBuilder.startConversation).toHaveBeenCalledWith('openAI');

    expect(mockImportBatchBuilder.addUserMessage).toHaveBeenCalledTimes(3);
    expect(mockImportBatchBuilder.addUserMessage).toHaveBeenNthCalledWith(
      1,
      'What is the fuel consumption of vw  transporter with 8 people in l/km',
    );
    expect(mockImportBatchBuilder.addUserMessage).toHaveBeenNthCalledWith(
      2,
      'What about 10 year old model',
    );

    expect(mockImportBatchBuilder.addGptMessage).toHaveBeenCalledTimes(3);
    expect(mockImportBatchBuilder.addGptMessage).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/^The fuel consumption of a/),
      'gpt-3.5-turbo',
      'GPT-3.5',
    );
    // make sure that the link format is correct
    expect(mockImportBatchBuilder.addGptMessage).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        '[Volkswagen Transporter Review - Drive](https://www.drive.com.au/reviews/volkswagen-transporter-review/)',
      ),
      'gpt-3.5-turbo',
      'GPT-3.5',
    );

    expect(mockImportBatchBuilder.finishConversation).toHaveBeenCalledTimes(1);
    expect(mockImportBatchBuilder.finishConversation).toHaveBeenNthCalledWith(
      1,
      'Conversation 1. Web Search',
      new Date('2024-04-09T14:32:05.230Z'),
    );

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
    expect(mockedBuilderFactory).toHaveBeenCalledWith(requestUserId);
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
