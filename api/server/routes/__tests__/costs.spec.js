const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  createMethods: jest.fn(() => ({})),
  createModels: jest.fn(() => ({})),
}));

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) => next(),
  validateMessageReq: (req, res, next) => next(),
}));

jest.mock('~/models', () => ({
  getConvo: jest.fn(),
  saveConvo: jest.fn(),
  saveMessage: jest.fn(),
  getMessage: jest.fn(),
  getMessages: jest.fn(),
  updateMessage: jest.fn(),
  deleteMessages: jest.fn(),
}));

jest.mock('~/db/models', () => {
  let User, Message, Transaction, Conversation;

  return {
    get User() {
      return User;
    },
    get Message() {
      return Message;
    },
    get Transaction() {
      return Transaction;
    },
    get Conversation() {
      return Conversation;
    },
    setUser: (model) => {
      User = model;
    },
    setMessage: (model) => {
      Message = model;
    },
    setTransaction: (model) => {
      Transaction = model;
    },
    setConversation: (model) => {
      Conversation = model;
    },
  };
});

describe('Costs Endpoint', () => {
  let app;
  let mongoServer;
  let messagesRouter;
  let User, Message, Transaction, Conversation;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const userSchema = new mongoose.Schema({
      _id: String,
      name: String,
      email: String,
    });

    const conversationSchema = new mongoose.Schema({
      conversationId: String,
      user: String,
      title: String,
      createdAt: Date,
    });

    const messageSchema = new mongoose.Schema({
      messageId: String,
      conversationId: String,
      user: String,
      isCreatedByUser: Boolean,
      tokenCount: Number,
      createdAt: Date,
    });

    const transactionSchema = new mongoose.Schema({
      conversationId: String,
      user: String,
      tokenType: String,
      tokenValue: Number,
      createdAt: Date,
    });

    User = mongoose.model('User', userSchema);
    Conversation = mongoose.model('Conversation', conversationSchema);
    Message = mongoose.model('Message', messageSchema);
    Transaction = mongoose.model('Transaction', transactionSchema);

    const dbModels = require('~/db/models');
    dbModels.setUser(User);
    dbModels.setMessage(Message);
    dbModels.setTransaction(Transaction);
    dbModels.setConversation(Conversation);

    require('~/db/models');

    try {
      messagesRouter = require('../messages');
    } catch (error) {
      console.error('Error loading messages router:', error);
      throw error;
    }

    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: 'test-user-id' };
      next();
    });
    app.use('/api/messages', messagesRouter);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Conversation.deleteMany({});
    await Message.deleteMany({});
    await Transaction.deleteMany({});
  });

  describe('GET /:conversationId/costs', () => {
    const conversationId = 'test-conversation-123';
    const userId = 'test-user-id';

    it('should return cost data for valid conversation', async () => {
      const { getConvo } = require('~/models');
      getConvo.mockResolvedValue({
        conversationId,
        user: userId,
        title: 'Test Conversation',
      });

      const conversation = new Conversation({
        conversationId,
        user: userId,
        title: 'Test Conversation',
        createdAt: new Date('2024-01-01T09:00:00Z'),
      });

      await conversation.save();

      const userMessage = new Message({
        messageId: 'user-msg-1',
        conversationId,
        user: userId,
        isCreatedByUser: true,
        tokenCount: 100,
        createdAt: new Date('2024-01-01T10:00:00Z'),
      });

      const aiMessage = new Message({
        messageId: 'ai-msg-1',
        conversationId,
        user: userId,
        isCreatedByUser: false,
        tokenCount: 150,
        createdAt: new Date('2024-01-01T10:01:00Z'),
      });

      await Promise.all([userMessage.save(), aiMessage.save()]);

      const promptTransaction = new Transaction({
        conversationId,
        user: userId,
        tokenType: 'prompt',
        tokenValue: 500000,
        createdAt: new Date('2024-01-01T10:00:30Z'),
      });

      const completionTransaction = new Transaction({
        conversationId,
        user: userId,
        tokenType: 'completion',
        tokenValue: 750000,
        createdAt: new Date('2024-01-01T10:01:30Z'),
      });

      await Promise.all([promptTransaction.save(), completionTransaction.save()]);

      const response = await request(app).get(`/api/messages/${conversationId}/costs`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        conversationId,
        totals: {
          prompt: { usd: 0.5, tokenCount: 100 },
          completion: { usd: 0.75, tokenCount: 150 },
          total: { usd: 1.25, tokenCount: 250 },
        },
        perMessage: [
          { messageId: 'user-msg-1', tokenType: 'prompt', tokenCount: 100, usd: 0.5 },
          { messageId: 'ai-msg-1', tokenType: 'completion', tokenCount: 150, usd: 0.75 },
        ],
      });
    });

    it('should return empty data for conversation with no messages', async () => {
      const { getConvo } = require('~/models');
      getConvo.mockResolvedValue({
        conversationId,
        user: userId,
        title: 'Test Conversation',
      });

      const conversation = new Conversation({
        conversationId,
        user: userId,
        title: 'Test Conversation',
        createdAt: new Date('2024-01-01T09:00:00Z'),
      });

      await conversation.save();

      const response = await request(app).get(`/api/messages/${conversationId}/costs`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        conversationId,
        totals: {
          prompt: { usd: 0, tokenCount: 0 },
          completion: { usd: 0, tokenCount: 0 },
          total: { usd: 0, tokenCount: 0 },
        },
        perMessage: [],
      });
    });

    it('should handle messages without transactions', async () => {
      const { getConvo } = require('~/models');
      getConvo.mockResolvedValue({
        conversationId,
        user: userId,
        title: 'Test Conversation',
      });

      const conversation = new Conversation({
        conversationId,
        user: userId,
        title: 'Test Conversation',
        createdAt: new Date('2024-01-01T09:00:00Z'),
      });

      await conversation.save();

      const userMessage = new Message({
        messageId: 'user-msg-1',
        conversationId,
        user: userId,
        isCreatedByUser: true,
        tokenCount: 100,
        createdAt: new Date('2024-01-01T10:00:00Z'),
      });

      const aiMessage = new Message({
        messageId: 'ai-msg-1',
        conversationId,
        user: userId,
        isCreatedByUser: false,
        tokenCount: 150,
        createdAt: new Date('2024-01-01T10:01:00Z'),
      });

      await Promise.all([userMessage.save(), aiMessage.save()]);

      const response = await request(app).get(`/api/messages/${conversationId}/costs`);

      expect(response.status).toBe(200);
      expect(response.body.totals.prompt.usd).toBe(0);
      expect(response.body.totals.completion.usd).toBe(0);
      expect(response.body.totals.total.usd).toBe(0);
    });

    it('should aggregate multiple transactions correctly', async () => {
      const { getConvo } = require('~/models');
      getConvo.mockResolvedValue({
        conversationId,
        user: userId,
        title: 'Test Conversation',
      });

      const conversation = new Conversation({
        conversationId,
        user: userId,
        title: 'Test Conversation',
        createdAt: new Date('2024-01-01T09:00:00Z'),
      });

      await conversation.save();

      const userMessage = new Message({
        messageId: 'user-msg-1',
        conversationId,
        user: userId,
        isCreatedByUser: true,
        tokenCount: 100,
        createdAt: new Date('2024-01-01T10:00:00Z'),
      });

      await userMessage.save();

      const promptTransaction1 = new Transaction({
        conversationId,
        user: userId,
        tokenType: 'prompt',
        tokenValue: 300000,
        createdAt: new Date('2024-01-01T10:00:30Z'),
      });

      const promptTransaction2 = new Transaction({
        conversationId,
        user: userId,
        tokenType: 'prompt',
        tokenValue: 200000,
        createdAt: new Date('2024-01-01T10:00:45Z'),
      });

      await Promise.all([promptTransaction1.save(), promptTransaction2.save()]);

      const response = await request(app).get(`/api/messages/${conversationId}/costs`);

      expect(response.status).toBe(200);
      expect(response.body.totals.prompt.usd).toBe(0.5);
      expect(response.body.perMessage[0].usd).toBe(0.5);
    });

    it('should handle null tokenCount values', async () => {
      const { getConvo } = require('~/models');
      getConvo.mockResolvedValue({
        conversationId,
        user: userId,
        title: 'Test Conversation',
      });

      const conversation = new Conversation({
        conversationId,
        user: userId,
        title: 'Test Conversation',
        createdAt: new Date('2024-01-01T09:00:00Z'),
      });

      await conversation.save();

      const userMessage = new Message({
        messageId: 'user-msg-1',
        conversationId,
        user: userId,
        isCreatedByUser: true,
        tokenCount: null,
        createdAt: new Date('2024-01-01T10:00:00Z'),
      });

      await userMessage.save();

      const response = await request(app).get(`/api/messages/${conversationId}/costs`);

      expect(response.status).toBe(200);
      expect(response.body.totals.prompt.tokenCount).toBe(0);
    });

    it('should handle null tokenValue in transactions', async () => {
      const { getConvo } = require('~/models');
      getConvo.mockResolvedValue({
        conversationId,
        user: userId,
        title: 'Test Conversation',
      });

      const conversation = new Conversation({
        conversationId,
        user: userId,
        title: 'Test Conversation',
        createdAt: new Date('2024-01-01T09:00:00Z'),
      });

      await conversation.save();

      const userMessage = new Message({
        messageId: 'user-msg-1',
        conversationId,
        user: userId,
        isCreatedByUser: true,
        tokenCount: 100,
        createdAt: new Date('2024-01-01T10:00:00Z'),
      });

      await userMessage.save();

      const promptTransaction = new Transaction({
        conversationId,
        user: userId,
        tokenType: 'prompt',
        tokenValue: null,
        createdAt: new Date('2024-01-01T10:00:30Z'),
      });

      await promptTransaction.save();

      const response = await request(app).get(`/api/messages/${conversationId}/costs`);

      expect(response.status).toBe(200);
      expect(response.body.totals.prompt.usd).toBe(0);
    });

    it('should handle negative tokenValue using Math.abs', async () => {
      const { getConvo } = require('~/models');
      getConvo.mockResolvedValue({
        conversationId,
        user: userId,
        title: 'Test Conversation',
      });

      const conversation = new Conversation({
        conversationId,
        user: userId,
        title: 'Test Conversation',
        createdAt: new Date('2024-01-01T09:00:00Z'),
      });

      await conversation.save();

      const userMessage = new Message({
        messageId: 'user-msg-1',
        conversationId,
        user: userId,
        isCreatedByUser: true,
        tokenCount: 100,
        createdAt: new Date('2024-01-01T10:00:00Z'),
      });

      await userMessage.save();

      const promptTransaction = new Transaction({
        conversationId,
        user: userId,
        tokenType: 'prompt',
        tokenValue: -500000,
        createdAt: new Date('2024-01-01T10:00:30Z'),
      });

      await promptTransaction.save();

      const response = await request(app).get(`/api/messages/${conversationId}/costs`);

      expect(response.status).toBe(200);
      expect(response.body.totals.prompt.usd).toBe(0.5);
    });

    it('should filter by user correctly', async () => {
      const { getConvo } = require('~/models');
      getConvo.mockResolvedValue({
        conversationId,
        user: userId,
        title: 'Test Conversation',
      });

      const conversation = new Conversation({
        conversationId,
        user: userId,
        title: 'Test Conversation',
        createdAt: new Date('2024-01-01T09:00:00Z'),
      });

      await conversation.save();

      const otherUserId = 'other-user-id';

      const userMessage = new Message({
        messageId: 'user-msg-1',
        conversationId,
        user: userId,
        isCreatedByUser: true,
        tokenCount: 100,
        createdAt: new Date('2024-01-01T10:00:00Z'),
      });

      const otherUserMessage = new Message({
        messageId: 'other-user-msg-1',
        conversationId,
        user: otherUserId,
        isCreatedByUser: true,
        tokenCount: 200,
        createdAt: new Date('2024-01-01T10:00:00Z'),
      });

      await Promise.all([userMessage.save(), otherUserMessage.save()]);

      const userTransaction = new Transaction({
        conversationId,
        user: userId,
        tokenType: 'prompt',
        tokenValue: 500000,
        createdAt: new Date('2024-01-01T10:00:30Z'),
      });

      const otherUserTransaction = new Transaction({
        conversationId,
        user: otherUserId,
        tokenType: 'prompt',
        tokenValue: 1000000,
        createdAt: new Date('2024-01-01T10:00:30Z'),
      });

      await Promise.all([userTransaction.save(), otherUserTransaction.save()]);

      const response = await request(app).get(`/api/messages/${conversationId}/costs`);

      expect(response.status).toBe(200);
      expect(response.body.totals.prompt.usd).toBe(0.5);
      expect(response.body.perMessage).toHaveLength(1);
      expect(response.body.perMessage[0].messageId).toBe('user-msg-1');
    });

    it('should filter transactions by tokenType', async () => {
      const { getConvo } = require('~/models');
      getConvo.mockResolvedValue({
        conversationId,
        user: userId,
        title: 'Test Conversation',
      });

      const conversation = new Conversation({
        conversationId,
        user: userId,
        title: 'Test Conversation',
        createdAt: new Date('2024-01-01T09:00:00Z'),
      });

      await conversation.save();

      const userMessage = new Message({
        messageId: 'user-msg-1',
        conversationId,
        user: userId,
        isCreatedByUser: true,
        tokenCount: 100,
        createdAt: new Date('2024-01-01T10:00:00Z'),
      });

      await userMessage.save();

      const promptTransaction = new Transaction({
        conversationId,
        user: userId,
        tokenType: 'prompt',
        tokenValue: 500000,
        createdAt: new Date('2024-01-01T10:00:30Z'),
      });

      const otherTransaction = new Transaction({
        conversationId,
        user: userId,
        tokenType: 'other',
        tokenValue: 1000000,
        createdAt: new Date('2024-01-01T10:00:30Z'),
      });

      await Promise.all([promptTransaction.save(), otherTransaction.save()]);

      const response = await request(app).get(`/api/messages/${conversationId}/costs`);

      expect(response.status).toBe(200);
      expect(response.body.totals.prompt.usd).toBe(0.5);
      expect(response.body.totals.completion.usd).toBe(0);
      expect(response.body.totals.total.usd).toBe(0.5);
    });

    it('should map transactions to messages chronologically', async () => {
      const { getConvo } = require('~/models');
      getConvo.mockResolvedValue({
        conversationId,
        user: userId,
        title: 'Test Conversation',
      });

      const conversation = new Conversation({
        conversationId,
        user: userId,
        title: 'Test Conversation',
        createdAt: new Date('2024-01-01T09:00:00Z'),
      });

      await conversation.save();

      const userMessage1 = new Message({
        messageId: 'user-msg-1',
        conversationId,
        user: userId,
        isCreatedByUser: true,
        tokenCount: 100,
        createdAt: new Date('2024-01-01T10:00:00Z'),
      });

      const userMessage2 = new Message({
        messageId: 'user-msg-2',
        conversationId,
        user: userId,
        isCreatedByUser: true,
        tokenCount: 200,
        createdAt: new Date('2024-01-01T10:01:00Z'),
      });

      await Promise.all([userMessage1.save(), userMessage2.save()]);

      const promptTransaction1 = new Transaction({
        conversationId,
        user: userId,
        tokenType: 'prompt',
        tokenValue: 500000,
        createdAt: new Date('2024-01-01T10:00:30Z'),
      });

      const promptTransaction2 = new Transaction({
        conversationId,
        user: userId,
        tokenType: 'prompt',
        tokenValue: 1000000,
        createdAt: new Date('2024-01-01T10:01:30Z'),
      });

      await Promise.all([promptTransaction1.save(), promptTransaction2.save()]);

      const response = await request(app).get(`/api/messages/${conversationId}/costs`);

      expect(response.status).toBe(200);
      expect(response.body.perMessage).toHaveLength(2);
      expect(response.body.perMessage[0].messageId).toBe('user-msg-1');
      expect(response.body.perMessage[0].usd).toBe(0.5);
      expect(response.body.perMessage[1].messageId).toBe('user-msg-2');
      expect(response.body.perMessage[1].usd).toBe(1.0);
    });

    it('should handle database errors', async () => {
      const { getConvo } = require('~/models');
      getConvo.mockResolvedValue({
        conversationId,
        user: userId,
        title: 'Test Conversation',
      });

      const conversation = new Conversation({
        conversationId,
        user: userId,
        title: 'Test Conversation',
        createdAt: new Date('2024-01-01T09:00:00Z'),
      });

      await conversation.save();

      await mongoose.connection.close();

      const response = await request(app).get(`/api/messages/${conversationId}/costs`);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });
});
