const express = require('express');
const request = require('supertest');

jest.mock('@librechat/agents', () => ({
  sleep: jest.fn(),
}));

jest.mock('@librechat/api', () => ({
  isEnabled: jest.fn(),
  createAxiosInstance: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  })),
  logAxiosError: jest.fn(),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  createModels: jest.fn(() => ({
    User: {},
    Conversation: {},
    Message: {},
    SharedLink: {},
  })),
}));

jest.mock('~/models', () => ({
  getConvosByCursor: jest.fn(),
  getConvo: jest.fn(),
  deleteConvos: jest.fn(),
  saveConvo: jest.fn(),
  deleteAllSharedLinks: jest.fn(),
  deleteConvoSharedLink: jest.fn(),
  deleteToolCalls: jest.fn(),
}));

jest.mock('~/server/middleware/requireJwtAuth', () => (req, res, next) => next());

jest.mock('~/server/middleware', () => ({
  createImportLimiters: jest.fn(() => ({
    importIpLimiter: (req, res, next) => next(),
    importUserLimiter: (req, res, next) => next(),
  })),
  createForkLimiters: jest.fn(() => ({
    forkIpLimiter: (req, res, next) => next(),
    forkUserLimiter: (req, res, next) => next(),
  })),
  configMiddleware: (req, res, next) => next(),
  validateConvoAccess: (req, res, next) => next(),
}));

jest.mock('~/server/utils/import/fork', () => ({
  forkConversation: jest.fn(),
  duplicateConversation: jest.fn(),
}));

jest.mock('~/server/utils/import', () => ({
  importConversations: jest.fn(),
}));

jest.mock('~/cache/getLogStores', () => jest.fn());

jest.mock('~/server/routes/files/multer', () => ({
  storage: {},
  importFileFilter: jest.fn(),
}));

jest.mock('multer', () => {
  return jest.fn(() => ({
    single: jest.fn(() => (req, res, next) => {
      req.file = { path: '/tmp/test-file.json' };
      next();
    }),
  }));
});

jest.mock('librechat-data-provider', () => ({
  CacheKeys: {
    GEN_TITLE: 'GEN_TITLE',
  },
  EModelEndpoint: {
    azureAssistants: 'azureAssistants',
    assistants: 'assistants',
  },
}));

jest.mock('~/server/services/Endpoints/azureAssistants', () => ({
  initializeClient: jest.fn(),
}));

jest.mock('~/server/services/Endpoints/assistants', () => ({
  initializeClient: jest.fn(),
}));

