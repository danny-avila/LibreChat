const express = require('express');
const request = require('supertest');

jest.mock('@librechat/agents', () => ({
  sleep: jest.fn(),
}));

jest.mock('@librechat/api', () => ({
  unescapeLaTeX: jest.fn((x) => x),
  countTokens: jest.fn().mockResolvedValue(10),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('librechat-data-provider', () => ({
  ContentTypes: { TEXT: 'text', THINK: 'think' },
}));

jest.mock('~/models', () => ({
  saveConvo: jest.fn(),
  getMessage: jest.fn(),
  saveMessage: jest.fn(),
  getMessages: jest.fn(),
  updateMessage: jest.fn(),
  deleteMessages: jest.fn(),
}));

jest.mock('~/server/services/Artifacts/update', () => ({
  findAllArtifacts: jest.fn(),
  replaceArtifactContent: jest.fn(),
}));

jest.mock('~/server/middleware/requireJwtAuth', () => (req, res, next) => next());

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) => next(),
  validateMessageReq: (req, res, next) => next(),
}));

jest.mock('~/models/Conversation', () => ({
  getConvosQueried: jest.fn(),
}));

jest.mock('~/db/models', () => ({
  Message: {
    findOne: jest.fn(),
    find: jest.fn(),
    meiliSearch: jest.fn(),
  },
}));

describe('Messages DELETE route', () => {
  let app;
  const { deleteMessages } = require('~/models');

  const authenticatedUserId = 'user-owner-123';
  const attackerUserId = 'user-attacker-456';

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
  });

  describe('DELETE /:conversationId/:messageId', () => {
    it('should include user in the deleteMessages filter', async () => {
      deleteMessages.mockResolvedValue({ deletedCount: 1 });

      await request(app).delete('/api/messages/convo-1/msg-1');

      expect(deleteMessages).toHaveBeenCalledTimes(1);
      expect(deleteMessages).toHaveBeenCalledWith({
        messageId: 'msg-1',
        user: authenticatedUserId,
      });
    });

    it('should not delete a message belonging to a different user', async () => {
      deleteMessages.mockResolvedValue({ deletedCount: 0 });

      const victimMessageId = 'victim-msg-999';

      const response = await request(app).delete(`/api/messages/attacker-convo/${victimMessageId}`);

      expect(response.status).toBe(204);
      expect(deleteMessages).toHaveBeenCalledWith({
        messageId: victimMessageId,
        user: authenticatedUserId,
      });
      expect(deleteMessages).not.toHaveBeenCalledWith(
        expect.objectContaining({ user: attackerUserId }),
      );
    });

    it('should return 204 on successful deletion', async () => {
      deleteMessages.mockResolvedValue({ deletedCount: 1 });

      const response = await request(app).delete('/api/messages/convo-1/msg-owned');

      expect(response.status).toBe(204);
      expect(deleteMessages).toHaveBeenCalledWith({
        messageId: 'msg-owned',
        user: authenticatedUserId,
      });
    });

    it('should return 500 when deleteMessages throws', async () => {
      deleteMessages.mockRejectedValue(new Error('DB failure'));

      const response = await request(app).delete('/api/messages/convo-1/msg-1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });
});
