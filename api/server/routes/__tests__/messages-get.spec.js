const { CLIENT_MESSAGE_SELECT } = require('@librechat/data-schemas');
const express = require('express');
const request = require('supertest');

jest.mock('@librechat/agents', () => ({
  sleep: jest.fn(),
}));

jest.mock('@librechat/api', () => ({
  unescapeLaTeX: jest.fn((x) => x),
  countTokens: jest.fn().mockResolvedValue(10),
  sendFeedbackScore: jest.fn().mockResolvedValue(undefined),
  traceIdForMessage: jest.fn((messageId) => `trace-${messageId}`),
  CHILD_THREAD_READ_ONLY_ERROR: 'Child thread is view-only.',
  isSubagentThreadWriteBlocked: jest.fn().mockResolvedValue(false),
  requireFeedbackEnabled: (req, res, next) => next(),
}));

jest.mock('~/server/services/Endpoints/agents/subagentThreadStore', () => ({}));

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
}));

jest.mock('~/models', () => ({
  saveConvo: jest.fn(),
  getMessage: jest.fn(),
  saveMessage: jest.fn(),
  getMessages: jest.fn(),
  getConvoOwnership: jest.fn(),
  updateMessage: jest.fn(),
  deleteMessages: jest.fn(),
  getConvosQueried: jest.fn(),
  searchMessages: jest.fn(),
  getMessagesByCursor: jest.fn(),
}));

jest.mock('~/server/services/Artifacts/update', () => ({
  findAllArtifacts: jest.fn(),
  replaceArtifactContent: jest.fn(),
}));

jest.mock('~/server/middleware/requireJwtAuth', () => (req, res, next) => next());

jest.mock('~/server/middleware', () => {
  const validateMessageReq = jest.fn((req, res, next) => next());
  const canReadActiveJobConversation = jest.fn().mockResolvedValue(false);
  const prepareMessageRequestValidation = jest.fn((req, res, next) => {
    req.messageRequestValidation = {
      conversationId: 'convo-1',
      shouldFetchMessages: true,
      promise: Promise.resolve({ ok: true }),
    };
    next();
  });
  const sendValidationResponse = jest.fn((res, result) => {
    if (result.send) {
      return res.status(result.status).send(result.body);
    }
    return res.status(result.status).json(result.body);
  });

  return {
    requireJwtAuth: (req, res, next) => next(),
    validateMessageReq,
    canReadActiveJobConversation,
    sendValidationResponse,
    prepareMessageRequestValidation,
    configMiddleware: (req, res, next) => next(),
  };
});

jest.mock('~/db/models', () => ({
  Message: {
    findOne: jest.fn(),
    find: jest.fn(),
    meiliSearch: jest.fn(),
  },
}));

