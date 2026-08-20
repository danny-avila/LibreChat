const express = require('express');
const request = require('supertest');

const MOCKS = '../__test-utils__/convos-route-mocks';
const { archiveAllHandler } = require(MOCKS);

jest.mock('@librechat/agents', () => require(MOCKS).agents());
jest.mock('@librechat/api', () => require(MOCKS).api());
jest.mock('@librechat/data-schemas', () => require(MOCKS).dataSchemas());
jest.mock('librechat-data-provider', () => require(MOCKS).dataProvider());
jest.mock('~/models', () => require(MOCKS).sharedModels());
jest.mock('~/server/middleware/requireJwtAuth', () => require(MOCKS).requireJwtAuth());
jest.mock('~/server/middleware', () => require(MOCKS).middlewarePassthrough());
jest.mock('~/server/utils/import/fork', () => require(MOCKS).forkUtils());
jest.mock('~/server/utils/import', () => require(MOCKS).importUtils());
jest.mock('~/cache/getLogStores', () => require(MOCKS).logStores());
jest.mock('~/server/routes/files/multer', () => require(MOCKS).multerSetup());
jest.mock('multer', () => require(MOCKS).multerLib());
jest.mock('~/server/services/Endpoints/azureAssistants', () => require(MOCKS).assistantEndpoint());
jest.mock('~/server/services/Endpoints/assistants', () => require(MOCKS).assistantEndpoint());
jest.mock('~/server/services/Endpoints/agents/subagentThreadStore', () =>
  require(MOCKS).subagentThreadStore(),
);

