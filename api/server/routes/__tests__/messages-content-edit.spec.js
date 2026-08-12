const express = require('express');
const request = require('supertest');
const { ContentTypes } = require('librechat-data-provider');

jest.mock('@librechat/agents', () => ({
  sleep: jest.fn(),
}));

jest.mock('@librechat/api', () => ({
  unescapeLaTeX: jest.fn((value) => value),
  countTokens: jest.fn().mockResolvedValue(2),
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

jest.mock('~/models', () => ({
  getMessages: jest.fn(),
  updateMessage: jest.fn(),
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

describe('PUT /:conversationId/:messageId content edit', () => {
  let app;
  const { getMessages, updateMessage } = require('~/models');

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
    updateMessage.mockResolvedValue({ messageId: 'message-1' });
  });

  it('preserves content-part metadata when editing its text', async () => {
    getMessages.mockResolvedValue([
      {
        tokenCount: 10,
        content: [
          {
            type: ContentTypes.TEXT,
            text: 'Original response',
            phase: 'commentary',
            agentId: 'agent-1',
            tool_call_ids: ['tool-1'],
          },
        ],
      },
    ]);

    const response = await request(app)
      .put('/api/messages/conversation-1/message-1')
      .send({ index: 0, text: 'Edited response', model: 'gpt-5' });

    expect(response.status).toBe(200);
    expect(updateMessage).toHaveBeenCalledWith('user-1', {
      messageId: 'message-1',
      tokenCount: 10,
      content: [
        {
          type: ContentTypes.TEXT,
          text: 'Edited response',
          phase: 'commentary',
          agentId: 'agent-1',
          tool_call_ids: ['tool-1'],
        },
      ],
    });
  });
});
