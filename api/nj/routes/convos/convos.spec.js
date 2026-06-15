const express = require('express');
const request = require('supertest');

const MOCKS = '../../../server/routes/__test-utils__/convos-route-mocks';

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

describe('Convos Routes', () => {
  let app;
  let convosRouter;
  const { saveConvo } = require('~/models');

  beforeAll(() => {
    convosRouter = require('../../../server/routes/convos');

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

  describe('POST /convos/pin', () => {
    const mockConversationId = 'conv-123';

    it('should pin a conversation', async () => {
      const mockPinnedConvo = { conversationId: mockConversationId, pinned: true };
      saveConvo.mockResolvedValue(mockPinnedConvo);

      const response = await request(app).post('/api/convos/pin').send({ arg: mockPinnedConvo });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockPinnedConvo);
      expect(saveConvo).toHaveBeenCalledWith(
        { userId: 'test-user-123' },
        { conversationId: mockConversationId, pinned: true },
        { context: `POST /api/convos/pin ${mockConversationId}` },
      );
    });

    it('should unpin a conversation', async () => {
      const mockUnpinnedConvo = { conversationId: mockConversationId, pinned: false };
      saveConvo.mockResolvedValue(mockUnpinnedConvo);

      const response = await request(app).post('/api/convos/pin').send({ arg: mockUnpinnedConvo });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockUnpinnedConvo);
      expect(saveConvo).toHaveBeenCalledWith(
        { userId: 'test-user-123' },
        { conversationId: mockConversationId, pinned: false },
        { context: `POST /api/convos/pin ${mockConversationId}` },
      );
    });

    it('should return 400 when conversationId is missing', async () => {
      const response = await request(app)
        .post('/api/convos/pin')
        .send({ arg: { pinned: true } });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'conversationId is required' });
      expect(saveConvo).not.toHaveBeenCalled();
    });

    it('should return 400 when pinned is not a boolean', async () => {
      const response = await request(app)
        .post('/api/convos/pin')
        .send({ arg: { conversationId: mockConversationId, pinned: 'yes' } });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'pinned must be a boolean' });
      expect(saveConvo).not.toHaveBeenCalled();
    });

    it('should return 400 when pinned is missing', async () => {
      const response = await request(app)
        .post('/api/convos/pin')
        .send({ arg: { conversationId: mockConversationId } });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'pinned is required' });
      expect(saveConvo).not.toHaveBeenCalled();
    });

    it('should return 500 when saveConvo fails', async () => {
      saveConvo.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/convos/pin')
        .send({ arg: { conversationId: mockConversationId, pinned: true } });

      expect(response.status).toBe(500);
    });
  });
});