describe('Convos Routes', () => {
  let app;
  let convosRouter;
  const { deleteToolCalls, deleteConvos, saveConvo } = require('~/models');
  const {
    deleteAgentCheckpoints,
    deleteAllSharedLinksWithCleanup,
    deleteConvoSharedLinksWithCleanup,
  } = require('@librechat/api');
  const subagentThreadStore = require('~/server/services/Endpoints/agents/subagentThreadStore');

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
    it('prunes the deleted conversations’ agent checkpoints (bulk, ids from deleteConvos)', async () => {
      // HITL: a paused conversation's durable checkpoint must not outlive the conversation.
      const conversationIds = ['conv-a', 'conv-b'];
      deleteConvos.mockResolvedValue({ deletedCount: 2, conversationIds });
      deleteToolCalls.mockResolvedValue({ deletedCount: 0 });
      deleteAllSharedLinksWithCleanup.mockResolvedValue({ deletedCount: 0 });

      const response = await request(app).delete('/api/convos/all');

      expect(response.status).toBe(201);
      expect(deleteAgentCheckpoints).toHaveBeenCalledTimes(1);
      expect(deleteAgentCheckpoints.mock.calls[0][0]).toEqual(conversationIds);
      /** The deletion runs inside the owner admission fence, not around it. */
      expect(subagentThreadStore.withOwnerDeletionFence).toHaveBeenCalledTimes(1);
      const [fencedUserId, fencedTenantId] =
        subagentThreadStore.withOwnerDeletionFence.mock.calls[0];
      expect(fencedUserId).toBe('test-user-123');
      expect(fencedTenantId).toBeUndefined();
      expect(subagentThreadStore.cancelAndDrainForOwner).not.toHaveBeenCalled();
    });

    it('should delete all conversations, tool calls, and shared links for a user', async () => {
      const mockDbResponse = {
        deletedCount: 5,
        message: 'All conversations deleted successfully',
      };

      deleteConvos.mockResolvedValue(mockDbResponse);
      deleteToolCalls.mockResolvedValue({ deletedCount: 10 });
      deleteAllSharedLinksWithCleanup.mockResolvedValue({
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

      /** Verify deleteAllSharedLinksWithCleanup was called with correct userId */
      expect(deleteAllSharedLinksWithCleanup).toHaveBeenCalledWith('test-user-123');
      expect(deleteAllSharedLinksWithCleanup).toHaveBeenCalledTimes(1);
    });

    it('should call deleteAllSharedLinksWithCleanup even when no conversations exist', async () => {
      const mockDbResponse = {
        deletedCount: 0,
        message: 'No conversations to delete',
      };

      deleteConvos.mockResolvedValue(mockDbResponse);
      deleteToolCalls.mockResolvedValue({ deletedCount: 0 });
      deleteAllSharedLinksWithCleanup.mockResolvedValue({
        message: 'All shared links deleted successfully',
        deletedCount: 0,
      });

      const response = await request(app).delete('/api/convos/all');

      expect(response.status).toBe(201);
      expect(deleteAllSharedLinksWithCleanup).toHaveBeenCalledWith('test-user-123');
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

    it('does not delete conversations when cross-replica task draining fails', async () => {
      /** Draining happens inside the admission fence, so its failure fails the fence. */
      subagentThreadStore.withOwnerDeletionFence.mockRejectedValueOnce(
        new Error('task owner unavailable'),
      );

      const response = await request(app).delete('/api/convos/all');

      expect(response.status).toBe(500);
      expect(deleteConvos).not.toHaveBeenCalled();
      expect(deleteAgentCheckpoints).not.toHaveBeenCalled();
      expect(deleteToolCalls).not.toHaveBeenCalled();
      expect(deleteAllSharedLinksWithCleanup).not.toHaveBeenCalled();
    });

    it('should return 500 if deleteToolCalls fails', async () => {
      deleteConvos.mockResolvedValue({ deletedCount: 5 });
      deleteToolCalls.mockRejectedValue(new Error('Tool calls deletion failed'));

      const response = await request(app).delete('/api/convos/all');

      expect(response.status).toBe(500);
      expect(response.text).toBe('Error clearing conversations');
    });

    it('should return 500 if deleteAllSharedLinksWithCleanup fails', async () => {
      deleteConvos.mockResolvedValue({ deletedCount: 5 });
      deleteToolCalls.mockResolvedValue({ deletedCount: 10 });
      deleteAllSharedLinksWithCleanup.mockRejectedValue(new Error('Shared links deletion failed'));

      const response = await request(app).delete('/api/convos/all');

      expect(response.status).toBe(500);
      expect(response.text).toBe('Error clearing conversations');
    });

    it('should handle multiple users independently', async () => {
      /** First user */
      deleteConvos.mockResolvedValue({ deletedCount: 3 });
      deleteToolCalls.mockResolvedValue({ deletedCount: 5 });
      deleteAllSharedLinksWithCleanup.mockResolvedValue({ deletedCount: 2 });

      let response = await request(app).delete('/api/convos/all');

      expect(response.status).toBe(201);
      expect(deleteAllSharedLinksWithCleanup).toHaveBeenCalledWith('test-user-123');

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
      deleteAllSharedLinksWithCleanup.mockResolvedValue({ deletedCount: 4 });

      response = await request(app2).delete('/api/convos/all');

      expect(response.status).toBe(201);
      expect(deleteAllSharedLinksWithCleanup).toHaveBeenCalledWith('test-user-456');
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

      deleteAllSharedLinksWithCleanup.mockImplementation(() => {
        executionOrder.push('deleteAllSharedLinksWithCleanup');
        return Promise.resolve({ deletedCount: 3 });
      });

      await request(app).delete('/api/convos/all');

      /** Verify all three functions were called */
      expect(executionOrder).toEqual([
        'deleteConvos',
        'deleteToolCalls',
        'deleteAllSharedLinksWithCleanup',
      ]);
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
      deleteAllSharedLinksWithCleanup.mockResolvedValue(mockSharedLinksDeleted);

      const response = await request(app).delete('/api/convos/all');

      expect(response.status).toBe(201);

      /** Verify that shared links cleanup was called for the same user */
      expect(deleteAllSharedLinksWithCleanup).toHaveBeenCalledWith('test-user-123');

      /** Verify no shared links remain for deleted conversations */
      expect(deleteAllSharedLinksWithCleanup).toHaveBeenCalledAfter(deleteConvos);
    });
  });

  describe('DELETE /', () => {
    it('fences the owner when DELETE / is called without a conversation filter', async () => {
      deleteConvos.mockResolvedValue({ deletedCount: 3, conversationIds: ['a', 'b', 'c'] });

      const response = await request(app)
        .delete('/api/convos')
        .send({ arg: { thread_id: 'thread-abc' } });

      expect(response.status).toBe(201);
      /** An empty filter deletes everything, so it takes the same admission fence. */
      expect(subagentThreadStore.withOwnerDeletionFence).toHaveBeenCalledTimes(1);
      expect(subagentThreadStore.withOwnerDeletionFence.mock.calls[0][0]).toBe('test-user-123');
      expect(subagentThreadStore.cancelAndDrainForOwner).not.toHaveBeenCalled();
      expect(deleteConvos).toHaveBeenCalledWith('test-user-123', {});
    });

    it('cancels root and descendant leases and cleans every cascaded conversation', async () => {
      deleteConvos.mockResolvedValue({
        deletedCount: 2,
        conversationIds: ['parent-conversation', 'child-conversation'],
      });
      deleteToolCalls.mockResolvedValue({ deletedCount: 1 });
      deleteConvoSharedLinksWithCleanup.mockResolvedValue({ deletedCount: 1 });

      const response = await request(app)
        .delete('/api/convos')
        .send({
          arg: { conversationId: 'parent-conversation' },
        });

      expect(response.status).toBe(201);
      /** The plan is resolved before deletion, while those rows can still be read. */
      expect(subagentThreadStore.planCancellationForConversations).toHaveBeenCalledWith(
        'test-user-123',
        ['parent-conversation'],
        undefined,
      );
      expect(
        subagentThreadStore.planCancellationForConversations.mock.invocationCallOrder[0],
      ).toBeLessThan(deleteConvos.mock.invocationCallOrder[0]);
      /** It is applied once before deletion and replayed after with the cascade. */
      expect(subagentThreadStore.cancelPlan).toHaveBeenCalledTimes(2);
      expect(subagentThreadStore.cancelPlan.mock.calls[0][1]).toBeUndefined();
      expect(subagentThreadStore.cancelPlan.mock.calls[1][1]).toEqual([
        'parent-conversation',
        'child-conversation',
      ]);
      expect(deleteToolCalls.mock.calls.map((call) => call[1])).toEqual([
        'parent-conversation',
        'child-conversation',
      ]);
      expect(deleteConvoSharedLinksWithCleanup.mock.calls.map((call) => call[1])).toEqual([
        'parent-conversation',
        'child-conversation',
      ]);
    });

    it('should delete a single conversation, tool calls, and associated shared links', async () => {
      const mockConversationId = 'conv-123';
      const mockDbResponse = {
        deletedCount: 1,
        message: 'Conversation deleted successfully',
      };

      deleteConvos.mockResolvedValue(mockDbResponse);
      deleteToolCalls.mockResolvedValue({ deletedCount: 3 });
      deleteConvoSharedLinksWithCleanup.mockResolvedValue({
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

      /** Verify deleteConvoSharedLinksWithCleanup was called */
      expect(deleteConvoSharedLinksWithCleanup).toHaveBeenCalledWith(
        'test-user-123',
        mockConversationId,
      );
    });

    it('should not call deleteConvoSharedLinksWithCleanup when no conversationId provided', async () => {
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
      expect(deleteConvoSharedLinksWithCleanup).not.toHaveBeenCalled();
    });

    it('should handle deletion of conversation without shared links', async () => {
      const mockConversationId = 'conv-no-shares';

      deleteConvos.mockResolvedValue({ deletedCount: 1 });
      deleteToolCalls.mockResolvedValue({ deletedCount: 0 });
      deleteConvoSharedLinksWithCleanup.mockResolvedValue({
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
      expect(deleteConvoSharedLinksWithCleanup).toHaveBeenCalledWith(
        'test-user-123',
        mockConversationId,
      );
    });

    it('should return 400 when no parameters provided', async () => {
      const response = await request(app).delete('/api/convos').send({
        arg: {},
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'no parameters provided' });
      expect(deleteConvos).not.toHaveBeenCalled();
      expect(deleteConvoSharedLinksWithCleanup).not.toHaveBeenCalled();
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

    it('should return 500 if deleteConvoSharedLinksWithCleanup fails', async () => {
      const mockConversationId = 'conv-error';

      deleteConvos.mockResolvedValue({ deletedCount: 1 });
      deleteToolCalls.mockResolvedValue({ deletedCount: 2 });
      deleteConvoSharedLinksWithCleanup.mockRejectedValue(
        new Error('Failed to delete shared links'),
      );

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

      deleteConvoSharedLinksWithCleanup.mockImplementation(() => {
        executionOrder.push('deleteConvoSharedLinksWithCleanup');
        return Promise.resolve({ deletedCount: 1 });
      });

      await request(app)
        .delete('/api/convos')
        .send({
          arg: {
            conversationId: mockConversationId,
          },
        });

      expect(executionOrder).toEqual([
        'deleteConvos',
        'deleteToolCalls',
        'deleteConvoSharedLinksWithCleanup',
      ]);
    });

    it('should prevent orphaned shared links when deleting single conversation', async () => {
      const mockConversationId = 'conv-with-shares';

      deleteConvos.mockResolvedValue({ deletedCount: 1 });
      deleteToolCalls.mockResolvedValue({ deletedCount: 4 });
      deleteConvoSharedLinksWithCleanup.mockResolvedValue({
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
      expect(deleteConvoSharedLinksWithCleanup).toHaveBeenCalledWith(
        'test-user-123',
        mockConversationId,
      );

      /** Verify it was called after the conversation was deleted */
      expect(deleteConvoSharedLinksWithCleanup).toHaveBeenCalledAfter(deleteConvos);
    });
  });

  describe('GET / search handling', () => {
    const { getConvosByCursor } = require('~/models');

    beforeEach(() => {
      getConvosByCursor.mockResolvedValue({ conversations: [], nextCursor: null });
    });

    /** Express already percent-decodes `req.query`, so decoding a second time in the route
     * threw URIError on any term containing a bare `%` and mangled `%xx`-looking text. */
    it('accepts a search term containing a literal percent sign', async () => {
      const response = await request(app)
        .get('/api/convos')
        .query({ isArchived: 'true', search: '100% ready' });

      expect(response.status).toBe(200);
      expect(getConvosByCursor).toHaveBeenCalledWith(
        'test-user-123',
        expect.objectContaining({ search: '100% ready' }),
      );
    });

    it('passes percent-escape-looking text through without decoding it', async () => {
      const response = await request(app).get('/api/convos').query({ search: 'a%41b' });

      expect(response.status).toBe(200);
      expect(getConvosByCursor).toHaveBeenCalledWith(
        'test-user-123',
        expect.objectContaining({ search: 'a%41b' }),
      );
    });

    it('treats a whitespace-only search as no search', async () => {
      const response = await request(app).get('/api/convos').query({ search: '   ' });

      expect(response.status).toBe(200);
      expect(getConvosByCursor).toHaveBeenCalledWith(
        'test-user-123',
        expect.objectContaining({ search: undefined }),
      );
    });
  });

  describe('GET / pinned filter', () => {
    const { getConvosByCursor } = require('~/models');

    beforeEach(() => {
      getConvosByCursor.mockResolvedValue({ conversations: [], nextCursor: null });
    });

    it('forwards pinned=true so the sidebar section can fetch pins on their own', async () => {
      const response = await request(app)
        .get('/api/convos')
        .query({ pinned: 'true', limit: '100' });

      expect(response.status).toBe(200);
      expect(getConvosByCursor).toHaveBeenCalledWith(
        'test-user-123',
        expect.objectContaining({ pinned: true, limit: 100 }),
      );
    });

    it('leaves the list unfiltered when pinned is absent', async () => {
      const response = await request(app).get('/api/convos');

      expect(response.status).toBe(200);
      expect(getConvosByCursor).toHaveBeenCalledWith(
        'test-user-123',
        expect.objectContaining({ pinned: false }),
      );
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
        {
          conversationId: mockConversationId,
          isArchived: true,
        },
        {
          context: `POST /api/convos/archive ${mockConversationId}`,
          preserveUpdatedAt: true,
          noUpsert: true,
        },
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
        {
          context: `POST /api/convos/archive ${mockConversationId}`,
          preserveUpdatedAt: true,
          noUpsert: true,
        },
      );
    });

    it('leaves archivedAt to saveConvo so a redundant archive cannot restamp it', async () => {
      saveConvo.mockResolvedValue({ conversationId: 'conv-789', isArchived: true });

      await request(app)
        .post('/api/convos/archive')
        .send({ arg: { conversationId: 'conv-789', isArchived: true } });

      const [, data] = saveConvo.mock.calls[0];
      expect(data).not.toHaveProperty('archivedAt');
      expect(data.isArchived).toBe(true);
    });

    /** `updatedAt` stays the chat's own activity so unarchiving restores its real place
     * in the date groups; when it was filed away is recorded on `archivedAt` instead. */
    it('does not let archiving count as activity in the sidebar ordering', async () => {
      saveConvo.mockResolvedValue({ conversationId: 'conv-789', isArchived: true });

      await request(app)
        .post('/api/convos/archive')
        .send({ arg: { conversationId: 'conv-789', isArchived: true } });

      expect(saveConvo).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ preserveUpdatedAt: true }),
      );
    });

    it('should return 404 when the conversation does not exist', async () => {
      saveConvo.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/convos/archive')
        .send({ arg: { conversationId: 'missing-convo', isArchived: true } });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Conversation not found' });
      expect(saveConvo).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ noUpsert: true }),
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

  describe('POST /archive/all', () => {
    const { archiveAllConvos } = require('~/models');

    it('delegates archive-all requests through the package API handler', async () => {
      archiveAllConvos.mockResolvedValue({ archivedCount: 4 });

      const response = await request(app).post('/api/convos/archive/all');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ archivedCount: 4 });
      expect(archiveAllHandler).toHaveBeenCalledTimes(1);
      expect(archiveAllConvos).toHaveBeenCalledWith('test-user-123');
    });
  });

  describe('POST /convos/pin', () => {
    const mockConversationId = 'conv-123';
    const { setConvoPinned } = require('~/models');

    it('should pin a conversation', async () => {
      const mockPinnedConvo = { conversationId: mockConversationId, pinned: true };
      setConvoPinned.mockResolvedValue(mockPinnedConvo);

      const response = await request(app).post('/api/convos/pin').send({ arg: mockPinnedConvo });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockPinnedConvo);
      expect(setConvoPinned).toHaveBeenCalledWith('test-user-123', mockConversationId, true);
    });

    it('should unpin a conversation', async () => {
      const mockUnpinnedConvo = { conversationId: mockConversationId, pinned: false };
      setConvoPinned.mockResolvedValue(mockUnpinnedConvo);

      const response = await request(app).post('/api/convos/pin').send({ arg: mockUnpinnedConvo });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockUnpinnedConvo);
      expect(setConvoPinned).toHaveBeenCalledWith('test-user-123', mockConversationId, false);
    });

    /** A pin is one boolean: it must not drag in `saveConvo`'s message-id refresh
     * and project-stats recompute, which cost an extra read and a large write. */
    it('does not route a pin through the full conversation save', async () => {
      setConvoPinned.mockResolvedValue({ conversationId: mockConversationId, pinned: true });

      await request(app)
        .post('/api/convos/pin')
        .send({ arg: { conversationId: mockConversationId, pinned: true } });

      expect(setConvoPinned).toHaveBeenCalledTimes(1);
      expect(saveConvo).not.toHaveBeenCalled();
    });

    it('should return 404 when the conversation does not exist', async () => {
      setConvoPinned.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/convos/pin')
        .send({ arg: { conversationId: 'missing-convo', pinned: true } });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Conversation not found' });
    });

    it('should return 400 when conversationId is missing', async () => {
      const response = await request(app)
        .post('/api/convos/pin')
        .send({ arg: { pinned: true } });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'conversationId is required' });
      expect(setConvoPinned).not.toHaveBeenCalled();
    });

    it('should return 400 when pinned is not a boolean', async () => {
      const response = await request(app)
        .post('/api/convos/pin')
        .send({ arg: { conversationId: mockConversationId, pinned: 'yes' } });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'pinned must be a boolean' });
      expect(setConvoPinned).not.toHaveBeenCalled();
    });

    it('should return 400 when pinned is missing', async () => {
      const response = await request(app)
        .post('/api/convos/pin')
        .send({ arg: { conversationId: mockConversationId } });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'pinned is required' });
      expect(setConvoPinned).not.toHaveBeenCalled();
    });

    it('should return 500 when the pin update fails', async () => {
      setConvoPinned.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/convos/pin')
        .send({ arg: { conversationId: mockConversationId, pinned: true } });

      expect(response.status).toBe(500);
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