describe('Convos Routes', () => {
  let app;
  let convosRouter;
  const {
    deleteAllSharedLinks,
    deleteConvoSharedLink,
    deleteToolCalls,
    deleteConvos,
    saveConvo,
  } = require('~/models');

  beforeAll(() => {
    convosRouter = require('../convos');

    app = express();
    app.use(express.json());

    /** Mock authenticated user */
    app.use((req, res, next) => {
      req.user = { id: 'test-user-123' };
      next();
    });

    app.use('/api/convos', convosRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('DELETE /all', () => {
    it('should delete all conversations, tool calls, and shared links for a user', async () => {
      const mockDbResponse = {
        deletedCount: 5,
        message: 'All conversations deleted successfully',
      };

      deleteConvos.mockResolvedValue(mockDbResponse);
      deleteToolCalls.mockResolvedValue({ deletedCount: 10 });
      deleteAllSharedLinks.mockResolvedValue({
        message: 'All shared links deleted successfully',
        deletedCount: 3,
      });

      const response = await request(app).delete('/api/convos/all');

      expect(response.status).toBe(201);
      expect(response.body).toEqual(mockDbResponse);

      /** Verify deleteConvos was called with correct userId */
      expect(deleteConvos).toHaveBeenCalledWith('test-user-123', {});
      expect(deleteConvos).toHaveBeenCalledTimes(1);

      /** Verify deleteToolCalls was called with correct userId */
      expect(deleteToolCalls).toHaveBeenCalledWith('test-user-123');
      expect(deleteToolCalls).toHaveBeenCalledTimes(1);

      /** Verify deleteAllSharedLinks was called with correct userId */
      expect(deleteAllSharedLinks).toHaveBeenCalledWith('test-user-123');
      expect(deleteAllSharedLinks).toHaveBeenCalledTimes(1);
    });

    it('should call deleteAllSharedLinks even when no conversations exist', async () => {
      const mockDbResponse = {
        deletedCount: 0,
        message: 'No conversations to delete',
      };

      deleteConvos.mockResolvedValue(mockDbResponse);
      deleteToolCalls.mockResolvedValue({ deletedCount: 0 });
      deleteAllSharedLinks.mockResolvedValue({
        message: 'All shared links deleted successfully',
        deletedCount: 0,
      });

      const response = await request(app).delete('/api/convos/all');

      expect(response.status).toBe(201);
      expect(deleteAllSharedLinks).toHaveBeenCalledWith('test-user-123');
    });

    it('should return 500 if deleteConvos fails', async () => {
      const errorMessage = 'Database connection error';
      deleteConvos.mockRejectedValue(new Error(errorMessage));

      const response = await request(app).delete('/api/convos/all');

      expect(response.status).toBe(500);
      expect(response.text).toBe('Error clearing conversations');

      /** Verify error was logged */
      const { logger } = require('@librechat/data-schemas');
      expect(logger.error).toHaveBeenCalledWith('Error clearing conversations', expect.any(Error));
    });

    it('should return 500 if deleteToolCalls fails', async () => {
      deleteConvos.mockResolvedValue({ deletedCount: 5 });
      deleteToolCalls.mockRejectedValue(new Error('Tool calls deletion failed'));

      const response = await request(app).delete('/api/convos/all');

      expect(response.status).toBe(500);
      expect(response.text).toBe('Error clearing conversations');
    });

    it('should return 500 if deleteAllSharedLinks fails', async () => {
      deleteConvos.mockResolvedValue({ deletedCount: 5 });
      deleteToolCalls.mockResolvedValue({ deletedCount: 10 });
      deleteAllSharedLinks.mockRejectedValue(new Error('Shared links deletion failed'));

      const response = await request(app).delete('/api/convos/all');

      expect(response.status).toBe(500);
      expect(response.text).toBe('Error clearing conversations');
    });

    it('should handle multiple users independently', async () => {
      /** First user */
      deleteConvos.mockResolvedValue({ deletedCount: 3 });
      deleteToolCalls.mockResolvedValue({ deletedCount: 5 });
      deleteAllSharedLinks.mockResolvedValue({ deletedCount: 2 });

      let response = await request(app).delete('/api/convos/all');

      expect(response.status).toBe(201);
      expect(deleteAllSharedLinks).toHaveBeenCalledWith('test-user-123');

      jest.clearAllMocks();

      /** Second user (simulate different user by modifying middleware) */
      const app2 = express();
      app2.use(express.json());
      app2.use((req, res, next) => {
        req.user = { id: 'test-user-456' };
        next();
      });
      app2.use('/api/convos', require('../convos'));

      deleteConvos.mockResolvedValue({ deletedCount: 7 });
      deleteToolCalls.mockResolvedValue({ deletedCount: 12 });
      deleteAllSharedLinks.mockResolvedValue({ deletedCount: 4 });

      response = await request(app2).delete('/api/convos/all');

      expect(response.status).toBe(201);
      expect(deleteAllSharedLinks).toHaveBeenCalledWith('test-user-456');
    });

    it('should execute deletions in correct sequence', async () => {
      const executionOrder = [];

      deleteConvos.mockImplementation(() => {
        executionOrder.push('deleteConvos');
        return Promise.resolve({ deletedCount: 5 });
      });

      deleteToolCalls.mockImplementation(() => {
        executionOrder.push('deleteToolCalls');
        return Promise.resolve({ deletedCount: 10 });
      });

      deleteAllSharedLinks.mockImplementation(() => {
        executionOrder.push('deleteAllSharedLinks');
        return Promise.resolve({ deletedCount: 3 });
      });

      await request(app).delete('/api/convos/all');

      /** Verify all three functions were called */
      expect(executionOrder).toEqual(['deleteConvos', 'deleteToolCalls', 'deleteAllSharedLinks']);
    });

    it('should maintain data integrity by cleaning up shared links when conversations are deleted', async () => {
      /** This test ensures that orphaned shared links are prevented */
      const mockConvosDeleted = { deletedCount: 10 };
      const mockToolCallsDeleted = { deletedCount: 15 };
      const mockSharedLinksDeleted = {
        message: 'All shared links deleted successfully',
        deletedCount: 8,
      };

      deleteConvos.mockResolvedValue(mockConvosDeleted);
      deleteToolCalls.mockResolvedValue(mockToolCallsDeleted);
      deleteAllSharedLinks.mockResolvedValue(mockSharedLinksDeleted);

      const response = await request(app).delete('/api/convos/all');

      expect(response.status).toBe(201);

      /** Verify that shared links cleanup was called for the same user */
      expect(deleteAllSharedLinks).toHaveBeenCalledWith('test-user-123');

      /** Verify no shared links remain for deleted conversations */
      expect(deleteAllSharedLinks).toHaveBeenCalledAfter(deleteConvos);
    });
  });

  describe('DELETE /', () => {
    it('should delete a single conversation, tool calls, and associated shared links', async () => {
      const mockConversationId = 'conv-123';
      const mockDbResponse = {
        deletedCount: 1,
        message: 'Conversation deleted successfully',
      };

      deleteConvos.mockResolvedValue(mockDbResponse);
      deleteToolCalls.mockResolvedValue({ deletedCount: 3 });
      deleteConvoSharedLink.mockResolvedValue({
        message: 'Shared links deleted successfully',
        deletedCount: 1,
      });

      const response = await request(app)
        .delete('/api/convos')
        .send({
          arg: {
            conversationId: mockConversationId,
          },
        });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(mockDbResponse);

      /** Verify deleteConvos was called with correct parameters */
      expect(deleteConvos).toHaveBeenCalledWith('test-user-123', {
        conversationId: mockConversationId,
      });

      /** Verify deleteToolCalls was called */
      expect(deleteToolCalls).toHaveBeenCalledWith('test-user-123', mockConversationId);

      /** Verify deleteConvoSharedLink was called */
      expect(deleteConvoSharedLink).toHaveBeenCalledWith('test-user-123', mockConversationId);
    });

    it('should not call deleteConvoSharedLink when no conversationId provided', async () => {
      deleteConvos.mockResolvedValue({ deletedCount: 0 });
      deleteToolCalls.mockResolvedValue({ deletedCount: 0 });

      const response = await request(app)
        .delete('/api/convos')
        .send({
          arg: {
            source: 'button',
          },
        });

      expect(response.status).toBe(200);
      expect(deleteConvoSharedLink).not.toHaveBeenCalled();
    });

    it('should handle deletion of conversation without shared links', async () => {
      const mockConversationId = 'conv-no-shares';

      deleteConvos.mockResolvedValue({ deletedCount: 1 });
      deleteToolCalls.mockResolvedValue({ deletedCount: 0 });
      deleteConvoSharedLink.mockResolvedValue({
        message: 'Shared links deleted successfully',
        deletedCount: 0,
      });

      const response = await request(app)
        .delete('/api/convos')
        .send({
          arg: {
            conversationId: mockConversationId,
          },
        });

      expect(response.status).toBe(201);
      expect(deleteConvoSharedLink).toHaveBeenCalledWith('test-user-123', mockConversationId);
    });

    it('should return 400 when no parameters provided', async () => {
      const response = await request(app).delete('/api/convos').send({
        arg: {},
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'no parameters provided' });
      expect(deleteConvos).not.toHaveBeenCalled();
      expect(deleteConvoSharedLink).not.toHaveBeenCalled();
    });

    it('should return 400 when request body is empty (DoS prevention)', async () => {
      const response = await request(app).delete('/api/convos').send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'no parameters provided' });
      expect(deleteConvos).not.toHaveBeenCalled();
    });

    it('should return 400 when arg is null (DoS prevention)', async () => {
      const response = await request(app).delete('/api/convos').send({ arg: null });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'no parameters provided' });
      expect(deleteConvos).not.toHaveBeenCalled();
    });

    it('should return 400 when arg is undefined (DoS prevention)', async () => {
      const response = await request(app).delete('/api/convos').send({ arg: undefined });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'no parameters provided' });
      expect(deleteConvos).not.toHaveBeenCalled();
    });

    it('should return 400 when request body is null (DoS prevention)', async () => {
      const response = await request(app)
        .delete('/api/convos')
        .set('Content-Type', 'application/json')
        .send('null');

      expect(response.status).toBe(400);
      expect(deleteConvos).not.toHaveBeenCalled();
    });

    it('should return 500 if deleteConvoSharedLink fails', async () => {
      const mockConversationId = 'conv-error';

      deleteConvos.mockResolvedValue({ deletedCount: 1 });
      deleteToolCalls.mockResolvedValue({ deletedCount: 2 });
      deleteConvoSharedLink.mockRejectedValue(new Error('Failed to delete shared links'));

      const response = await request(app)
        .delete('/api/convos')
        .send({
          arg: {
            conversationId: mockConversationId,
          },
        });

      expect(response.status).toBe(500);
      expect(response.text).toBe('Error clearing conversations');
    });

    it('should execute deletions in correct sequence for single conversation', async () => {
      const mockConversationId = 'conv-sequence';
      const executionOrder = [];

      deleteConvos.mockImplementation(() => {
        executionOrder.push('deleteConvos');
        return Promise.resolve({ deletedCount: 1 });
      });

      deleteToolCalls.mockImplementation(() => {
        executionOrder.push('deleteToolCalls');
        return Promise.resolve({ deletedCount: 2 });
      });

      deleteConvoSharedLink.mockImplementation(() => {
        executionOrder.push('deleteConvoSharedLink');
        return Promise.resolve({ deletedCount: 1 });
      });

      await request(app)
        .delete('/api/convos')
        .send({
          arg: {
            conversationId: mockConversationId,
          },
        });

      expect(executionOrder).toEqual(['deleteConvos', 'deleteToolCalls', 'deleteConvoSharedLink']);
    });

    it('should prevent orphaned shared links when deleting single conversation', async () => {
      const mockConversationId = 'conv-with-shares';

      deleteConvos.mockResolvedValue({ deletedCount: 1 });
      deleteToolCalls.mockResolvedValue({ deletedCount: 4 });
      deleteConvoSharedLink.mockResolvedValue({
        message: 'Shared links deleted successfully',
        deletedCount: 2,
      });

      const response = await request(app)
        .delete('/api/convos')
        .send({
          arg: {
            conversationId: mockConversationId,
          },
        });

      expect(response.status).toBe(201);

      /** Verify shared links were deleted for the specific conversation */
      expect(deleteConvoSharedLink).toHaveBeenCalledWith('test-user-123', mockConversationId);

      /** Verify it was called after the conversation was deleted */
      expect(deleteConvoSharedLink).toHaveBeenCalledAfter(deleteConvos);
    });
  });

  describe('POST /archive', () => {
    it('should archive a conversation successfully', async () => {
      const mockConversationId = 'conv-123';
      const mockArchivedConvo = {
        conversationId: mockConversationId,
        title: 'Test Conversation',
        isArchived: true,
        user: 'test-user-123',
      };

      saveConvo.mockResolvedValue(mockArchivedConvo);

      const response = await request(app)
        .post('/api/convos/archive')
        .send({
          arg: {
            conversationId: mockConversationId,
            isArchived: true,
          },
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockArchivedConvo);
      expect(saveConvo).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'test-user-123' }),
        { conversationId: mockConversationId, isArchived: true },
        { context: `POST /api/convos/archive ${mockConversationId}` },
      );
    });

    it('should unarchive a conversation successfully', async () => {
      const mockConversationId = 'conv-456';
      const mockUnarchivedConvo = {
        conversationId: mockConversationId,
        title: 'Unarchived Conversation',
        isArchived: false,
        user: 'test-user-123',
      };

      saveConvo.mockResolvedValue(mockUnarchivedConvo);

      const response = await request(app)
        .post('/api/convos/archive')
        .send({
          arg: {
            conversationId: mockConversationId,
            isArchived: false,
          },
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockUnarchivedConvo);
      expect(saveConvo).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'test-user-123' }),
        { conversationId: mockConversationId, isArchived: false },
        { context: `POST /api/convos/archive ${mockConversationId}` },
      );
    });

    it('should return 400 when conversationId is missing', async () => {
      const response = await request(app)
        .post('/api/convos/archive')
        .send({
          arg: {
            isArchived: true,
          },
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'conversationId is required' });
      expect(saveConvo).not.toHaveBeenCalled();
    });

    it('should return 400 when isArchived is not a boolean', async () => {
      const response = await request(app)
        .post('/api/convos/archive')
        .send({
          arg: {
            conversationId: 'conv-123',
            isArchived: 'true',
          },
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'isArchived must be a boolean' });
      expect(saveConvo).not.toHaveBeenCalled();
    });

    it('should return 400 when isArchived is undefined', async () => {
      const response = await request(app)
        .post('/api/convos/archive')
        .send({
          arg: {
            conversationId: 'conv-123',
          },
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'isArchived must be a boolean' });
      expect(saveConvo).not.toHaveBeenCalled();
    });

    it('should return 500 when saveConvo fails', async () => {
      const mockConversationId = 'conv-error';
      saveConvo.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/convos/archive')
        .send({
          arg: {
            conversationId: mockConversationId,
            isArchived: true,
          },
        });

      expect(response.status).toBe(500);
      expect(response.text).toBe('Error archiving conversation');

      const { logger } = require('@librechat/data-schemas');
      expect(logger.error).toHaveBeenCalledWith('Error archiving conversation', expect.any(Error));
    });

    it('should handle empty arg object', async () => {
      const response = await request(app).post('/api/convos/archive').send({
        arg: {},
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'conversationId is required' });
    });
  });
});

/**
 * Custom Jest matcher to verify function call order
 */
expect.extend({
  toHaveBeenCalledAfter(received, other) {
    const receivedCalls = received.mock.invocationCallOrder;
    const otherCalls = other.mock.invocationCallOrder;

    if (receivedCalls.length === 0) {
      return {
        pass: false,
        message: () =>
          `Expected ${received.getMockName()} to have been called after ${other.getMockName()}, but ${received.getMockName()} was never called`,
      };
    }

    if (otherCalls.length === 0) {
      return {
        pass: false,
        message: () =>
          `Expected ${received.getMockName()} to have been called after ${other.getMockName()}, but ${other.getMockName()} was never called`,
      };
    }

    const lastReceivedCall = receivedCalls[receivedCalls.length - 1];
    const firstOtherCall = otherCalls[0];

    const pass = lastReceivedCall > firstOtherCall;

    return {
      pass,
      message: () =>
        pass
          ? `Expected ${received.getMockName()} not to have been called after ${other.getMockName()}`
          : `Expected ${received.getMockName()} to have been called after ${other.getMockName()}`,
    };
  },
});
