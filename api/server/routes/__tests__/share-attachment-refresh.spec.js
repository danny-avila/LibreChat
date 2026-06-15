const express = require('express');
const request = require('supertest');

jest.mock('@librechat/api', () => ({
  isEnabled: (v) => v === undefined || v === true || v === 'true',
  generateCheckAccess: () => (req, res, next) => next(),
  grantCreationPermissions: jest.fn(),
  ensureLinkPermissions: jest.fn(),
  deleteSharedLinkWithCleanup: jest.fn(),
  updateSharedLinkPermissionsExpiration: jest.fn(),
  isActiveExpirationDate: jest.fn(),
  getSharedLinkExpiration: jest.fn(),
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
  createTempChatExpirationDate: jest.fn(),
}));

jest.mock('~/models', () => ({
  getSharedMessages: jest.fn(),
  createSharedLink: jest.fn(),
  updateSharedLink: jest.fn(),
  getSharedLinks: jest.fn(),
  getSharedLink: jest.fn(),
  getRoleByName: jest.fn(),
}));

jest.mock('~/server/middleware/canAccessSharedLink', () => (req, res, next) => next());
jest.mock('~/server/middleware/optionalJwtAuth', () => (req, res, next) => next());
jest.mock('~/server/middleware/requireJwtAuth', () => (req, res, next) => {
  req.user = { id: 'u1' };
  next();
});

const { getSharedMessages } = require('~/models');
const { refreshS3Url } = require('@librechat/api');
const { FileSources } = require('librechat-data-provider');

const router = require('../share');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/share', router);
  return app;
}

describe('GET /api/share/:shareId — refresh expired S3 presigned URLs', () => {
  const STALE = 'https://bucket.s3.amazonaws.com/uploads/u/x?X-Amz-Signature=OLD&X-Amz-Expires=120';
  const FRESH = 'https://bucket.s3.amazonaws.com/uploads/u/x?X-Amz-Signature=NEW&X-Amz-Expires=120';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rewrites stale presigned URLs in shared conversation attachments + files', async () => {
    refreshS3Url.mockResolvedValue(FRESH);
    getSharedMessages.mockResolvedValue({
      shareId: 's1',
      title: 't',
      conversationId: 'anon-c1',
      messages: [
        {
          messageId: 'm1',
          attachments: [{ source: FileSources.s3, filepath: STALE }],
          files: [{ source: FileSources.s3, filepath: STALE }],
        },
      ],
    });

    const res = await request(buildApp()).get('/api/share/s1');

    expect(res.status).toBe(200);
    expect(res.body.messages[0].attachments[0].filepath).toBe(FRESH);
    expect(res.body.messages[0].files[0].filepath).toBe(FRESH);
    // same filepath in both fields — memoised to one call
    expect(refreshS3Url).toHaveBeenCalledTimes(1);
  });

  test('returns 404 when getSharedMessages returns null', async () => {
    getSharedMessages.mockResolvedValue(null);
    const res = await request(buildApp()).get('/api/share/missing');
    expect(res.status).toBe(404);
    expect(refreshS3Url).not.toHaveBeenCalled();
  });
});
