const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');

const mockGetSharedLinkExpiration = jest.fn();

jest.mock('@librechat/api', () => ({
  isEnabled: jest.fn(() => true),
  getSharedLinkExpiration: (...args) => mockGetSharedLinkExpiration(...args),
  isActiveExpirationDate: jest.fn((expiredAt) => expiredAt > new Date()),
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
const { createTempChatExpirationDate, logger } = require('@librechat/data-schemas');
const { createSharedLink, updateSharedLink } = require('~/models');
const shareRouter = require('../share');

const activeExpiration = new Date('2030-01-01T00:00:00.000Z');
const expiredExpiration = new Date('2020-01-01T00:00:00.000Z');

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
    mockGetSharedLinkExpiration.mockResolvedValue(activeExpiration);
    createSharedLink.mockResolvedValue({ shareId: 'share-123' });

    const response = await request(buildApp())
      .post('/api/share/convo-123')
      .send({ targetMessageId: 'msg-123' });

    expect(response.status).toBe(200);
    expect(mockGetSharedLinkExpiration).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'convo-123',
        req: expect.objectContaining({ user: { id: 'user-123' } }),
      }),
      expect.objectContaining({
        getConvo: expect.any(Function),
        createExpirationDate: createTempChatExpirationDate,
        logger,
      }),
    );
    const [, dependencies] = mockGetSharedLinkExpiration.mock.calls[0];
    mongoose.models.Conversation.findOne.mockReturnValue(lean({ expiredAt: activeExpiration }));
    await dependencies.getConvo('user-123', 'convo-123');
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

  it('rejects new shares when the retained conversation expired', async () => {
    mockGetSharedLinkExpiration.mockResolvedValue(expiredExpiration);
    createSharedLink.mockResolvedValue({ shareId: 'share-123' });

    const response = await request(buildApp())
      .post('/api/share/convo-123')
      .send({ targetMessageId: 'msg-123' });

    expect(response.status).toBe(404);
    expect(createSharedLink).not.toHaveBeenCalled();
  });

  it('rejects new shares for expired conversations in all retention mode', async () => {
    mockGetSharedLinkExpiration.mockResolvedValue(expiredExpiration);
    createSharedLink.mockResolvedValue({ shareId: 'share-123' });

    const response = await request(buildApp({ retentionMode: RetentionMode.ALL }))
      .post('/api/share/convo-123')
      .send({ targetMessageId: 'msg-123' });

    expect(response.status).toBe(404);
    expect(createSharedLink).not.toHaveBeenCalled();
  });

  it('expires updated shares for retained non-temporary conversations', async () => {
    mongoose.models.SharedLink.findOne.mockReturnValue(lean({ conversationId: 'convo-123' }));
    mockGetSharedLinkExpiration.mockResolvedValue(activeExpiration);
    updateSharedLink.mockResolvedValue({ shareId: 'share-456' });

    const response = await request(buildApp()).patch('/api/share/share-123');

    expect(response.status).toBe(200);
    expect(mongoose.models.SharedLink.findOne).toHaveBeenCalledWith(
      { shareId: 'share-123', user: 'user-123' },
      'conversationId',
    );
    expect(mockGetSharedLinkExpiration).toHaveBeenCalledTimes(1);
    expect(mockGetSharedLinkExpiration).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'convo-123',
        req: expect.objectContaining({ user: { id: 'user-123' } }),
      }),
      expect.objectContaining({
        getConvo: expect.any(Function),
        createExpirationDate: createTempChatExpirationDate,
        logger,
      }),
    );
    expect(updateSharedLink).toHaveBeenCalledWith(
      'user-123',
      'share-123',
      undefined,
      new Date('2030-01-01T00:00:00.000Z'),
    );
  });

  it('rejects updated shares when the retained conversation expired', async () => {
    mongoose.models.SharedLink.findOne.mockReturnValue(lean({ conversationId: 'convo-123' }));
    mockGetSharedLinkExpiration.mockResolvedValue(expiredExpiration);
    updateSharedLink.mockResolvedValue({ shareId: 'share-456' });

    const response = await request(buildApp()).patch('/api/share/share-123');

    expect(response.status).toBe(404);
    expect(updateSharedLink).not.toHaveBeenCalled();
  });

  it('rejects updated shares for expired conversations in all retention mode', async () => {
    mongoose.models.SharedLink.findOne.mockReturnValue(lean({ conversationId: 'convo-123' }));
    mockGetSharedLinkExpiration.mockResolvedValue(expiredExpiration);
    updateSharedLink.mockResolvedValue({ shareId: 'share-456' });

    const response = await request(buildApp({ retentionMode: RetentionMode.ALL })).patch(
      '/api/share/share-123',
    );

    expect(response.status).toBe(404);
    expect(mongoose.models.SharedLink.findOne).toHaveBeenCalledWith(
      { shareId: 'share-123', user: 'user-123' },
      'conversationId',
    );
    expect(updateSharedLink).not.toHaveBeenCalled();
  });

  it('clears updated share expiration when the conversation is no longer retained', async () => {
    mongoose.models.SharedLink.findOne.mockReturnValue(lean({ conversationId: 'convo-123' }));
    mockGetSharedLinkExpiration.mockResolvedValue(null);
    updateSharedLink.mockResolvedValue({ shareId: 'share-456' });

    const response = await request(buildApp()).patch('/api/share/share-123');

    expect(response.status).toBe(200);
    expect(updateSharedLink).toHaveBeenCalledWith('user-123', 'share-123', undefined, null);
  });

  it('preserves updated share expiration when the conversation cannot be found', async () => {
    mongoose.models.SharedLink.findOne.mockReturnValue(lean({ conversationId: 'convo-123' }));
    mockGetSharedLinkExpiration.mockResolvedValue(undefined);
    updateSharedLink.mockResolvedValue({ shareId: 'share-456' });

    const response = await request(buildApp()).patch('/api/share/share-123');

    expect(response.status).toBe(200);
    expect(updateSharedLink).toHaveBeenCalledWith('user-123', 'share-123', undefined, undefined);
  });

  it('clears updated share expiration when creating a new expiration throws', async () => {
    const error = new Error('bad config');
    mongoose.models.SharedLink.findOne.mockReturnValue(lean({ conversationId: 'convo-123' }));
    mockGetSharedLinkExpiration.mockImplementationOnce(async (_input, dependencies) => {
      dependencies.logger.error('[getSharedLinkExpiration] Error creating expiration date:', error);
      return null;
    });
    updateSharedLink.mockResolvedValue({ shareId: 'share-456' });

    const response = await request(buildApp()).patch('/api/share/share-123');

    expect(response.status).toBe(200);
    expect(logger.error).toHaveBeenCalledWith(
      '[getSharedLinkExpiration] Error creating expiration date:',
      error,
    );
    expect(updateSharedLink).toHaveBeenCalledWith('user-123', 'share-123', undefined, null);
  });

  it('updates share target message while applying retention expiration', async () => {
    mongoose.models.SharedLink.findOne.mockReturnValue(lean({ conversationId: 'convo-123' }));
    mockGetSharedLinkExpiration.mockResolvedValue(activeExpiration);
    updateSharedLink.mockResolvedValue({ shareId: 'share-456', targetMessageId: 'msg-456' });

    const response = await request(buildApp())
      .patch('/api/share/share-123')
      .send({ targetMessageId: 'msg-456' });

    expect(response.status).toBe(200);
    expect(updateSharedLink).toHaveBeenCalledWith(
      'user-123',
      'share-123',
      'msg-456',
      new Date('2030-01-01T00:00:00.000Z'),
    );
  });

  it('rejects non-string target message updates', async () => {
    const response = await request(buildApp())
      .patch('/api/share/share-123')
      .send({ targetMessageId: 123 });

    expect(response.status).toBe(400);
    expect(updateSharedLink).not.toHaveBeenCalled();
  });
});
