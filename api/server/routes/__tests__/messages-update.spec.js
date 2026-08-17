const express = require('express');
const request = require('supertest');
const { ContentTypes, RetentionMode } = require('librechat-data-provider');

jest.mock('@librechat/agents', () => ({
  sleep: jest.fn(),
}));

jest.mock('@librechat/api', () => ({
  unescapeLaTeX: jest.fn((value) => value),
  countTokens: jest.fn().mockResolvedValue(10),
  sendFeedbackScore: jest.fn().mockResolvedValue(undefined),
  traceIdForMessage: jest.fn((messageId) => `trace-${messageId}`),
  mergeQuotedTextForCount: jest.fn((text) => text),
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

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) => next(),
  validateMessageReq: (req, res, next) => next(),
  configMiddleware: jest.fn((req, res, next) => next()),
  sendValidationResponse: jest.fn(),
  prepareMessageRequestValidation: jest.fn(),
}));

jest.mock('~/db/models', () => ({
  Message: {
    findOne: jest.fn(),
    find: jest.fn(),
    meiliSearch: jest.fn(),
  },
}));

describe('PUT /:conversationId/:messageId', () => {
  let app;
  const { configMiddleware } = require('~/server/middleware');
  const { getMessages, saveConvo, saveMessage, updateMessage } = require('~/models');
  const { countTokens, mergeQuotedTextForCount } = require('@librechat/api');

  const userId = 'user-1';
  const conversationId = 'conversation-1';
  const messageId = 'message-1';
  const interfaceConfig = { retentionMode: RetentionMode.EPHEMERAL };
  const expectedReqCtx = {
    userId,
    interfaceConfig,
  };

  beforeAll(() => {
    const messagesRouter = require('../messages');

    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: userId };
      req.config = { interfaceConfig };
      next();
    });
    app.use('/api/messages', messagesRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    configMiddleware.mockImplementation((req, res, next) => next());
    updateMessage.mockImplementation((authenticatedUserId, payload) =>
      Promise.resolve({
        messageId: payload.messageId,
        conversationId,
        text: payload.text,
        content: payload.content,
        tokenCount: payload.tokenCount,
      }),
    );
    saveMessage.mockResolvedValue({ messageId, conversationId });
    saveConvo.mockResolvedValue({ conversationId });
  });

  it('applies forced retention when editing message text', async () => {
    getMessages.mockResolvedValue([{ quotes: [], isCreatedByUser: true }]);

    const response = await request(app)
      .put(`/api/messages/${conversationId}/${messageId}`)
      .send({ text: 'edited text', model: 'gpt-5' });

    expect(response.status).toBe(200);
    expect(configMiddleware).toHaveBeenCalled();
    expect(mergeQuotedTextForCount).toHaveBeenCalledWith('edited text', [], true);
    expect(countTokens).toHaveBeenCalledWith('edited text', 'gpt-5');
    expect(updateMessage).toHaveBeenCalledWith(userId, {
      messageId,
      text: 'edited text',
      tokenCount: 10,
    });
    expect(saveMessage).toHaveBeenCalledWith(
      expect.objectContaining(expectedReqCtx),
      {
        messageId,
        conversationId,
        user: userId,
      },
      { context: 'PUT /api/messages/:conversationId/:messageId' },
    );
    expect(saveConvo).toHaveBeenCalledWith(
      expect.objectContaining(expectedReqCtx),
      { conversationId },
      { context: 'PUT /api/messages/:conversationId/:messageId', noUpsert: true },
    );
  });

  it('applies forced retention when editing a text content part', async () => {
    getMessages.mockResolvedValue([
      {
        content: [{ type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'old text' }],
        tokenCount: 8,
      },
    ]);

    const response = await request(app)
      .put(`/api/messages/${conversationId}/${messageId}`)
      .send({ text: 'new text', index: 0, model: 'gpt-5' });

    expect(response.status).toBe(200);
    expect(configMiddleware).toHaveBeenCalled();
    expect(updateMessage).toHaveBeenCalledWith(userId, {
      messageId,
      content: [{ type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'new text' }],
      tokenCount: 10,
    });
    expect(saveMessage).toHaveBeenCalledWith(
      expect.objectContaining(expectedReqCtx),
      {
        messageId,
        conversationId,
        user: userId,
      },
      { context: 'PUT /api/messages/:conversationId/:messageId' },
    );
    expect(saveConvo).toHaveBeenCalledWith(
      expect.objectContaining(expectedReqCtx),
      { conversationId },
      { context: 'PUT /api/messages/:conversationId/:messageId', noUpsert: true },
    );
  });

  it('rejects a message that belongs to another conversation', async () => {
    getMessages.mockResolvedValue([]);

    const response = await request(app)
      .put(`/api/messages/${conversationId}/${messageId}`)
      .send({ text: 'edited text', model: 'gpt-5' });

    expect(response.status).toBe(404);
    expect(updateMessage).not.toHaveBeenCalled();
    expect(saveMessage).not.toHaveBeenCalled();
    expect(saveConvo).not.toHaveBeenCalled();
  });

  it('does not apply retention when the message update fails', async () => {
    getMessages.mockResolvedValue([{ quotes: [], isCreatedByUser: false }]);
    updateMessage.mockRejectedValue(new Error('Message not found or user not authorized.'));

    const response = await request(app)
      .put(`/api/messages/${conversationId}/${messageId}`)
      .send({ text: 'edited text' });

    expect(response.status).toBe(500);
    expect(saveMessage).not.toHaveBeenCalled();
    expect(saveConvo).not.toHaveBeenCalled();
  });
});
