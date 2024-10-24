const fs = require('fs');
const path = require('path');
const { EModelEndpoint, Constants, openAISettings } = require('librechat-data-provider');
const { bulkSaveConvos: _bulkSaveConvos } = require('~/models/Conversation');
const { getImporter, processAssistantMessage } = require('./importers');
const { ImportBatchBuilder } = require('./importBatchBuilder');
const { bulkSaveMessages } = require('~/models/Message');
const getLogStores = require('~/cache/getLogStores');

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

describe('processAssistantMessage', () => {
  const testMessage = 'This is a test citation 【3:0†source】【3:1†source】';

  const messageData = {
    metadata: {
      citations: [
        {
          start_ix: 23, // Position of first "【3:0†source】"
          end_ix: 36, // End of first citation (including closing bracket)
          citation_format_type: 'tether_og',
          metadata: {
            type: 'webpage',
            title: 'Signal Sciences - Crunchbase Company Profile & Funding',
            url: 'https://www.crunchbase.com/organization/signal-sciences',
            text: '',
            pub_date: null,
            extra: {
              evidence_text: 'source',
              cited_message_idx: 3,
              search_result_idx: 0,
            },
          },
        },
        {
          start_ix: 36, // Position of second "【3:1†source】"
          end_ix: 49, // End of second citation (including closing bracket)
          citation_format_type: 'tether_og',
          metadata: {
            type: 'webpage',
            title: 'Demand More from Your WAF - Signal Sciences now part of Fastly',
            url: 'https://www.signalsciences.com/',
            text: '',
            pub_date: null,
            extra: {
              evidence_text: 'source',
              cited_message_idx: 3,
              search_result_idx: 1,
            },
          },
        },
      ],
    },
  };

  const messageText = testMessage;
  const expectedOutput =
    'This is a test citation ([Signal Sciences - Crunchbase Company Profile & Funding](https://www.crunchbase.com/organization/signal-sciences)) ([Demand More from Your WAF - Signal Sciences now part of Fastly](https://www.signalsciences.com/))';

  test('should correctly process citations and replace them with markdown links', () => {
    const result = processAssistantMessage(messageData, messageText);
    expect(result).toBe(expectedOutput);
  });

  test('should handle message with no citations', () => {
    const messageWithNoCitations = {
      metadata: {},
    };
    const result = processAssistantMessage(messageWithNoCitations, messageText);
    expect(result).toBe(messageText);
  });

  test('should handle citations with missing metadata', () => {
    const messageWithBadCitation = {
      metadata: {
        citations: [
          {
            start_ix: 85,
            end_ix: 97,
          },
        ],
      },
    };
    const result = processAssistantMessage(messageWithBadCitation, messageText);
    expect(result).toBe(messageText);
  });

  test('should handle citations with non-webpage type', () => {
    const messageWithNonWebpage = {
      metadata: {
        citations: [
          {
            start_ix: 85,
            end_ix: 97,
            metadata: {
              type: 'other',
              title: 'Test',
              url: 'http://test.com',
            },
          },
        ],
      },
    };
    const result = processAssistantMessage(messageWithNonWebpage, messageText);
    expect(result).toBe(messageText);
  });

  test('should handle empty message text', () => {
    const result = processAssistantMessage(messageData, '');
    expect(result).toBe('');
  });

  test('should handle undefined message text', () => {
    const result = processAssistantMessage(messageData, undefined);
    expect(result).toBe(undefined);
  });

  test('should handle invalid citation indices', () => {
    const messageWithBadIndices = {
      metadata: {
        citations: [
          {
            start_ix: 100,
            end_ix: 90, // end before start
            metadata: {
              type: 'webpage',
              title: 'Test',
              url: 'http://test.com',
            },
          },
        ],
      },
    };
    const result = processAssistantMessage(messageWithBadIndices, messageText);
    expect(result).toBe(messageText);
  });

  test('should correctly process citations from real ChatGPT data', () => {
    const jsonData = JSON.parse(
      fs.readFileSync(path.join(__dirname, '__data__', 'chatgpt-citations.json'), 'utf8'),
    );

    // Get the message containing citations from the JSON data
    const assistantMessage = jsonData[0].mapping['4b3aec6b-5146-4bad-ae8e-204fdb6accda'].message;

    const messageText = assistantMessage.content.parts[0];
    const citations = assistantMessage.metadata.citations;

    // Expected output should have all citations replaced with markdown links
    const expectedOutput =
      'Signal Sciences is a web application security company that was founded on March 10, 2014, by Andrew Peterson, Nick Galbreath, and Zane Lackey. It operates as a for-profit company with its legal name being Signal Sciences Corp. The company has achieved significant growth and is recognized as the fastest-growing web application security company in the world. Signal Sciences developed a next-gen web application firewall (NGWAF) and runtime application self-protection (RASP) technologies designed to increase security and maintain reliability without compromising the performance of modern web applications distributed across cloud, on-premise, edge, or hybrid environments ([Signal Sciences - Crunchbase Company Profile & Funding](https://www.crunchbase.com/organization/signal-sciences)) ([Demand More from Your WAF - Signal Sciences now part of Fastly](https://www.signalsciences.com/)).\n\nIn a major development, Fastly, Inc., a provider of an edge cloud platform, announced the completion of its acquisition of Signal Sciences on October 1, 2020. This acquisition was valued at approximately $775 million in cash and stock. By integrating Signal Sciences\' powerful web application and API security solutions with Fastly\'s edge cloud platform and existing security offerings, they aimed to form a unified suite of security solutions. The merger was aimed at expanding Fastly\'s security portfolio, particularly at a time when digital security has become paramount for businesses operating online ([Fastly Completes Acquisition of Signal Sciences | Fastly](https://www.fastly.com/press/press-releases/fastly-completes-acquisition-signal-sciences)) ([Fastly Agrees to Acquire Signal Sciences for $775 Million - Cooley](https://www.cooley.com/news/coverage/2020/2020-08-27-fastly-agrees-to-acquire-signal-sciences-for-775-million)).';

    const result = processAssistantMessage(assistantMessage, messageText);
    expect(result).toBe(expectedOutput);

    // Additional checks to verify citation processing
    citations.forEach((citation) => {
      // Verify each citation was replaced
      const markdownLink = `([${citation.metadata.title}](${citation.metadata.url}))`;
      expect(result).toContain(markdownLink);

      // Verify original citation format is not present
      const originalCitation = messageText.slice(citation.start_ix, citation.end_ix);
      expect(result).not.toContain(originalCitation);
    });
  });

  test('should handle potential ReDoS attack payloads', () => {
    // Test with increasing input sizes to check for exponential behavior
    const sizes = [32, 33, 34]; // Adding more sizes would increase test time
    const regExp = '(a+)+';
    const results = [];

    sizes.forEach((size) => {
      const startTime = process.hrtime();

      const maliciousMessageData = {
        metadata: {
          citations: [
            {
              start_ix: 0,
              end_ix: size,
              citation_format_type: 'tether_og',
              metadata: {
                type: 'webpage',
                title: 'Test',
                url: 'http://test.com',
                extra: {
                  cited_message_idx: regExp,
                },
              },
            },
          ],
        },
      };

      const maliciousText = '【' + 'a'.repeat(size) + '】';

      processAssistantMessage(maliciousMessageData, maliciousText);

      const endTime = process.hrtime(startTime);
      const duration = endTime[0] * 1000 + endTime[1] / 1000000; // Convert to milliseconds
      results.push(duration);
    });

    // Check if processing time increases exponentially
    // In a ReDoS vulnerability, time would roughly double with each size increase
    for (let i = 1; i < results.length; i++) {
      const ratio = results[i] / results[i - 1];
      expect(ratio).toBeLessThan(2); // Processing time should not double
      console.log(`Size ${sizes[i]} processing time ratio: ${ratio}`);
    }

    // Also test with the exact payload from the security report
    const maliciousPayload = {
      metadata: {
        citations: [
          {
            metadata: {
              extra: {
                cited_message_idx: '(a+)+',
              },
              type: 'webpage',
              title: '1',
              url: '2',
            },
          },
        ],
      },
    };

    const text = '【' + 'a'.repeat(32);
    const startTime = process.hrtime();
    processAssistantMessage(maliciousPayload, text);
    const endTime = process.hrtime(startTime);
    const duration = endTime[0] * 1000 + endTime[1] / 1000000;

    // The processing should complete quickly (under 100ms)
    expect(duration).toBeLessThan(100);
  });
});
