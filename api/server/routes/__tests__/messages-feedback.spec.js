const express = require('express');
const request = require('supertest');

jest.mock('@librechat/agents', () => ({
  sleep: jest.fn(),
}));

jest.mock('@librechat/api', () => ({
  unescapeLaTeX: jest.fn((value) => value),
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

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) => next(),
  validateMessageReq: (req, res, next) => next(),
  configMiddleware: (req, res, next) => next(),
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

describe('PUT /:conversationId/:messageId/feedback', () => {
  let app;
  const { sendFeedbackScore } = require('@librechat/api');
  const { updateMessage } = require('~/models');

  beforeAll(() => {
    const messagesRouter = require('../messages');

    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: 'user-1' };
      next();
    });
    app.use('/api/messages', messagesRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    updateMessage.mockImplementation((userId, { messageId, feedback }) =>
      Promise.resolve({
        messageId,
        conversationId: 'conversation-1',
        endpoint: 'openAI',
        langfuseSampled: true,
        langfuseDestinationIds: ['destination-1'],
        feedback,
      }),
    );
  });

  it('persists validated feedback and removes unknown fields', async () => {
    const feedback = {
      rating: 'thumbsDown',
      tag: 'inaccurate',
      text: 'The answer is incorrect',
      ignored: 'value',
    };

    const response = await request(app)
      .put('/api/messages/conversation-1/message-1/feedback')
      .send({ feedback });

    expect(response.status).toBe(200);
    expect(updateMessage).toHaveBeenCalledWith(
      'user-1',
      {
        messageId: 'message-1',
        feedback: {
          rating: 'thumbsDown',
          tag: 'inaccurate',
          text: 'The answer is incorrect',
        },
      },
      { context: 'updateFeedback' },
    );
    expect(sendFeedbackScore).toHaveBeenCalledWith(
      expect.objectContaining({
        sampled: true,
        destinationIds: ['destination-1'],
        feedback: {
          rating: 'thumbsDown',
          tag: 'inaccurate',
          text: 'The answer is incorrect',
        },
      }),
    );
  });

  it.each([
    ['an object tag', { rating: 'thumbsDown', tag: { key: 'inaccurate' } }],
    ['a tag for the opposite rating', { rating: 'thumbsUp', tag: 'inaccurate' }],
    ['oversized text', { rating: 'thumbsDown', tag: 'other', text: 'x'.repeat(1025) }],
  ])('rejects %s before persistence or export', async (_name, feedback) => {
    const response = await request(app)
      .put('/api/messages/conversation-1/message-1/feedback')
      .send({ feedback });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid feedback' });
    expect(updateMessage).not.toHaveBeenCalled();
    expect(sendFeedbackScore).not.toHaveBeenCalled();
  });

  it('preserves clearing feedback', async () => {
    const response = await request(app)
      .put('/api/messages/conversation-1/message-1/feedback')
      .send({});

    expect(response.status).toBe(200);
    expect(updateMessage).toHaveBeenCalledWith(
      'user-1',
      { messageId: 'message-1', feedback: null },
      { context: 'updateFeedback' },
    );
  });
});
