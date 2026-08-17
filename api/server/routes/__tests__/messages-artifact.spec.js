const express = require('express');
const request = require('supertest');
const { RetentionMode } = require('librechat-data-provider');

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

jest.mock('~/models', () => ({
  saveConvo: jest.fn(),
  getMessage: jest.fn(),
  saveMessage: jest.fn(),
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
  configMiddleware: jest.fn((req, res, next) => next()),
  sendValidationResponse: jest.fn(),
  prepareMessageRequestValidation: jest.fn(),
}));

describe('POST /artifact/:messageId', () => {
  let app;
  const { configMiddleware } = require('~/server/middleware');
  const { getMessage, saveConvo, saveMessage } = require('~/models');
  const {
    findAllArtifacts,
    replaceArtifactContent,
  } = require('~/server/services/Artifacts/update');

  const userId = 'user-1';
  const conversationId = 'conversation-1';
  const messageId = 'message-1';
  const interfaceConfig = { retentionMode: RetentionMode.EPHEMERAL };

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
    getMessage.mockResolvedValue({
      messageId,
      conversationId,
      text: 'original artifact',
      content: undefined,
    });
    findAllArtifacts.mockReturnValue([{ source: 'text', partIndex: 0 }]);
    replaceArtifactContent.mockReturnValue('updated artifact');
    saveMessage.mockResolvedValue({ messageId, conversationId, text: 'updated artifact' });
    saveConvo.mockResolvedValue({ conversationId });
  });

  it('applies forced retention to the parent conversation', async () => {
    const response = await request(app)
      .post(`/api/messages/artifact/${messageId}`)
      .send({ index: 0, original: 'original artifact', updated: 'updated artifact' });

    expect(response.status).toBe(200);
    expect(configMiddleware).toHaveBeenCalled();
    expect(saveMessage).toHaveBeenCalledWith(
      expect.objectContaining({ userId, interfaceConfig }),
      expect.objectContaining({ messageId, conversationId, user: userId }),
      { context: 'POST /api/messages/artifact/:messageId' },
    );
    expect(saveConvo).toHaveBeenCalledWith(
      expect.objectContaining({ userId, interfaceConfig }),
      { conversationId },
      { context: 'POST /api/messages/artifact/:messageId', noUpsert: true },
    );
  });

  it('does not touch the conversation when the artifact edit fails to match', async () => {
    replaceArtifactContent.mockReturnValue(null);

    const response = await request(app)
      .post(`/api/messages/artifact/${messageId}`)
      .send({ index: 0, original: 'missing', updated: 'updated artifact' });

    expect(response.status).toBe(400);
    expect(saveMessage).not.toHaveBeenCalled();
    expect(saveConvo).not.toHaveBeenCalled();
  });
});