describe('message route conversation ownership filters', () => {
  let app;
  const {
    getConvoOwnership,
    getMessages,
    getMessagesByCursor,
    saveConvo,
    saveMessage,
  } = require('~/models');
  const {
    canReadActiveJobConversation,
    prepareMessageRequestValidation,
  } = require('~/server/middleware');

  const authenticatedUserId = 'user-owner-123';

  beforeAll(() => {
    const messagesRouter = require('../messages');

    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: authenticatedUserId };
      next();
    });
    app.use('/api/messages', messagesRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    canReadActiveJobConversation.mockResolvedValue(false);
    prepareMessageRequestValidation.mockImplementation((req, res, next) => {
      req.messageRequestValidation = {
        conversationId: 'convo-1',
        shouldFetchMessages: true,
        promise: Promise.resolve({ ok: true }),
      };
      next();
    });
  });

  it('should pass only mutable conversation fields to saveConvo', async () => {
    const urlConversationId = '11111111-1111-4111-8111-111111111111';
    const bodyConversationId = '22222222-2222-4222-8222-222222222222';
    const savedMessage = {
      _id: 'message-object-id',
      __v: 0,
      messageId: 'message-1',
      conversationId: urlConversationId,
      text: 'hello',
      endpoint: 'openAI',
      model: 'gpt-5',
      iconURL: 'https://example.com/icon.png',
      isTemporary: false,
      files: [{ file_id: 'file-1' }],
      user: authenticatedUserId,
    };

    saveMessage.mockResolvedValue(savedMessage);
    saveConvo.mockResolvedValue({ conversationId: urlConversationId });

    const response = await request(app).post(`/api/messages/${urlConversationId}`).send({
      messageId: savedMessage.messageId,
      conversationId: bodyConversationId,
      text: savedMessage.text,
      endpoint: savedMessage.endpoint,
      model: savedMessage.model,
      iconURL: savedMessage.iconURL,
    });

    expect(response.status).toBe(201);
    expect(saveMessage).toHaveBeenCalledWith(
      expect.objectContaining({ userId: authenticatedUserId }),
      expect.objectContaining({
        messageId: savedMessage.messageId,
        conversationId: urlConversationId,
        text: savedMessage.text,
        user: authenticatedUserId,
      }),
      { context: 'POST /api/messages/:conversationId' },
    );
    expect(saveMessage.mock.calls[0][1].conversationId).not.toBe(bodyConversationId);
    expect(saveConvo).toHaveBeenCalledWith(
      expect.objectContaining({ userId: authenticatedUserId }),
      {
        conversationId: urlConversationId,
        endpoint: savedMessage.endpoint,
        model: savedMessage.model,
        iconURL: savedMessage.iconURL,
      },
      { context: 'POST /api/messages/:conversationId' },
    );
  });

  it('should filter conversation message reads by authenticated user', async () => {
    getMessages.mockResolvedValue([{ messageId: 'message-1', conversationId: 'convo-1' }]);

    const response = await request(app).get('/api/messages/convo-1');

    expect(response.status).toBe(200);
    expect(getMessages).toHaveBeenCalledWith(
      { conversationId: 'convo-1', user: authenticatedUserId },
      CLIENT_MESSAGE_SELECT,
    );
  });

  it('returns indistinguishable not-found responses for child and missing query reads', async () => {
    getConvoOwnership.mockResolvedValueOnce({
      user: authenticatedUserId,
      subagentThread: { parentConversationId: 'parent-convo' },
    });

    const childResponse = await request(app).get(
      '/api/messages?conversationId=child-convo&messageId=child-message',
    );
    getConvoOwnership.mockResolvedValueOnce(null);
    const missingResponse = await request(app).get(
      '/api/messages?conversationId=missing-convo&messageId=missing-message',
    );

    expect(childResponse.status).toBe(404);
    expect(childResponse.body).toEqual({ error: 'Conversation not found' });
    expect(childResponse.status).toBe(missingResponse.status);
    expect(childResponse.body).toEqual(missingResponse.body);
    expect(getMessages).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      name: 'single-message',
      path: '/api/messages?conversationId=convo-1&messageId=message-1',
      readMock: getMessages,
      readResult: [{ messageId: 'message-1', conversationId: 'convo-1' }],
    },
    {
      name: 'cursor',
      path: '/api/messages?conversationId=convo-1',
      readMock: getMessagesByCursor,
      readResult: { messages: [], nextCursor: null },
    },
  ])(
    'starts the $name query read before ownership validation resolves',
    async ({ path, readMock, readResult }) => {
      const events = [];
      let resolveOwnership;
      const ownershipPromise = new Promise((resolve) => {
        resolveOwnership = resolve;
      });
      getConvoOwnership.mockImplementationOnce(() => {
        events.push('ownership-started');
        return ownershipPromise;
      });

      let resolveReadStarted;
      const readStartedPromise = new Promise((resolve) => {
        resolveReadStarted = resolve;
      });
      readMock.mockImplementationOnce(() => {
        events.push('messages-started');
        resolveReadStarted();
        return Promise.resolve(readResult);
      });

      const responsePromise = new Promise((resolve, reject) => {
        request(app)
          .get(path)
          .end((error, response) => (error ? reject(error) : resolve(response)));
      });

      await Promise.race([readStartedPromise, new Promise((resolve) => setTimeout(resolve, 100))]);
      const eventsBeforeValidation = [...events];
      resolveOwnership({ user: authenticatedUserId });
      const response = await responsePromise;

      expect(eventsBeforeValidation).toEqual(['ownership-started', 'messages-started']);
      expect(response.status).toBe(200);
    },
  );

  it('allows an ordinary owned conversation query read', async () => {
    getConvoOwnership.mockResolvedValue({ user: authenticatedUserId });
    getMessages.mockResolvedValue([{ messageId: 'message-1', conversationId: 'convo-1' }]);

    const response = await request(app).get(
      '/api/messages?conversationId=convo-1&messageId=message-1',
    );

    expect(response.status).toBe(200);
    expect(response.body.messages).toEqual([{ messageId: 'message-1', conversationId: 'convo-1' }]);
  });

  it('allows an owner-scoped active generation before its conversation row exists', async () => {
    getConvoOwnership.mockResolvedValue(null);
    canReadActiveJobConversation.mockResolvedValue(true);
    getMessagesByCursor.mockResolvedValue({
      messages: [{ messageId: 'prompt-1', conversationId: 'active-convo' }],
      nextCursor: null,
    });

    const response = await request(app).get('/api/messages?conversationId=active-convo');

    expect(response.status).toBe(200);
    expect(response.body.messages).toEqual([
      { messageId: 'prompt-1', conversationId: 'active-convo' },
    ]);
    expect(canReadActiveJobConversation).toHaveBeenCalledWith(
      expect.objectContaining({ user: { id: authenticatedUserId } }),
      'active-convo',
    );
  });

  it('should start conversation message reads before validation resolves', async () => {
    const events = [];
    let resolveValidation;
    const validationPromise = new Promise((resolve) => {
      resolveValidation = resolve;
    });
    prepareMessageRequestValidation.mockImplementationOnce((req, res, next) => {
      req.messageRequestValidation = {
        conversationId: 'convo-1',
        shouldFetchMessages: true,
        promise: validationPromise,
      };
      next();
    });
    let resolveMessagesStarted;
    const messagesStartedPromise = new Promise((resolve) => {
      resolveMessagesStarted = resolve;
    });
    getMessages.mockImplementation(() => {
      events.push('messages-started');
      resolveMessagesStarted();
      return Promise.resolve([{ messageId: 'message-1', conversationId: 'convo-1' }]);
    });

    const responsePromise = new Promise((resolve, reject) => {
      request(app)
        .get('/api/messages/convo-1')
        .end((error, response) => (error ? reject(error) : resolve(response)));
    });
    await Promise.race([
      messagesStartedPromise,
      new Promise((resolve) => setTimeout(resolve, 100)),
    ]);

    const eventsBeforeValidation = [...events];
    resolveValidation({ ok: true });
    const response = await responsePromise;

    expect(eventsBeforeValidation).toEqual(['messages-started']);
    expect(getMessages).toHaveBeenCalledWith(
      { conversationId: 'convo-1', user: authenticatedUserId },
      CLIENT_MESSAGE_SELECT,
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{ messageId: 'message-1', conversationId: 'convo-1' }]);
  });

  it('should not return fetched messages when conversation validation fails', async () => {
    prepareMessageRequestValidation.mockImplementationOnce((req, res, next) => {
      req.messageRequestValidation = {
        conversationId: 'convo-1',
        shouldFetchMessages: true,
        promise: Promise.resolve({
          ok: false,
          status: 404,
          body: { error: 'Conversation not found' },
        }),
      };
      next();
    });
    getMessages.mockResolvedValue([{ messageId: 'secret-message', conversationId: 'convo-1' }]);

    const response = await request(app).get('/api/messages/convo-1');

    expect(getMessages).toHaveBeenCalledWith(
      { conversationId: 'convo-1', user: authenticatedUserId },
      CLIENT_MESSAGE_SELECT,
    );
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Conversation not found' });
  });

  it('should filter single message reads by authenticated user', async () => {
    getMessages.mockResolvedValue([{ messageId: 'message-1', conversationId: 'convo-1' }]);

    const response = await request(app).get('/api/messages/convo-1/message-1');

    expect(response.status).toBe(200);
    expect(getMessages).toHaveBeenCalledWith(
      { conversationId: 'convo-1', messageId: 'message-1', user: authenticatedUserId },
      CLIENT_MESSAGE_SELECT,
    );
  });

  describe('search pagination', () => {
    const { searchMessages, getConvosQueried } = require('~/models');

    const primeSearch = ({ hits, totalPages }) => {
      searchMessages.mockResolvedValue({ hits, totalPages });
      const convoMap = {};
      hits.forEach((h) => {
        convoMap[h.conversationId] = { title: 'T', model: 'gpt' };
      });
      getConvosQueried.mockResolvedValue({ convoMap, conversations: [], nextCursor: null });
      getMessages.mockResolvedValue(
        hits.map((h) => ({ ...h, isCreatedByUser: false, endpoint: 'openAI' })),
      );
    };

    it('requests Meili in page mode (page + hitsPerPage) and defaults to page 1', async () => {
      primeSearch({ hits: [{ messageId: 'm1', conversationId: 'c1' }], totalPages: 3 });

      const response = await request(app).get('/api/messages?search=beacon');

      expect(response.status).toBe(200);
      expect(searchMessages).toHaveBeenCalledWith(
        'beacon',
        expect.objectContaining({ page: 1, hitsPerPage: 25 }),
        true,
      );
    });

    it('returns a real nextCursor when more pages remain', async () => {
      primeSearch({ hits: [{ messageId: 'm1', conversationId: 'c1' }], totalPages: 3 });

      const response = await request(app).get('/api/messages?search=beacon');

      expect(response.body.nextCursor).toBe('2');
      expect(response.body.messages).toHaveLength(1);
    });

    it('advances the page from the incoming cursor', async () => {
      primeSearch({ hits: [{ messageId: 'm2', conversationId: 'c1' }], totalPages: 3 });

      const response = await request(app).get('/api/messages?search=beacon&cursor=2');

      expect(searchMessages).toHaveBeenCalledWith(
        'beacon',
        expect.objectContaining({ page: 2 }),
        true,
      );
      expect(response.body.nextCursor).toBe('3');
    });

    it('returns nextCursor null on the last page', async () => {
      primeSearch({ hits: [{ messageId: 'm1', conversationId: 'c1' }], totalPages: 1 });

      const response = await request(app).get('/api/messages?search=beacon');

      expect(response.body.nextCursor).toBeNull();
    });

    it('never passes the numeric page cursor to getConvosQueried as a date', async () => {
      primeSearch({ hits: [{ messageId: 'm1', conversationId: 'c1' }], totalPages: 3 });

      await request(app).get('/api/messages?search=beacon&cursor=2');

      // 3rd arg (cursor) must be null, not "2" — getConvosQueried treats it as a date.
      expect(getConvosQueried).toHaveBeenCalledWith(
        authenticatedUserId,
        expect.any(Array),
        null,
        1,
      );
    });

    it('skips a page whose hits are all filtered out and returns the next page with rows', async () => {
      // Page 1's only hit belongs to a deleted/inaccessible conversation, so it
      // filters to zero rows; returning that empty page would strand the client.
      searchMessages
        .mockResolvedValueOnce({
          hits: [{ messageId: 'm1', conversationId: 'gone' }],
          totalPages: 3,
        })
        .mockResolvedValueOnce({
          hits: [{ messageId: 'm2', conversationId: 'c2' }],
          totalPages: 3,
        });
      getConvosQueried
        .mockResolvedValueOnce({ convoMap: {}, conversations: [], nextCursor: null })
        .mockResolvedValueOnce({
          convoMap: { c2: { title: 'T', model: 'gpt' } },
          conversations: [],
          nextCursor: null,
        });
      getMessages.mockResolvedValue([
        { messageId: 'm2', isCreatedByUser: false, endpoint: 'openAI' },
      ]);

      const response = await request(app).get('/api/messages?search=beacon');

      expect(searchMessages).toHaveBeenCalledTimes(2);
      expect(searchMessages).toHaveBeenNthCalledWith(
        2,
        'beacon',
        expect.objectContaining({ page: 2 }),
        true,
      );
      expect(response.body.messages).toHaveLength(1);
      expect(response.body.messages[0].messageId).toBe('m2');
      expect(response.body.nextCursor).toBe('3');
    });

    it('keeps a cursor when the scan budget is exhausted so later matches stay reachable', async () => {
      // Every scanned page filters out entirely while Meili keeps reporting more.
      searchMessages.mockResolvedValue({
        hits: [{ messageId: 'm', conversationId: 'gone' }],
        totalPages: 500,
      });
      getConvosQueried.mockResolvedValue({ convoMap: {}, conversations: [], nextCursor: null });
      getMessages.mockResolvedValue([]);

      const response = await request(app).get('/api/messages?search=beacon');

      expect(searchMessages).toHaveBeenCalledTimes(25); // MAX_EMPTY_PAGE_SCANS
      expect(response.body.messages).toEqual([]);
      // Nulling here would mark the search exhausted and silently drop the
      // accessible matches that still sit past the filtered run.
      expect(response.body.nextCursor).toBe('26');
    });

    it('starts the convo and message hydration reads in parallel', async () => {
      let convosResolved = false;
      let messagesStartedBeforeConvos = false;
      searchMessages.mockResolvedValue({
        hits: [{ messageId: 'm1', conversationId: 'c1' }],
        totalPages: 1,
      });
      getConvosQueried.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => {
              convosResolved = true;
              resolve({
                convoMap: { c1: { title: 'T', model: 'gpt' } },
                conversations: [],
                nextCursor: null,
              });
            }, 20),
          ),
      );
      getMessages.mockImplementation(() => {
        // If this runs before convoMap resolves, the two reads overlap.
        messagesStartedBeforeConvos = !convosResolved;
        return Promise.resolve([{ messageId: 'm1', isCreatedByUser: false, endpoint: 'openAI' }]);
      });

      const response = await request(app).get('/api/messages?search=beacon');

      expect(messagesStartedBeforeConvos).toBe(true);
      // Ids come off the raw Meili hits, not the post-filter list.
      expect(getMessages).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: { $in: ['m1'] } }),
      );
      expect(response.body.messages).toHaveLength(1);
    });

    it('clamps an oversized pageSize before asking Meili for a raw page', async () => {
      primeSearch({ hits: [{ messageId: 'm1', conversationId: 'c1' }], totalPages: 1 });

      await request(app).get('/api/messages?search=beacon&pageSize=100000');

      expect(searchMessages).toHaveBeenCalledWith(
        'beacon',
        expect.objectContaining({ hitsPerPage: 100 }),
        true,
      );
    });

    it('leaves conversation paging unclamped — the Meili cap is search-only', async () => {
      const { getMessagesByCursor } = require('~/models');
      getMessagesByCursor.mockResolvedValue({ messages: [], nextCursor: null });

      await request(app).get('/api/messages?conversationId=convo-1&pageSize=500');

      expect(getMessagesByCursor).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'convo-1' }),
        expect.objectContaining({ limit: 500 }),
      );
      expect(searchMessages).not.toHaveBeenCalled();
    });

    it('does not scan past the last page when the final page filters out entirely', async () => {
      searchMessages.mockResolvedValue({
        hits: [{ messageId: 'm1', conversationId: 'gone' }],
        totalPages: 1,
      });
      getConvosQueried.mockResolvedValue({ convoMap: {}, conversations: [], nextCursor: null });
      getMessages.mockResolvedValue([]);

      const response = await request(app).get('/api/messages?search=beacon');

      expect(searchMessages).toHaveBeenCalledTimes(1);
      expect(response.body.messages).toEqual([]);
      expect(response.body.nextCursor).toBeNull();
    });
  });
});
