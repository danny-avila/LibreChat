const express = require('express');
const request = require('supertest');

jest.mock('@librechat/api', () => ({
  unescapeLaTeX: jest.fn((x) => x),
  countTokens: jest.fn().mockResolvedValue(10),
  sendFeedbackScore: jest.fn(),
  traceIdForMessage: jest.fn(),
  refreshS3Url: jest.fn(),
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
  requireJwtAuth: (req, res, next) => {
    req.user = { id: 'u1' };
    next();
  },
  validateMessageReq: (req, res, next) => next(),
}));

const db = require('~/models');
const { refreshS3Url } = require('@librechat/api');
const { FileSources } = require('librechat-data-provider');

const router = require('../messages');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/messages', router);
  return app;
}

describe('GET /api/messages routes — refresh expired S3 presigned URLs', () => {
  const STALE = 'https://bucket.s3.amazonaws.com/uploads/u/x?X-Amz-Signature=OLD&X-Amz-Expires=120';
  const FRESH = 'https://bucket.s3.amazonaws.com/uploads/u/x?X-Amz-Signature=NEW&X-Amz-Expires=120';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET /:conversationId rewrites stale presigned URLs in attachments[]', async () => {
    refreshS3Url.mockResolvedValue(FRESH);
    db.getMessages.mockResolvedValue([
      {
        messageId: 'm1',
        conversationId: 'c1',
        attachments: [{ file_id: 'f1', source: FileSources.s3, filepath: STALE }],
      },
    ]);

    const res = await request(buildApp()).get('/api/messages/c1');

    expect(res.status).toBe(200);
    expect(res.body[0].attachments[0].filepath).toBe(FRESH);
    expect(res.body[0].attachments[0].file_id).toBe('f1');
  });

  test('GET /:conversationId also rewrites stale presigned URLs in files[]', async () => {
    refreshS3Url.mockResolvedValue(FRESH);
    db.getMessages.mockResolvedValue([
      {
        messageId: 'm1',
        conversationId: 'c1',
        files: [{ file_id: 'u1', source: FileSources.s3, filepath: STALE }],
      },
    ]);

    const res = await request(buildApp()).get('/api/messages/c1');

    expect(res.status).toBe(200);
    expect(res.body[0].files[0].filepath).toBe(FRESH);
  });

  test('GET /:conversationId/:messageId rewrites stale presigned URLs', async () => {
    refreshS3Url.mockResolvedValue(FRESH);
    db.getMessages.mockResolvedValue([
      {
        messageId: 'm1',
        conversationId: 'c1',
        attachments: [{ source: FileSources.s3, filepath: STALE }],
      },
    ]);

    const res = await request(buildApp()).get('/api/messages/c1/m1');

    expect(res.status).toBe(200);
    expect(res.body[0].attachments[0].filepath).toBe(FRESH);
  });

  test('non-S3 attachments are left untouched', async () => {
    db.getMessages.mockResolvedValue([
      {
        messageId: 'm1',
        conversationId: 'c1',
        attachments: [{ source: 'local', filepath: '/uploads/u/local.png' }],
      },
    ]);

    const res = await request(buildApp()).get('/api/messages/c1');

    expect(res.status).toBe(200);
    expect(res.body[0].attachments[0].filepath).toBe('/uploads/u/local.png');
    expect(refreshS3Url).not.toHaveBeenCalled();
  });

  test('messages without attachments pass through cleanly', async () => {
    db.getMessages.mockResolvedValue([{ messageId: 'm1', conversationId: 'c1', text: 'hello' }]);

    const res = await request(buildApp()).get('/api/messages/c1');

    expect(res.status).toBe(200);
    expect(res.body[0].text).toBe('hello');
    expect(refreshS3Url).not.toHaveBeenCalled();
  });
});
