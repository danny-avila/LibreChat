const mockValidateAuthor = jest.fn().mockResolvedValue(undefined);
const mockInitThread = jest.fn();
const mockRunAssistant = jest.fn();
const mockCreateRun = jest.fn();
const mockStreamRunManager = jest.fn();
const mockSendEvent = jest.fn();
const mockSaveUserMessage = jest.fn();
const mockSendResponse = jest.fn();
const mockHandleError = jest.fn();
const mockRetrieveAssistant = jest.fn();
const mockListThreadMessages = jest.fn();
const mockGetConvo = jest.fn();
const mockGetImportedAssistantMessages = jest.fn();
const mockGetFiles = jest.fn();
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
  StreamRunManager: mockStreamRunManager,
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
  getConvo: (...args) => mockGetConvo(...args),
  getImportedAssistantMessages: (...args) => mockGetImportedAssistantMessages(...args),
  getFiles: (...args) => mockGetFiles(...args),
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

const {
  countTokens,
  checkBalance,
  getBalanceConfig,
  getModelMaxTokens,
} = require('@librechat/api');
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
    countTokens.mockReset();
    checkBalance.mockReset();
    getBalanceConfig.mockReset();
    getModelMaxTokens.mockReset();
    mockRetrieveAssistant.mockReset().mockResolvedValue({
      id: 'asst-1',
      instructions: 'Safe assistant',
      tools: [],
    });
    mockListThreadMessages.mockReset().mockResolvedValue({
      data: [],
      has_more: false,
    });
    mockGetFiles.mockReset().mockResolvedValue([]);
    mockGetConvo.mockReset().mockResolvedValue(null);
    mockGetImportedAssistantMessages.mockReset().mockResolvedValue(null);
    mockInitThread.mockReset();
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
      headersSent: false,
      headersSentAtStatus: undefined,
      on: jest.fn((event, handler) => {
        if (event === 'close') {
          closeHandler = handler;
        }
      }),
      status: jest.fn(function () {
        this.headersSentAtStatus = this.headersSent;
        return this;
      }),
      json: jest.fn(function () {
        this.headersSent = true;
        return this;
      }),
      writeHead: jest.fn(function () {
        this.headersSent = true;
        return this;
      }),
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
    expect(mockStreamRunManager).not.toHaveBeenCalled();
    expect(mockSendEvent).not.toHaveBeenCalled();
    expect(res.writeHead).not.toHaveBeenCalled();
    expect(res.headersSentAtStatus).toBe(false);
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

  it.each(['assistants', 'azureAssistants'])(
    'starts a fresh %s thread with imported history',
    async (endpoint) => {
      req.body.endpoint = endpoint;
      req.body.conversationId = 'imported-conversation';
      req.body.parentMessageId = 'imported-parent';
      delete req.body.thread_id;
      mockGetImportedAssistantMessages.mockResolvedValue([
        {
          messageId: 'imported-parent',
          conversationId: 'imported-conversation',
          parentMessageId: '00000000-0000-0000-0000-000000000000',
          text: 'Historical context',
          isCreatedByUser: false,
          isUserSubmitted: true,
        },
      ]);
      mockInitThread.mockRejectedValueOnce(new Error('stop after initThread'));
      await chatController(req, res);
      expect(mockInitThread).toHaveBeenCalledTimes(1);
      const initialization = mockInitThread.mock.calls[0][0];
      expect(initialization.thread_id).toBeUndefined();
      expect(JSON.stringify(initialization.body.messages)).toContain('Historical context');
      expect(JSON.stringify(initialization.body.messages)).toContain('Safe current message');
      expect(mockListThreadMessages).not.toHaveBeenCalled();
    },
  );

  it.each(['assistants', 'azureAssistants'])(
    'awaits imported %s history before balance accounting',
    async (endpoint) => {
      req.body.endpoint = endpoint;
      req.body.conversationId = 'imported-conversation';
      req.body.parentMessageId = 'imported-parent';
      delete req.body.thread_id;
      let resolveHistory;
      let signalHistoryStarted;
      const historyStarted = new Promise((resolve) => {
        signalHistoryStarted = resolve;
      });
      mockGetImportedAssistantMessages.mockImplementation(() => {
        signalHistoryStarted();
        return new Promise((resolve) => {
          resolveHistory = resolve;
        });
      });
      let rejectInitialization;
      let signalInitializationStarted;
      const initializationStarted = new Promise((resolve) => {
        signalInitializationStarted = resolve;
      });
      mockInitThread.mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            signalInitializationStarted();
            rejectInitialization = reject;
          }),
      );
      let signalBalanceChecked;
      const balanceChecked = new Promise((resolve) => {
        signalBalanceChecked = resolve;
      });
      getBalanceConfig.mockReturnValue({ enabled: true });
      getModelMaxTokens.mockReturnValue(8192);
      countTokens.mockResolvedValue(321);
      checkBalance.mockImplementation(async () => {
        signalBalanceChecked();
      });

      const pending = chatController(req, res);
      await historyStarted;
      expect(mockInitThread).not.toHaveBeenCalled();
      expect(getBalanceConfig).not.toHaveBeenCalled();
      expect(countTokens).not.toHaveBeenCalled();
      resolveHistory([
        {
          messageId: 'imported-parent',
          conversationId: 'imported-conversation',
          parentMessageId: '00000000-0000-0000-0000-000000000000',
          text: 'Historical context',
          isCreatedByUser: false,
          isUserSubmitted: true,
        },
      ]);
      await balanceChecked;
      expect(countTokens).toHaveBeenCalledWith(expect.stringContaining('Historical context'));
      expect(countTokens).toHaveBeenCalledWith(expect.stringContaining('Safe current message'));
      expect(checkBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          txData: expect.objectContaining({ amount: 326 }),
        }),
        expect.any(Object),
      );
      await initializationStarted;
      rejectInitialization(new Error('stop after balance verification'));
      await pending;
    },
  );

  it.each(['assistants', 'azureAssistants'])(
    'rejects %s balance admission before writes and permits retry',
    async (endpoint) => {
      req.body.endpoint = endpoint;
      req.body.conversationId = 'imported-conversation';
      req.body.parentMessageId = 'imported-parent';
      delete req.body.thread_id;
      mockGetImportedAssistantMessages.mockResolvedValue([
        {
          messageId: 'imported-parent',
          conversationId: 'imported-conversation',
          parentMessageId: '00000000-0000-0000-0000-000000000000',
          text: 'History',
          isCreatedByUser: false,
          isUserSubmitted: true,
        },
      ]);
      getBalanceConfig.mockReturnValue({ enabled: true });
      getModelMaxTokens.mockReturnValue(8192);
      countTokens.mockResolvedValue(321);
      let signalBalanceStarted;
      const balanceStarted = new Promise((resolve) => {
        signalBalanceStarted = resolve;
      });
      let rejectBalance;
      checkBalance.mockImplementation(() => {
        signalBalanceStarted();
        return new Promise((_resolve, reject) => {
          rejectBalance = reject;
        });
      });
      const pending = chatController(req, res);
      await balanceStarted;
      expect(mockInitThread).not.toHaveBeenCalled();
      expect(mockSaveUserMessage).not.toHaveBeenCalled();
      rejectBalance(new Error('balance admission rejected'));
      await pending;
      expect(mockInitThread).not.toHaveBeenCalled();
      expect(mockSaveUserMessage).not.toHaveBeenCalled();
      checkBalance.mockResolvedValue(undefined);
      mockInitThread.mockRejectedValueOnce(new Error('stop after admitted initialization'));
      await chatController(req, res);
      expect(mockInitThread).toHaveBeenCalledTimes(1);
      expect(mockInitThread.mock.calls[0][0].thread_id).toBeUndefined();
    },
  );

  it('does not initialize after the request closes during balance admission', async () => {
    getBalanceConfig.mockReturnValue({ enabled: true });
    getModelMaxTokens.mockReturnValue(8192);
    countTokens.mockResolvedValue(1);
    checkBalance.mockImplementation(async () => {
      res.destroyed = true;
    });
    await chatController(req, res);
    expect(mockInitThread).not.toHaveBeenCalled();
    expect(mockSaveUserMessage).not.toHaveBeenCalled();
  });

  it.each([false, true])('preserves attachment-only input (imported=%s)', async (imported) => {
    req.body.text = '   ';
    req.body.files = [{ file_id: 'attachment', type: 'text/plain' }];
    delete req.body.thread_id;
    if (imported) {
      req.body.conversationId = 'imported-conversation';
      req.body.parentMessageId = 'imported-parent';
      mockGetImportedAssistantMessages.mockResolvedValue([
        {
          messageId: 'imported-parent',
          conversationId: 'imported-conversation',
          parentMessageId: '00000000-0000-0000-0000-000000000000',
          text: 'History',
          isCreatedByUser: false,
          isUserSubmitted: true,
        },
      ]);
    }
    mockInitThread.mockRejectedValueOnce(new Error('stop after initThread'));
    await chatController(req, res);
    expect(mockInitThread).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mockInitThread.mock.calls[0][0].body.messages)).toContain(
      require('@librechat/api').ATTACHMENT_ONLY_TEXT,
    );
  });

  it('checks imported context before creating a provider thread', async () => {
    req.body.conversationId = 'imported-conversation';
    req.body.parentMessageId = 'imported-parent';
    delete req.body.thread_id;
    req.config.filters.messages.pii = {
      fields: ['content_part'],
      starterPatterns: [],
      customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-[A-Z]+' }],
    };
    mockGetImportedAssistantMessages.mockResolvedValue([
      {
        messageId: 'imported-parent',
        conversationId: 'imported-conversation',
        parentMessageId: '00000000-0000-0000-0000-000000000000',
        text: 'PRIVATE-NOTE',
        isCreatedByUser: false,
        isUserSubmitted: true,
      },
    ]);
    await chatController(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockInitThread).not.toHaveBeenCalled();
    expect(mockSaveUserMessage).not.toHaveBeenCalled();
    await closeHandler();
    expect(mockHandleError).not.toHaveBeenCalled();
  });

  it('keeps rejecting an existing conversation without eligible imported history', async () => {
    req.body.conversationId = 'existing';
    delete req.body.thread_id;
    await chatController(req, res);
    expect(mockInitThread).not.toHaveBeenCalled();
    expect(mockSaveUserMessage).not.toHaveBeenCalled();
  });

  it('revalidates remote history at the initial run boundary before committing SSE headers', async () => {
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
    mockListThreadMessages
      .mockResolvedValueOnce({
        data: [
          {
            id: 'message-safe',
            role: 'user',
            content: [{ type: 'text', text: { value: 'Safe historical message' } }],
          },
        ],
        has_more: false,
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'message-changed',
            role: 'user',
            content: [{ type: 'text', text: { value: 'Changed PRIVATE-THREAD' } }],
          },
        ],
        has_more: false,
      });
    mockInitThread.mockResolvedValue({ thread_id: 'thread-existing' });

    await chatController(req, res);

    expect(mockListThreadMessages).toHaveBeenCalledTimes(2);
    expect(mockInitThread).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'content_filter_block',
        source: 'message',
        field: 'content_part',
      }),
    );
    expect(res.headersSentAtStatus).toBe(false);
    expect(res.writeHead).not.toHaveBeenCalled();
    expect(mockCreateRun).not.toHaveBeenCalled();
    expect(mockRunAssistant).not.toHaveBeenCalled();
    expect(mockStreamRunManager).not.toHaveBeenCalled();

    await closeHandler();
    expect(mockHandleError).not.toHaveBeenCalled();
  });

  it('does not read remote policy state for explicitly inactive selections', async () => {
    mockInitThread.mockRejectedValueOnce(new Error('stop after initThread'));

    await chatController(req, res);

    expect(mockGetImportedAssistantMessages).not.toHaveBeenCalled();
    expect(mockRetrieveAssistant).not.toHaveBeenCalled();
    expect(mockListThreadMessages).not.toHaveBeenCalled();
    expect(mockGetFiles).not.toHaveBeenCalled();
    expect(mockInitThread).toHaveBeenCalledTimes(1);
    expect(res.writeHead).not.toHaveBeenCalled();
  });

  if (_version === 'v1') {
    describe('V1 final conversation-file preflight', () => {
      beforeEach(() => {
        req.config.filters = {
          files: {
            pii: {
              fields: ['content'],
              starterPatterns: [],
              uninspectable: 'block',
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
        req.body.conversationId = 'conversation-existing';
        mockGetConvo.mockResolvedValue({
          conversationId: 'conversation-existing',
          file_ids: ['stored-file'],
        });
      });

      it('blocks canonical stored-conversation file content before initThread', async () => {
        mockGetFiles.mockResolvedValue([
          {
            file_id: 'stored-file',
            user: 'user-1',
            filename: 'stored.txt',
            type: 'text/plain',
            source: 'text',
            text: 'Stored PRIVATE-FILE',
          },
        ]);

        await chatV1(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'content_filter_block',
            source: 'file',
            field: 'content',
          }),
        );
        expect(mockGetFiles).toHaveBeenCalledWith(
          {
            file_id: { $in: ['stored-file'] },
            user: 'user-1',
          },
          {},
          {},
        );
        expect(mockInitThread).not.toHaveBeenCalled();
        expect(mockSaveUserMessage).not.toHaveBeenCalled();
        expect(mockCreateRun).not.toHaveBeenCalled();
        expect(mockRunAssistant).not.toHaveBeenCalled();
        expect(mockStreamRunManager).not.toHaveBeenCalled();
        expect(res.headersSentAtStatus).toBe(false);
        expect(res.writeHead).not.toHaveBeenCalled();
      });

      it.each(['missing', 'foreign'])(
        'fails closed for a %s stored-conversation file before initThread',
        async () => {
          mockGetFiles.mockResolvedValue([]);

          await chatV1(req, res);

          expect(res.status).toHaveBeenCalledWith(400);
          expect(res.json).toHaveBeenCalledWith({
            error: 'content_filter_uninspectable',
            message: 'Submitted file content could not be inspected before processing.',
            source: 'file',
            field: 'content',
          });
          expect(mockInitThread).not.toHaveBeenCalled();
          expect(mockSaveUserMessage).not.toHaveBeenCalled();
          expect(mockCreateRun).not.toHaveBeenCalled();
          expect(mockRunAssistant).not.toHaveBeenCalled();
          expect(mockStreamRunManager).not.toHaveBeenCalled();
          expect(res.headersSentAtStatus).toBe(false);
          expect(res.writeHead).not.toHaveBeenCalled();
        },
      );

      it('reuses the persisted assistant read before initializing a safe file-backed message', async () => {
        mockRetrieveAssistant.mockResolvedValueOnce({
          id: 'asst-1',
          instructions: 'Safe',
          tools: [],
        });
        mockGetFiles.mockResolvedValue([
          {
            file_id: 'stored-file',
            user: 'user-1',
            filename: 'stored.txt',
            type: 'text/plain',
            source: 'text',
            text: 'Safe stored file',
          },
        ]);
        req.body.endpointOption.attachments = Promise.resolve([{ source: 'local' }]);
        mockInitThread.mockRejectedValueOnce(new Error('stop after initThread'));

        await chatV1(req, res);

        expect(mockRetrieveAssistant).toHaveBeenCalledTimes(1);
        expect(mockInitThread).toHaveBeenCalledWith(
          expect.objectContaining({
            body: expect.objectContaining({
              messages: [
                expect.objectContaining({
                  role: 'user',
                  file_ids: ['stored-file'],
                }),
              ],
            }),
          }),
        );
      });

      it('preserves the disabled file-policy path without resolving canonical rows', async () => {
        req.config.filters = {};
        mockInitThread.mockRejectedValueOnce(new Error('stop after initThread'));

        await chatV1(req, res);

        expect(mockGetFiles).not.toHaveBeenCalled();
        expect(mockRetrieveAssistant).not.toHaveBeenCalled();
        expect(mockListThreadMessages).not.toHaveBeenCalled();
        expect(mockInitThread).toHaveBeenCalledWith(
          expect.objectContaining({
            body: expect.objectContaining({
              messages: [
                expect.objectContaining({
                  role: 'user',
                  file_ids: ['stored-file'],
                }),
              ],
            }),
          }),
        );
      });
    });
  }

  if (_version === 'v2') {
    describe('V2 final conversation-file preflight', () => {
      beforeEach(() => {
        req.config.filters = {
          files: {
            pii: {
              fields: ['content'],
              starterPatterns: [],
              uninspectable: 'block',
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
        req.body.conversationId = 'conversation-existing';
        mockGetConvo.mockResolvedValue({
          conversationId: 'conversation-existing',
          file_ids: ['stored-file'],
        });
      });

      it('blocks canonical stored-conversation file content before initThread or run', async () => {
        mockGetFiles.mockResolvedValue([
          {
            file_id: 'stored-file',
            user: 'user-1',
            filename: 'stored.txt',
            type: 'text/plain',
            source: 'text',
            text: 'Stored PRIVATE-FILE',
          },
        ]);

        await chatController(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'content_filter_block',
            source: 'file',
            field: 'content',
          }),
        );
        expect(mockGetConvo).toHaveBeenCalledTimes(1);
        expect(mockGetConvo).toHaveBeenCalledWith('user-1', 'conversation-existing');
        expect(mockGetFiles).toHaveBeenCalledWith(
          {
            file_id: { $in: ['stored-file'] },
            user: 'user-1',
          },
          {},
          {},
        );
        expect(mockInitThread).not.toHaveBeenCalled();
        expect(mockSaveUserMessage).not.toHaveBeenCalled();
        expect(mockCreateRun).not.toHaveBeenCalled();
        expect(mockRunAssistant).not.toHaveBeenCalled();
        expect(mockStreamRunManager).not.toHaveBeenCalled();
        expect(res.headersSentAtStatus).toBe(false);
        expect(res.writeHead).not.toHaveBeenCalled();

        await closeHandler();
        expect(mockHandleError).not.toHaveBeenCalled();
      });

      it('preserves the default-off V2 message shape and performs one conversation lookup', async () => {
        req.config.filters = {};
        mockInitThread.mockRejectedValueOnce(new Error('stop after initThread'));

        await chatController(req, res);

        expect(mockGetFiles).not.toHaveBeenCalled();
        expect(mockRetrieveAssistant).not.toHaveBeenCalled();
        expect(mockListThreadMessages).not.toHaveBeenCalled();
        expect(mockGetConvo).toHaveBeenCalledTimes(1);
        expect(mockInitThread).toHaveBeenCalledTimes(1);
        const userMessage = mockInitThread.mock.calls[0][0].body.messages[0];
        expect(userMessage.file_ids).toBeUndefined();
        expect(userMessage.attachments).toBeUndefined();
      });
    });
  }
});
