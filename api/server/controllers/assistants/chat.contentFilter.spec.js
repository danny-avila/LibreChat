const mockValidateAuthor = jest.fn().mockResolvedValue(undefined);
const mockInitThread = jest.fn();
const mockRunAssistant = jest.fn();
const mockCreateRun = jest.fn();
const mockSendEvent = jest.fn();
const mockSaveUserMessage = jest.fn();
const mockSendResponse = jest.fn();
const mockHandleError = jest.fn();
const mockRetrieveAssistant = jest.fn();
const mockListThreadMessages = jest.fn();
const mockGetOpenAIClient = jest.fn().mockResolvedValue({
  openai: {
    beta: {
      assistants: {
        retrieve: mockRetrieveAssistant,
      },
      threads: {
        messages: {
          list: mockListThreadMessages,
        },
        runs: {},
      },
    },
  },
});

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'generated-id'),
}));

jest.mock('@librechat/agents', () => ({
  ...jest.requireActual('@librechat/agents'),
  sleep: jest.fn(),
}));

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('@librechat/api', () => {
  const actual = jest.requireActual('../../../../packages/api/dist/index.cjs');
  return {
    ...actual,
    sendEvent: (...args) => mockSendEvent(...args),
    countTokens: jest.fn(),
    checkBalance: jest.fn(),
    getBalanceConfig: jest.fn(),
    getModelMaxTokens: jest.fn(),
  };
});

jest.mock('librechat-data-provider', () => jest.requireActual('librechat-data-provider'));

jest.mock('~/server/services/Threads', () => ({
  initThread: (...args) => mockInitThread(...args),
  recordUsage: jest.fn(),
  saveUserMessage: (...args) => mockSaveUserMessage(...args),
  checkMessageGaps: jest.fn(),
  addThreadMetadata: jest.fn(),
  saveAssistantMessage: jest.fn(),
}));

jest.mock('~/server/services/AssistantService', () => ({
  runAssistant: (...args) => mockRunAssistant(...args),
  createOnTextProgress: jest.fn(),
}));

jest.mock('~/server/controllers/assistants/errors', () => ({
  createErrorHandler: jest.fn(() => mockHandleError),
}));

jest.mock(
  '~/server/middleware/assistants/validateAuthor',
  () =>
    (...args) =>
      mockValidateAuthor(...args),
);

jest.mock('~/app/clients/prompts', () => ({
  formatMessage: jest.fn(),
  createVisionPrompt: jest.fn(),
}));

jest.mock('~/server/services/Files/images/encode', () => ({
  encodeAndFormat: jest.fn(),
}));

jest.mock('~/server/services/Runs', () => ({
  createRun: (...args) => mockCreateRun(...args),
  StreamRunManager: jest.fn(),
}));

jest.mock('~/server/services/Endpoints/assistants', () => ({
  addTitle: jest.fn(),
}));

jest.mock('~/server/services/createRunBody', () => ({
  createRunBody: jest.fn(),
}));

jest.mock('~/server/middleware/error', () => ({
  sendResponse: (...args) => mockSendResponse(...args),
}));

jest.mock('~/models', () => ({
  createAutoRefillTransaction: jest.fn(),
  findBalanceByUser: jest.fn(),
  upsertBalanceFields: jest.fn(),
  getTransactions: jest.fn(),
  getMultiplier: jest.fn(),
  getConvo: jest.fn(),
}));

jest.mock('~/cache', () => ({
  logViolation: jest.fn(),
  getLogStores: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  })),
}));

jest.mock('./helpers', () => ({
  getOpenAIClient: (...args) => mockGetOpenAIClient(...args),
}));

const chatV1 = require('./chatV1');
const chatV2 = require('./chatV2');

describe.each([
  ['v1', chatV1],
  ['v2', chatV2],
])('Assistants chat %s current-policy preflight', (_version, chatController) => {
  let closeHandler;
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    closeHandler = undefined;
    req = {
      config: {
        filters: {
          messages: {
            pii: {
              starterPatterns: [],
            },
          },
        },
      },
      user: { id: 'user-1' },
      body: {
        text: 'Safe current message',
        model: 'gpt-4',
        endpoint: 'assistants',
        assistant_id: 'asst-1',
        thread_id: 'thread-existing',
        endpointOption: {},
        files: [],
      },
    };
    res = {
      on: jest.fn((event, handler) => {
        if (event === 'close') {
          closeHandler = handler;
        }
      }),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      writeHead: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
    };
  });

  async function expectRawFreeRejection(rawContent, expectedSource, expectedField) {
    await chatController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'content_filter_block',
        source: expectedSource,
        field: expectedField,
      }),
    );
    expect(JSON.stringify(res.json.mock.calls)).not.toContain(rawContent);
    expect(mockInitThread).not.toHaveBeenCalled();
    expect(mockSaveUserMessage).not.toHaveBeenCalled();
    expect(mockCreateRun).not.toHaveBeenCalled();
    expect(mockRunAssistant).not.toHaveBeenCalled();
    expect(mockSendEvent).not.toHaveBeenCalled();
    expect(res.writeHead).not.toHaveBeenCalled();
    expect(res.write).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();

    await closeHandler();
    expect(mockHandleError).not.toHaveBeenCalled();
    expect(mockSendResponse).not.toHaveBeenCalled();
  }

  it('blocks persisted instructions before thread, message, run, or stream side effects', async () => {
    req.config.filters = {
      agentInstructions: {
        pii: {
          fields: ['instructions'],
          starterPatterns: [],
          customPatterns: [
            {
              id: 'private',
              label: 'private value',
              regex: 'PRIVATE-[A-Z]+',
            },
          ],
        },
      },
    };
    mockRetrieveAssistant.mockResolvedValueOnce({
      id: 'asst-1',
      instructions: 'Persisted PRIVATE-INSTRUCTION',
      tools: [],
    });

    await expectRawFreeRejection('PRIVATE-INSTRUCTION', 'agent_instruction', 'instructions');

    expect(mockRetrieveAssistant).toHaveBeenCalledWith('asst-1');
    expect(mockListThreadMessages).not.toHaveBeenCalled();
  });

  it('blocks paged historical user text before thread, message, run, or stream side effects', async () => {
    req.config.filters = {
      messages: {
        pii: {
          fields: ['content_part'],
          starterPatterns: [],
          customPatterns: [
            {
              id: 'private',
              label: 'private value',
              regex: 'PRIVATE-[A-Z]+',
            },
          ],
        },
      },
    };
    const secondPage = {
      data: [
        {
          id: 'message-user',
          role: 'user',
          content: [{ type: 'text', text: { value: 'Historical PRIVATE-THREAD' } }],
        },
      ],
      hasNextPage: () => false,
    };
    mockListThreadMessages.mockResolvedValueOnce({
      data: [
        {
          id: 'message-model',
          role: 'assistant',
          content: [{ type: 'text', text: { value: 'PRIVATE-MODEL' } }],
        },
      ],
      hasNextPage: () => true,
      getNextPage: jest.fn().mockResolvedValue(secondPage),
    });

    await expectRawFreeRejection('PRIVATE-THREAD', 'message', 'content_part');

    expect(mockRetrieveAssistant).not.toHaveBeenCalled();
    expect(mockListThreadMessages).toHaveBeenCalledWith('thread-existing', {
      limit: 100,
      order: 'asc',
    });
  });
});
