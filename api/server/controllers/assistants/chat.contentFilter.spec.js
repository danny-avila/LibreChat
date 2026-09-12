const mockValidateAuthor = jest.fn().mockResolvedValue(undefined);
const mockInitThread = jest.fn();
const mockRunAssistant = jest.fn();
const mockCreateRun = jest.fn();
const mockStreamRunManager = jest.fn();
const mockSendEvent = jest.fn();
const mockSaveUserMessage = jest.fn();
const mockCountTokens = jest.fn();
const mockCheckBalance = jest.fn();
const mockGetBalanceConfig = jest.fn();
const mockGetModelMaxTokens = jest.fn();
const mockGetTransactions = jest.fn();
const mockResolveChatProjectContext = jest.fn();
const mockSendResponse = jest.fn();
const mockCreateRunBody = jest.fn();
const mockHandleError = jest.fn();
const mockRetrieveAssistant = jest.fn();
const mockListThreadMessages = jest.fn();
const mockGetConvo = jest.fn();
const mockGetChatProject = jest.fn();
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
    countTokens: (...args) => mockCountTokens(...args),
    checkBalance: (...args) => mockCheckBalance(...args),
    getBalanceConfig: (...args) => mockGetBalanceConfig(...args),
    getModelMaxTokens: (...args) => mockGetModelMaxTokens(...args),
    resolveChatProjectContext: (...args) => mockResolveChatProjectContext(...args),
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
  createRunBody: (...args) => mockCreateRunBody(...args),
}));

jest.mock('~/server/middleware/error', () => ({
  sendResponse: (...args) => mockSendResponse(...args),
}));

