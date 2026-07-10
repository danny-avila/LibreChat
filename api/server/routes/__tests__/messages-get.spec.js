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
}));

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
  const { getMessages, saveConvo, saveMessage } = require('~/models');
  const { prepareMessageRequestValidation } = require('~/server/middleware');

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
    prepareMessageRequestValidation.mockImplementation((req, res, next) => {
      req.messageRequestValidation = {
        conversationId: 'convo-1',
        shouldFetchMessages: true,
        promise: Promise.resolve({ ok: true }),
      };
      next();
    });
  });

  it('should save POST messages with the validated URL conversationId', async () => {
    const urlConversationId = '11111111-1111-4111-8111-111111111111';
    const bodyConversationId = '22222222-2222-4222-8222-222222222222';
    const savedMessage = {
      messageId: 'message-1',
      conversationId: urlConversationId,
      text: 'hello',
      user: authenticatedUserId,
    };

    saveMessage.mockResolvedValue(savedMessage);
    saveConvo.mockResolvedValue({ conversationId: urlConversationId });

    const response = await request(app).post(`/api/messages/${urlConversationId}`).send({
      messageId: savedMessage.messageId,
      conversationId: bodyConversationId,
      text: savedMessage.text,
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
      savedMessage,
      { context: 'POST /api/messages/:conversationId' },
    );
  });

  it('should filter conversation message reads by authenticated user', async () => {
    getMessages.mockResolvedValue([{ messageId: 'message-1', conversationId: 'convo-1' }]);

    const response = await request(app).get('/api/messages/convo-1');

    expect(response.status).toBe(200);
    expect(getMessages).toHaveBeenCalledWith(
      { conversationId: 'convo-1', user: authenticatedUserId },
      '-_id -__v -user',
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
      '-_id -__v -user',
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
      '-_id -__v -user',
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
      '-_id -__v -user',
    );
  });
});
