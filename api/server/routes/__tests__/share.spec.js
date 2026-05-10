const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('@librechat/api', () => ({
  isEnabled: jest.fn(() => true),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn() },
  createTempChatExpirationDate: jest.fn(() => new Date('2030-01-01T00:00:00.000Z')),
}));

jest.mock('librechat-data-provider', () => ({
  RetentionMode: {
    ALL: 'all',
    TEMPORARY: 'temporary',
  },
}));

jest.mock('mongoose', () => ({
  models: {
    Conversation: {
      findOne: jest.fn(),
    },
    SharedLink: {
      findOne: jest.fn(),
    },
  },
}));

jest.mock('~/models', () => ({
  getSharedMessages: jest.fn(),
  createSharedLink: jest.fn(),
  updateSharedLink: jest.fn(),
  deleteSharedLink: jest.fn(),
  getSharedLinks: jest.fn(),
  getSharedLink: jest.fn(),
}));

jest.mock('~/server/middleware/requireJwtAuth', () => (req, res, next) => next());

const { RetentionMode } = require('librechat-data-provider');
const { createSharedLink, updateSharedLink } = require('~/models');
const shareRouter = require('../share');

const retainedConvo = {
  isTemporary: false,
  expiredAt: new Date('2029-01-01T00:00:00.000Z'),
};

const lean = (value) => ({
  lean: jest.fn().mockResolvedValue(value),
});

const buildApp = ({ retentionMode = RetentionMode.TEMPORARY } = {}) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'user-123' };
    req.config = { interfaceConfig: { retentionMode } };
    next();
  });
  app.use('/api/share', shareRouter);
  return app;
};

describe('share routes retention', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('expires new shares for retained non-temporary conversations', async () => {
    mongoose.models.Conversation.findOne.mockReturnValue(lean(retainedConvo));
    createSharedLink.mockResolvedValue({ shareId: 'share-123' });

    const response = await request(buildApp())
      .post('/api/share/convo-123')
      .send({ targetMessageId: 'msg-123' });

    expect(response.status).toBe(200);
    expect(mongoose.models.Conversation.findOne).toHaveBeenCalledWith(
      { conversationId: 'convo-123', user: 'user-123' },
      'isTemporary expiredAt',
    );
    expect(createSharedLink).toHaveBeenCalledWith(
      'user-123',
      'convo-123',
      'msg-123',
      new Date('2030-01-01T00:00:00.000Z'),
    );
  });

  it('expires updated shares for retained non-temporary conversations', async () => {
    mongoose.models.SharedLink.findOne.mockReturnValue(lean({ conversationId: 'convo-123' }));
    mongoose.models.Conversation.findOne.mockReturnValue(lean(retainedConvo));
    updateSharedLink.mockResolvedValue({ shareId: 'share-456' });

    const response = await request(buildApp()).patch('/api/share/share-123');

    expect(response.status).toBe(200);
    expect(mongoose.models.SharedLink.findOne).toHaveBeenCalledWith(
      { shareId: 'share-123', user: 'user-123' },
      'conversationId',
    );
    expect(mongoose.models.Conversation.findOne).toHaveBeenCalledWith(
      { conversationId: 'convo-123', user: 'user-123' },
      'isTemporary expiredAt',
    );
    expect(updateSharedLink).toHaveBeenCalledWith(
      'user-123',
      'share-123',
      new Date('2030-01-01T00:00:00.000Z'),
    );
  });
});