jest.mock('~/models', () => ({
  createAutoRefillTransaction: jest.fn(),
  findBalanceByUser: jest.fn(),
  upsertBalanceFields: jest.fn(),
  getTransactions: (...args) => mockGetTransactions(...args),
  getMultiplier: jest.fn(),
  getConvo: (...args) => mockGetConvo(...args),
  getChatProject: (...args) => mockGetChatProject(...args),
  getProjectFiles: (...args) => mockGetFiles(...args),
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
    mockCountTokens.mockReset().mockResolvedValue(0);
    mockCheckBalance.mockReset().mockResolvedValue(undefined);
    mockGetBalanceConfig.mockReset().mockReturnValue({ enabled: false });
    mockGetModelMaxTokens.mockReset().mockReturnValue(100000);
    mockGetTransactions.mockReset().mockResolvedValue([]);
    mockResolveChatProjectContext.mockReset().mockResolvedValue(null);
    mockCreateRunBody.mockReset().mockReturnValue({});
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
    mockGetChatProject.mockReset().mockResolvedValue(null);
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
  it('blocks project guidance before provider, thread, message, run, or stream side effects', async () => {
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
    mockResolveChatProjectContext.mockResolvedValueOnce({
      projectId: '507f1f77bcf86cd799439012',
      contextRevision: 1,
      instructions: 'Project guidance PRIVATE-INSTRUCTION',
      file_ids: [],
    });

    await expectRawFreeRejection('PRIVATE-INSTRUCTION', 'agent_instruction', 'instructions');

    expect(mockResolveChatProjectContext).toHaveBeenCalledTimes(1);
    expect(mockGetOpenAIClient).not.toHaveBeenCalled();
    expect(mockValidateAuthor).not.toHaveBeenCalled();
  });
  it('returns not found for an unavailable Project without provider or close-handler effects', async () => {
    req.body.endpointOption = { chatProjectId: 'missing-project' };
    mockResolveChatProjectContext.mockImplementationOnce(
      jest.requireActual('../../../../packages/api/dist/index.cjs').resolveChatProjectContext,
    );
    await chatController(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockGetOpenAIClient).not.toHaveBeenCalled();
    expect(mockInitThread).not.toHaveBeenCalled();
    expect(mockSaveUserMessage).not.toHaveBeenCalled();
    expect(mockCreateRun).not.toHaveBeenCalled();
    expect(mockRunAssistant).not.toHaveBeenCalled();
    expect(mockStreamRunManager).not.toHaveBeenCalled();
    await closeHandler();
    expect(mockHandleError).not.toHaveBeenCalled();
    expect(mockSendResponse).not.toHaveBeenCalled();
  });

  it('passes authorized project guidance to the provider without loading project resources', async () => {
    const project = {
      _id: 'project-a',
      instructions: 'Project instructions for the provider',
      contextRevision: 4,
      file_ids: ['unused-project-file'],
    };
    req.body.endpoint = 'azureAssistants';
    req.body.endpointOption = { chatProjectId: 'project-a' };
    mockGetChatProject.mockResolvedValueOnce(project);
    mockGetFiles.mockRejectedValueOnce(new Error('unused project file lookup must not run'));
    mockResolveChatProjectContext.mockImplementationOnce(
      jest.requireActual('../../../../packages/api/dist/index.cjs').resolveChatProjectContext,
    );
    mockInitThread.mockResolvedValueOnce({ thread_id: 'thread-existing' });
    mockGetOpenAIClient.mockResolvedValueOnce({
      openai: {
        _options: { model: 'gpt-4' },
        responseMessage: { messageId: 'response-message' },
        beta: {
          assistants: { retrieve: mockRetrieveAssistant },
          threads: { messages: { list: mockListThreadMessages }, runs: {} },
        },
      },
    });
    mockCreateRun.mockRejectedValueOnce(new Error('stop after provider request'));

    await chatController(req, res);

    expect(mockGetFiles).not.toHaveBeenCalled();
    expect(mockCreateRun).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          additional_instructions: expect.stringContaining(project.instructions),
        }),
      }),
    );
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
  it('rejects a new hosted run before provider execution when project guidance exceeds balance', async () => {
    const projectContext = {
      projectId: '507f1f77bcf86cd799439012',
      contextRevision: 1,
      instructions: 'Large project guidance '.repeat(100),
      file_ids: [],
    };
    const projectInstructions = `Project guidance (user-provided context; subordinate to system, platform, agent, and tool policies):
${projectContext.instructions}`;
    req.body.thread_id = undefined;
    req.body.conversationId = undefined;
    mockResolveChatProjectContext.mockResolvedValueOnce(projectContext);
    mockGetBalanceConfig.mockReturnValueOnce({ enabled: true });
    mockGetTransactions.mockResolvedValueOnce([]);
    mockGetModelMaxTokens.mockReturnValueOnce(100000);
    mockCountTokens.mockImplementationOnce(async (value) => value.length);
    mockCheckBalance.mockRejectedValueOnce(new Error('Insufficient balance'));
    mockInitThread.mockResolvedValueOnce({ thread_id: 'thread-new' });

    await chatController(req, res);

    const promptText = `${req.body.text}\n\n${projectInstructions}`;
    expect(mockCountTokens).toHaveBeenCalledWith(promptText);
    expect(mockCheckBalance).toHaveBeenCalledWith(
      expect.objectContaining({
        txData: expect.objectContaining({
          amount: promptText.length + 5 + 200,
        }),
      }),
      expect.any(Object),
    );
    expect(mockCreateRun).not.toHaveBeenCalled();
    expect(mockRunAssistant).not.toHaveBeenCalled();
    expect(mockStreamRunManager).not.toHaveBeenCalled();
  });
  it('includes new authorized project membership in the final conversation payload', async () => {
    const projectContext = {
      projectId: '507f1f77bcf86cd799439012',
      contextRevision: 1,
      instructions: '',
      file_ids: [],
    };
    req.body.endpoint = 'azureAssistants';
    req.body.thread_id = undefined;
    mockResolveChatProjectContext.mockResolvedValueOnce(projectContext);
    mockInitThread.mockResolvedValueOnce({ thread_id: 'thread-new' });
    mockCreateRun.mockResolvedValueOnce({ id: 'run-new', status: 'completed' });
    mockRunAssistant.mockResolvedValueOnce({
      run: {
        id: 'run-new',
        status: 'completed',
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      },
      responseMessage: { messageId: 'assistant-message' },
      text: 'Done',
      steps: [],
      messages: [],
    });
    mockGetOpenAIClient.mockResolvedValueOnce({
      openai: {
        _options: { model: 'gpt-4' },
        responseMessage: { messageId: 'response-message' },
        beta: {
          assistants: { retrieve: mockRetrieveAssistant },
          threads: { messages: { list: mockListThreadMessages }, runs: {} },
        },
      },
    });

    await chatController(req, res);

    const finalEvent = mockSendEvent.mock.calls.find(([, event]) => event.final)?.[1];
    expect(finalEvent?.conversation).toEqual(
      expect.objectContaining({ chatProjectId: projectContext.projectId }),
    );
  });

  it('uses persisted membership for an existing conversation in the final payload', async () => {
    const existingConversation = {
      conversationId: 'conversation-existing',
      chatProjectId: '507f1f77bcf86cd799439013',
    };
    req.body.endpoint = 'azureAssistants';
    req.body.conversationId = existingConversation.conversationId;
    req.body.thread_id = 'thread-existing';
    mockGetConvo.mockResolvedValueOnce(existingConversation);
    mockResolveChatProjectContext.mockResolvedValueOnce({
      projectId: '507f1f77bcf86cd799439014',
      contextRevision: 2,
      instructions: '',
      file_ids: [],
    });
    mockInitThread.mockResolvedValueOnce({ thread_id: 'thread-existing' });
    mockCreateRun.mockResolvedValueOnce({ id: 'run-existing', status: 'completed' });
    mockRunAssistant.mockResolvedValueOnce({
      run: {
        id: 'run-existing',
        status: 'completed',
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      },
      responseMessage: { messageId: 'assistant-message' },
      text: 'Done',
      steps: [],
      messages: [],
    });
    mockGetOpenAIClient.mockResolvedValueOnce({
      openai: {
        _options: { model: 'gpt-4' },
        responseMessage: { messageId: 'response-message' },
        beta: {
          assistants: { retrieve: mockRetrieveAssistant },
          threads: { messages: { list: mockListThreadMessages }, runs: {} },
        },
      },
    });

    await chatController(req, res);

    const finalEvent = mockSendEvent.mock.calls.find(([, event]) => event.final)?.[1];
    expect(finalEvent?.conversation).toEqual(
      expect.objectContaining({ chatProjectId: existingConversation.chatProjectId }),
    );
    expect(finalEvent?.conversation?.chatProjectId).not.toBe('507f1f77bcf86cd799439014');
  });
});
