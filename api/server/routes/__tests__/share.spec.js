const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');

const mockGetSharedLinkExpiration = jest.fn();
const mockGrantCreationPermissions = jest.fn();
const mockUpdateSharedLinkPermissionsExpiration = jest.fn();
const mockSharedLinksAccess = jest.fn((_req, _res, next) => next());
const mockBuildSharedLinkStartupPayload = jest.fn();
const mockCanAccessSharedLink = jest.fn((req, _res, next) => {
  req.shareResourceId = 'resource-123';
  next();
});
const mockGetAppConfig = jest.fn();
const mockGetTenantId = jest.fn(() => undefined);
const mockParseSharedLinksPageSize = jest.fn(() => 10);
const mockIsValidSharedLinksCursor = jest.fn(() => true);

jest.mock('@librechat/api', () => ({
  isEnabled: jest.fn(() => true),
  generateCheckAccess: jest.fn(() => mockSharedLinksAccess),
  grantCreationPermissions: (...args) => mockGrantCreationPermissions(...args),
  updateSharedLinkPermissionsExpiration: (...args) =>
    mockUpdateSharedLinkPermissionsExpiration(...args),
  ensureLinkPermissions: jest.fn(),
  isFileSnapshotEnabled: jest.fn(() => true),
  isFileSnapshotKillSwitchActive: jest.fn(() => false),
  buildSharedLinkStartupPayload: (...args) => mockBuildSharedLinkStartupPayload(...args),
  deleteSharedLinkWithCleanup: jest.fn(),
  getSharedLinkExpiration: (...args) => mockGetSharedLinkExpiration(...args),
  isActiveExpirationDate: jest.fn((expiredAt) => expiredAt > new Date()),
  /* The list/query helpers are behaviour-tested in `@librechat/api`; the route only has
     to be wired to them, so they stand in as doubles here. */
  parseSharedLinksPageSize: (...args) => mockParseSharedLinksPageSize(...args),
  isValidSharedLinksCursor: (...args) => mockIsValidSharedLinksCursor(...args),
  buildShareFileEtag: (file) =>
    `"share-${file.file_id}-${file.previewRevision ?? 0}-${file.bytes ?? 0}-${file.filepath ?? ''}"`,
  MAX_SHARED_LINK_SEARCH_LENGTH: 256,
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn(), warn: jest.fn() },
  getTenantId: (...args) => mockGetTenantId(...args),
  createTempChatExpirationDate: jest.fn(() => new Date('2030-01-01T00:00:00.000Z')),
  runAsSystem: jest.fn((fn) => fn()),
  tenantStorage: { run: jest.fn((_ctx, fn) => fn()) },
  SYSTEM_TENANT_ID: '__SYSTEM__',
}));

jest.mock('librechat-data-provider', () => ({
  PermissionTypes: {
    SHARED_LINKS: 'SHARED_LINKS',
  },
  Permissions: {
    CREATE: 'CREATE',
    SHARE_PUBLIC: 'SHARE_PUBLIC',
  },
  RetentionMode: {
    ALL: 'all',
    TEMPORARY: 'temporary',
  },
  FileSources: {
    local: 'local',
    s3: 's3',
    cloudfront: 'cloudfront',
    azure_blob: 'azure_blob',
    firebase: 'firebase',
    text: 'text',
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
  getFiles: jest.fn(),
  updateFile: jest.fn(),
  getSharedMessages: jest.fn(),
  createSharedLink: jest.fn(),
  updateSharedLink: jest.fn(),
  deleteSharedLink: jest.fn(),
  getSharedLinks: jest.fn(),
  getSharedLink: jest.fn(),
  getSharedLinkFile: jest.fn(),
  backfillSharedLinkFiles: jest.fn(),
  getRoleByName: jest.fn(),
}));

const mockGetStrategyFunctions = jest.fn();
jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: (...args) => mockGetStrategyFunctions(...args),
}));
jest.mock('~/server/utils/files', () => ({
  cleanFileName: jest.fn((name) => name),
  getContentDisposition: jest.fn((name, disposition = 'attachment') => `${disposition}; ${name}`),
}));

jest.mock(
  '~/server/middleware/canAccessSharedLink',
  () =>
    (...args) =>
      mockCanAccessSharedLink(...args),
);
jest.mock('~/server/middleware/optionalShareFileAuth', () => (_req, _res, next) => next());
jest.mock('~/server/middleware/optionalJwtAuth', () => (req, _res, next) => next());
jest.mock('~/server/middleware/requireJwtAuth', () => (req, res, next) => next());
jest.mock('~/server/middleware/config/app', () => (_req, _res, next) => next());
jest.mock('~/server/services/Config/app', () => ({
  getAppConfig: (...args) => mockGetAppConfig(...args),
}));

jest.mock('~/server/middleware/limiters', () => ({
  createForkLimiters: () => ({
    forkIpLimiter: (_req, _res, next) => next(),
    forkUserLimiter: (_req, _res, next) => next(),
  }),
}));

jest.mock('~/server/utils/import/fork', () => ({
  forkSharedConversation: jest.fn(),
}));

const { Readable } = require('stream');
const { RetentionMode } = require('librechat-data-provider');
const { createTempChatExpirationDate, logger } = require('@librechat/data-schemas');
const {
  deleteSharedLinkWithCleanup,
  isFileSnapshotEnabled,
  isFileSnapshotKillSwitchActive,
} = require('@librechat/api');
const {
  getFiles,
  updateFile,
  getSharedMessages,
  createSharedLink,
  updateSharedLink,
  getSharedLinks,
  getSharedLinkFile,
  backfillSharedLinkFiles,
  getRoleByName,
} = require('~/models');
const { forkSharedConversation } = require('~/server/utils/import/fork');
const shareRouter = require('../share');

const activeExpiration = new Date('2030-01-01T00:00:00.000Z');
const expiredExpiration = new Date('2020-01-01T00:00:00.000Z');

const lean = (value) => ({
  lean: jest.fn().mockResolvedValue(value),
});

const buildApp = ({ retentionMode = RetentionMode.TEMPORARY, user = { id: 'user-123' } } = {}) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    req.config = { interfaceConfig: { retentionMode } };
    next();
  });
  app.use('/api/share', shareRouter);
  return app;
};

describe('share routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTenantId.mockReturnValue(undefined);
    mockGetAppConfig.mockResolvedValue({
      interfaceConfig: {
        privacyPolicy: { externalUrl: 'https://example.com/privacy' },
      },
    });
    mockBuildSharedLinkStartupPayload.mockReturnValue({
      appTitle: 'Shared Chat',
      bundlerURL: 'https://bundler.example.com',
      interface: {
        privacyPolicy: { externalUrl: 'https://example.com/privacy' },
      },
    });
    getRoleByName.mockResolvedValue({
      permissions: {
        SHARED_LINKS: {
          SHARE_PUBLIC: true,
        },
      },
    });
    mockGrantCreationPermissions.mockResolvedValue(undefined);
  });

  it('serves shared startup config after shared-link access is granted', async () => {
    const response = await request(buildApp()).get('/api/share/share-123/config');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(mockCanAccessSharedLink).toHaveBeenCalled();
    expect(mockGetAppConfig).toHaveBeenCalledWith({ baseOnly: true });
    expect(mockBuildSharedLinkStartupPayload).toHaveBeenCalledWith({
      interfaceConfig: {
        privacyPolicy: { externalUrl: 'https://example.com/privacy' },
      },
    });
    expect(response.body).toEqual({
      appTitle: 'Shared Chat',
      bundlerURL: 'https://bundler.example.com',
      interface: {
        privacyPolicy: { externalUrl: 'https://example.com/privacy' },
      },
    });
  });

  it('uses tenant-scoped app config for shared startup config when tenant context is present', async () => {
    mockGetTenantId.mockReturnValue('tenant-abc');

    const response = await request(buildApp()).get('/api/share/share-123/config');

    expect(response.status).toBe(200);
    expect(mockGetAppConfig).toHaveBeenCalledWith({ tenantId: 'tenant-abc' });
  });

  it('uses base app config for shared startup config in system context', async () => {
    mockGetTenantId.mockReturnValue('__SYSTEM__');

    const response = await request(buildApp()).get('/api/share/share-123/config');

    expect(response.status).toBe(200);
    expect(mockGetAppConfig).toHaveBeenCalledWith({ baseOnly: true });
  });

  it('prevents successful shared message responses from being cached', async () => {
    getSharedMessages.mockResolvedValue({ shareId: 'share-123', messages: [] });

    const response = await request(buildApp()).get('/api/share/share-123');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it('normalizes shared-link list parameters without double-decoding search text', async () => {
    getSharedLinks.mockResolvedValue({ links: [], hasNextPage: false });
    mockParseSharedLinksPageSize.mockReturnValueOnce(100);
    const cursor = '2030-01-01T00:00:00.000Z';

    const response = await request(buildApp()).get(
      `/api/share?pageSize=1000&sortBy=createdAt&sortDirection=asc&search=100%25%20ready&cursor=${encodeURIComponent(cursor)}`,
    );

    expect(response.status).toBe(200);
    expect(getSharedLinks).toHaveBeenCalledWith(
      'user-123',
      cursor,
      100,
      'createdAt',
      'asc',
      '100% ready',
    );
  });

  it('rejects a cursor the validator refuses before querying', async () => {
    mockIsValidSharedLinksCursor.mockReturnValueOnce(false);

    const response = await request(buildApp()).get('/api/share?cursor=not-a-date');

    expect(response.status).toBe(400);
    expect(mockIsValidSharedLinksCursor).toHaveBeenCalledWith('not-a-date', 'createdAt');
    expect(getSharedLinks).not.toHaveBeenCalled();
  });

  it('accepts the composite cursor issued for a titleless page', async () => {
    getSharedLinks.mockResolvedValue({ links: [], hasNextPage: false });
    const cursor = Buffer.from(
      JSON.stringify({ primary: null, id: '0123456789abcdef01234567' }),
    ).toString('base64');

    const response = await request(buildApp()).get(
      `/api/share?sortBy=title&cursor=${encodeURIComponent(cursor)}`,
    );

    expect(response.status).toBe(200);
    expect(getSharedLinks).toHaveBeenCalledWith('user-123', cursor, 10, 'title', 'desc', undefined);
  });

  it('does not expose internal list errors in the response', async () => {
    getSharedLinks.mockRejectedValue(new Error('mongodb.internal:27017'));

    const response = await request(buildApp()).get('/api/share');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ message: 'Error getting shared links' });
  });

  it('expires new shares for retained non-temporary conversations', async () => {
    mockGetSharedLinkExpiration.mockResolvedValue(activeExpiration);
    createSharedLink.mockResolvedValue({ _id: 'link-123', shareId: 'share-123' });

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
      true,
    );
    expect(mockGrantCreationPermissions).toHaveBeenCalledWith(
      'link-123',
      'user-123',
      true,
      new Date('2030-01-01T00:00:00.000Z'),
    );
    expect(mockSharedLinksAccess).toHaveBeenCalled();
  });

  it('snapshots files by default when the user does not opt out', async () => {
    mockGetSharedLinkExpiration.mockResolvedValue(activeExpiration);
    createSharedLink.mockResolvedValue({ _id: 'link-123', shareId: 'share-123' });

    await request(buildApp()).post('/api/share/convo-123').send({ targetMessageId: 'msg-123' });

    expect(createSharedLink).toHaveBeenCalledWith(
      'user-123',
      'convo-123',
      'msg-123',
      expect.anything(),
      true,
    );
  });

  it('rejects invalid create options before resolving retention', async () => {
    const invalidTarget = await request(buildApp())
      .post('/api/share/convo-123')
      .send({ targetMessageId: '' });
    const invalidSnapshot = await request(buildApp())
      .post('/api/share/convo-123')
      .send({ snapshotFiles: 'false' });

    expect(invalidTarget.status).toBe(400);
    expect(invalidSnapshot.status).toBe(400);
    expect(mockGetSharedLinkExpiration).not.toHaveBeenCalled();
    expect(createSharedLink).not.toHaveBeenCalled();
  });

  it('maps an existing-share domain error to conflict', async () => {
    mockGetSharedLinkExpiration.mockResolvedValue(activeExpiration);
    createSharedLink.mockRejectedValue(
      Object.assign(new Error('Share already exists'), { code: 'SHARE_EXISTS' }),
    );

    const response = await request(buildApp()).post('/api/share/convo-123').send({});

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ message: 'Share already exists' });
  });

  it('does not snapshot files when the user opts out (snapshotFiles=false)', async () => {
    mockGetSharedLinkExpiration.mockResolvedValue(activeExpiration);
    createSharedLink.mockResolvedValue({ _id: 'link-123', shareId: 'share-123' });

    await request(buildApp())
      .post('/api/share/convo-123')
      .send({ targetMessageId: 'msg-123', snapshotFiles: false });

    expect(createSharedLink).toHaveBeenCalledWith(
      'user-123',
      'convo-123',
      'msg-123',
      expect.anything(),
      false,
    );
  });

  it('forces snapshotFiles=false when the feature is disabled, ignoring the body flag', async () => {
    isFileSnapshotEnabled.mockReturnValueOnce(false);
    mockGetSharedLinkExpiration.mockResolvedValue(activeExpiration);
    createSharedLink.mockResolvedValue({ _id: 'link-123', shareId: 'share-123' });

    await request(buildApp())
      .post('/api/share/convo-123')
      .send({ targetMessageId: 'msg-123', snapshotFiles: true });

    expect(createSharedLink).toHaveBeenCalledWith(
      'user-123',
      'convo-123',
      'msg-123',
      expect.anything(),
      false,
    );
  });

  it('passes the snapshotFiles opt-out through on update', async () => {
    mongoose.models.SharedLink.findOne.mockReturnValue(
      lean({ _id: 'link-456', conversationId: 'convo-123' }),
    );
    mockGetSharedLinkExpiration.mockResolvedValue(activeExpiration);
    updateSharedLink.mockResolvedValue({ _id: 'link-456', shareId: 'share-456' });

    await request(buildApp()).patch('/api/share/share-123').send({ snapshotFiles: false });

    expect(updateSharedLink).toHaveBeenCalledWith(
      'user-123',
      'share-123',
      undefined,
      expect.anything(),
      false,
    );
  });

  it('rejects new shares when the retained conversation expired', async () => {
    mockGetSharedLinkExpiration.mockResolvedValue(expiredExpiration);
    createSharedLink.mockResolvedValue({ _id: 'link-123', shareId: 'share-123' });

    const response = await request(buildApp())
      .post('/api/share/convo-123')
      .send({ targetMessageId: 'msg-123' });

    expect(response.status).toBe(404);
    expect(createSharedLink).not.toHaveBeenCalled();
  });

  it('rejects new shares for expired conversations in all retention mode', async () => {
    mockGetSharedLinkExpiration.mockResolvedValue(expiredExpiration);
    createSharedLink.mockResolvedValue({ _id: 'link-123', shareId: 'share-123' });

    const response = await request(buildApp({ retentionMode: RetentionMode.ALL }))
      .post('/api/share/convo-123')
      .send({ targetMessageId: 'msg-123' });

    expect(response.status).toBe(404);
    expect(createSharedLink).not.toHaveBeenCalled();
  });

  it('expires updated shares for retained non-temporary conversations', async () => {
    mongoose.models.SharedLink.findOne.mockReturnValue(
      lean({ _id: 'link-456', conversationId: 'convo-123' }),
    );
    mockGetSharedLinkExpiration.mockResolvedValue(activeExpiration);
    updateSharedLink.mockResolvedValue({ _id: 'link-456', shareId: 'share-456' });

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
      true,
    );
    expect(mockUpdateSharedLinkPermissionsExpiration).toHaveBeenCalledWith(
      'link-456',
      new Date('2030-01-01T00:00:00.000Z'),
    );
  });

  it('does not re-publish content when re-scoping the grants fails', async () => {
    mongoose.models.SharedLink.findOne.mockReturnValue(
      lean({ _id: 'link-456', conversationId: 'convo-123' }),
    );
    mockGetSharedLinkExpiration.mockResolvedValue(activeExpiration);
    mockUpdateSharedLinkPermissionsExpiration.mockRejectedValueOnce(new Error('acl down'));

    const response = await request(buildApp()).patch('/api/share/share-123');

    expect(response.status).toBe(500);
    // The shareId is stable, so publishing first would expose the update behind
    // the existing grants while the owner is told the update failed.
    expect(updateSharedLink).not.toHaveBeenCalled();
  });

  it('rejects updated shares when the retained conversation expired', async () => {
    mongoose.models.SharedLink.findOne.mockReturnValue(
      lean({ _id: 'link-456', conversationId: 'convo-123' }),
    );
    mockGetSharedLinkExpiration.mockResolvedValue(expiredExpiration);
    updateSharedLink.mockResolvedValue({ shareId: 'share-456' });

    const response = await request(buildApp()).patch('/api/share/share-123');

    expect(response.status).toBe(404);
    expect(updateSharedLink).not.toHaveBeenCalled();
  });

  it('rejects updated shares for expired conversations in all retention mode', async () => {
    mongoose.models.SharedLink.findOne.mockReturnValue(
      lean({ _id: 'link-456', conversationId: 'convo-123' }),
    );
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
    mongoose.models.SharedLink.findOne.mockReturnValue(
      lean({ _id: 'link-456', conversationId: 'convo-123' }),
    );
    mockGetSharedLinkExpiration.mockResolvedValue(null);
    updateSharedLink.mockResolvedValue({ _id: 'link-456', shareId: 'share-456' });

    const response = await request(buildApp()).patch('/api/share/share-123');

    expect(response.status).toBe(200);
    expect(updateSharedLink).toHaveBeenCalledWith('user-123', 'share-123', undefined, null, true);
    expect(mockUpdateSharedLinkPermissionsExpiration).toHaveBeenCalledWith('link-456', null);
    expect(mockSharedLinksAccess).toHaveBeenCalled();
  });

  it('gates updates on the CREATE permission so revoking it stops link updates', async () => {
    mockSharedLinksAccess.mockImplementationOnce((_req, res) =>
      res.status(403).json({ message: 'Forbidden' }),
    );

    const response = await request(buildApp()).patch('/api/share/share-123');

    expect(response.status).toBe(403);
    expect(updateSharedLink).not.toHaveBeenCalled();
  });

  it('preserves updated share expiration when the conversation cannot be found', async () => {
    mongoose.models.SharedLink.findOne.mockReturnValue(
      lean({ _id: 'link-456', conversationId: 'convo-123' }),
    );
    mockGetSharedLinkExpiration.mockResolvedValue(undefined);
    updateSharedLink.mockResolvedValue({ shareId: 'share-456' });

    const response = await request(buildApp()).patch('/api/share/share-123');

    expect(response.status).toBe(200);
    expect(updateSharedLink).toHaveBeenCalledWith(
      'user-123',
      'share-123',
      undefined,
      undefined,
      true,
    );
    expect(mockUpdateSharedLinkPermissionsExpiration).not.toHaveBeenCalled();
  });

  it('clears updated share expiration when creating a new expiration throws', async () => {
    const error = new Error('bad config');
    mongoose.models.SharedLink.findOne.mockReturnValue(
      lean({ _id: 'link-456', conversationId: 'convo-123' }),
    );
    mockGetSharedLinkExpiration.mockImplementationOnce(async (_input, dependencies) => {
      dependencies.logger.error('[getSharedLinkExpiration] Error creating expiration date:', error);
      return null;
    });
    updateSharedLink.mockResolvedValue({ _id: 'link-456', shareId: 'share-456' });

    const response = await request(buildApp()).patch('/api/share/share-123');

    expect(response.status).toBe(200);
    expect(logger.error).toHaveBeenCalledWith(
      '[getSharedLinkExpiration] Error creating expiration date:',
      error,
    );
    expect(updateSharedLink).toHaveBeenCalledWith('user-123', 'share-123', undefined, null, true);
    expect(mockUpdateSharedLinkPermissionsExpiration).toHaveBeenCalledWith('link-456', null);
  });

  it('updates share target message while applying retention expiration', async () => {
    mongoose.models.SharedLink.findOne.mockReturnValue(
      lean({ _id: 'link-456', conversationId: 'convo-123' }),
    );
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
      true,
    );
  });

  it('rejects non-string target message updates', async () => {
    const response = await request(buildApp())
      .patch('/api/share/share-123')
      .send({ targetMessageId: 123 });

    expect(response.status).toBe(400);
    expect(updateSharedLink).not.toHaveBeenCalled();
  });

  it('rejects invalid snapshot options on update', async () => {
    const response = await request(buildApp())
      .patch('/api/share/share-123')
      .send({ snapshotFiles: 'false' });

    expect(response.status).toBe(400);
    expect(updateSharedLink).not.toHaveBeenCalled();
  });

  it('maps a missing-share update domain error to not found', async () => {
    mongoose.models.SharedLink.findOne.mockReturnValue(lean(null));
    updateSharedLink.mockRejectedValue(
      Object.assign(new Error('Share not found'), { code: 'SHARE_NOT_FOUND' }),
    );

    const response = await request(buildApp()).patch('/api/share/share-123').send({});

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'Share not found' });
  });

  it('allows deleting existing shares without CREATE permission gate', async () => {
    deleteSharedLinkWithCleanup.mockResolvedValue({ shareId: 'share-123' });

    const response = await request(buildApp()).delete('/api/share/share-123');

    expect(response.status).toBe(200);
    expect(mockSharedLinksAccess).not.toHaveBeenCalled();
    expect(deleteSharedLinkWithCleanup).toHaveBeenCalledWith('user-123', 'share-123');
  });

  it('returns an internal error status when deletion fails', async () => {
    deleteSharedLinkWithCleanup.mockRejectedValue(new Error('database unavailable'));

    const response = await request(buildApp()).delete('/api/share/share-123');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ message: 'Error deleting shared link' });
  });
});

describe('share fork route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forks a shared conversation for the requesting user', async () => {
    const forkResult = {
      conversation: { conversationId: 'convo-456', title: 'Shared Title' },
      messages: [{ messageId: 'msg-456' }],
    };
    forkSharedConversation.mockResolvedValue(forkResult);

    const response = await request(
      buildApp({ user: { id: 'user-123', role: 'USER', tenantId: 'tenant-viewer' } }),
    )
      .post('/api/share/share-123/fork')
      .send({ targetMessageIndex: 3, shareRevision: '2026-01-01T00:00:00.000Z' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(forkResult);
    expect(forkSharedConversation).toHaveBeenCalledWith({
      shareId: 'share-123',
      shareResourceId: 'resource-123',
      requestUserId: 'user-123',
      userRole: 'USER',
      userTenantId: 'tenant-viewer',
      targetMessageIndex: 3,
      shareRevision: '2026-01-01T00:00:00.000Z',
      snapshotFiles: true,
    });
  });

  it('forces snapshotFiles=false into the fork when the file snapshot kill switch is active', async () => {
    isFileSnapshotKillSwitchActive.mockReturnValueOnce(true);
    forkSharedConversation.mockResolvedValue({
      conversation: { conversationId: 'convo-456' },
      messages: [],
    });

    await request(buildApp()).post('/api/share/share-123/fork');

    expect(forkSharedConversation).toHaveBeenCalledWith(
      expect.objectContaining({ snapshotFiles: false }),
    );
  });

  it('returns 404 when the shared conversation is missing or empty', async () => {
    forkSharedConversation.mockResolvedValue(null);

    const response = await request(buildApp()).post('/api/share/share-123/fork');

    expect(response.status).toBe(404);
  });

  it('returns 500 when forking fails', async () => {
    forkSharedConversation.mockRejectedValue(new Error('db down'));

    const response = await request(buildApp()).post('/api/share/share-123/fork');

    expect(response.status).toBe(500);
  });

  it('answers 409 when the viewer forks a payload the owner has republished', async () => {
    const conflict = new Error('Shared link was updated');
    conflict.code = 'SHARE_REVISION_MISMATCH';
    forkSharedConversation.mockRejectedValue(conflict);

    const response = await request(buildApp())
      .post('/api/share/share-123/fork')
      .send({ targetMessageIndex: 3, shareRevision: '2026-01-01T00:00:00.000Z' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ message: 'Shared link was updated' });
  });
});

describe('share-scoped file routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStrategyFunctions.mockReturnValue({
      getDownloadStream: jest.fn(async () => Readable.from(['file-bytes'])),
    });
    // Live file record present by default (resolveShareFile requires it).
    getFiles.mockResolvedValue([{ status: 'ready' }]);
  });

  it('serves a snapshotted image inline from its original stored object', async () => {
    const getDownloadStream = jest.fn(async () => Readable.from(['file-bytes']));
    mockGetStrategyFunctions.mockReturnValue({ getDownloadStream });
    getSharedLinkFile.mockResolvedValue({
      file: {
        file_id: 'file-1',
        source: 'local',
        filepath: '/images/owner/pic.png',
        type: 'image/png',
        filename: 'pic.png',
      },
      hasSnapshots: true,
    });

    const response = await request(buildApp()).get('/api/share/share-123/files/file-1');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('image/png');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-disposition']).toContain('inline');
    expect(mockGetStrategyFunctions).toHaveBeenCalledWith('local');
    expect(getDownloadStream).toHaveBeenCalledWith(expect.anything(), '/images/owner/pic.png');
    expect(backfillSharedLinkFiles).not.toHaveBeenCalled();
  });

  it('requires revalidation so a revoked link cannot be served from cache', async () => {
    const getDownloadStream = jest.fn(async () => Readable.from(['file-bytes']));
    mockGetStrategyFunctions.mockReturnValue({ getDownloadStream });
    getSharedLinkFile.mockResolvedValue({
      file: {
        file_id: 'file-1',
        source: 'local',
        filepath: '/images/owner/pic.png',
        type: 'image/png',
        filename: 'pic.png',
        bytes: 1234,
      },
      hasSnapshots: true,
    });

    const response = await request(buildApp()).get('/api/share/share-123/files/file-1');

    expect(response.status).toBe(200);
    // The shareId is stable across updates now, so the URL alone can no longer bust caches.
    expect(response.headers['cache-control']).toBe('private, no-cache');
    expect(response.headers['etag']).toBeDefined();
  });

  it('answers an unchanged snapshot with 304 instead of re-sending bytes', async () => {
    const getDownloadStream = jest.fn(async () => Readable.from(['file-bytes']));
    mockGetStrategyFunctions.mockReturnValue({ getDownloadStream });
    getSharedLinkFile.mockResolvedValue({
      file: {
        file_id: 'file-1',
        source: 'local',
        filepath: '/images/owner/pic.png',
        type: 'image/png',
        filename: 'pic.png',
        bytes: 1234,
      },
      hasSnapshots: true,
    });

    const app = buildApp();
    const first = await request(app).get('/api/share/share-123/files/file-1');
    expect(first.status).toBe(200);

    getDownloadStream.mockClear();
    const response = await request(app)
      .get('/api/share/share-123/files/file-1')
      .set('If-None-Match', first.headers['etag']);

    expect(response.status).toBe(304);
    expect(getDownloadStream).not.toHaveBeenCalled();
  });

  it('changes the validator when the snapshot revision moves', async () => {
    const getDownloadStream = jest.fn(async () => Readable.from(['file-bytes']));
    mockGetStrategyFunctions.mockReturnValue({ getDownloadStream });
    const snapshot = {
      file_id: 'file-1',
      source: 'local',
      filepath: '/images/owner/pic.png',
      type: 'image/png',
      filename: 'pic.png',
      bytes: 1234,
    };
    getSharedLinkFile.mockResolvedValue({ file: snapshot, hasSnapshots: true });

    const app = buildApp();
    const first = await request(app).get('/api/share/share-123/files/file-1');

    // Must match the snapshot, or resolveShareFile 404s on the version mismatch first.
    getFiles.mockResolvedValue([{ status: 'ready', previewRevision: 7, bytes: 1234 }]);
    getSharedLinkFile.mockResolvedValue({
      file: { ...snapshot, previewRevision: 7 },
      hasSnapshots: true,
    });

    const response = await request(app)
      .get('/api/share/share-123/files/file-1')
      .set('If-None-Match', first.headers['etag']);

    expect(response.status).toBe(200);
    expect(response.headers['etag']).not.toBe(first.headers['etag']);
  });

  it('changes the validator when a same-size replacement moves the stored object', async () => {
    const getDownloadStream = jest.fn(async () => Readable.from(['file-bytes']));
    mockGetStrategyFunctions.mockReturnValue({ getDownloadStream });
    const snapshot = {
      file_id: 'file-1',
      source: 'local',
      filepath: '/images/owner/plot.png?v=1',
      type: 'image/png',
      filename: 'plot.png',
      bytes: 1234,
    };
    getSharedLinkFile.mockResolvedValue({ file: snapshot, hasSnapshots: true });

    const app = buildApp();
    const first = await request(app).get('/api/share/share-123/files/file-1');

    // Re-published output: same file_id, same size, no revision, new stored path.
    getSharedLinkFile.mockResolvedValue({
      file: { ...snapshot, filepath: '/images/owner/plot.png?v=2' },
      hasSnapshots: true,
    });

    const response = await request(app)
      .get('/api/share/share-123/files/file-1')
      .set('If-None-Match', first.headers['etag']);

    expect(response.status).toBe(200);
    expect(response.headers['etag']).not.toBe(first.headers['etag']);
  });

  it('forces attachment for unsafe inline types (no stored XSS)', async () => {
    const getDownloadStream = jest.fn(async () => Readable.from(['<svg/>']));
    mockGetStrategyFunctions.mockReturnValue({ getDownloadStream });
    getSharedLinkFile.mockResolvedValue({
      file: {
        file_id: 'file-1',
        source: 'local',
        filepath: '/uploads/owner/evil.svg',
        type: 'image/svg+xml',
        filename: 'evil.svg',
      },
      hasSnapshots: true,
    });

    const response = await request(buildApp()).get('/api/share/share-123/files/file-1');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/octet-stream');
    expect(response.headers['content-disposition']).toContain('attachment');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('downloads a snapshotted file as an attachment', async () => {
    getSharedLinkFile.mockResolvedValue({
      file: {
        file_id: 'file-1',
        source: 'local',
        filepath: '/uploads/owner/file-1',
        type: 'application/pdf',
        filename: 'report.pdf',
      },
      hasSnapshots: true,
    });

    const response = await request(buildApp()).get('/api/share/share-123/files/file-1/download');

    expect(response.status).toBe(200);
    expect(response.headers['content-disposition']).toContain('attachment');
  });

  it('downloads stored text for a snapshotted text-source file', async () => {
    getFiles.mockResolvedValue([{ status: 'ready', text: 'Shared extracted text' }]);
    getSharedLinkFile.mockResolvedValue({
      file: {
        file_id: 'file-1',
        source: 'text',
        filepath: 'mistral_ocr',
        type: 'application/pdf',
        filename: 'report.pdf',
      },
      hasSnapshots: true,
    });

    const response = await request(buildApp()).get('/api/share/share-123/files/file-1/download');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.headers['content-disposition']).toContain('attachment; report.pdf.txt');
    expect(response.text).toBe('Shared extracted text');
    expect(mockGetStrategyFunctions).not.toHaveBeenCalled();
  });

  it('returns 500 when the backing stream fails before sending bytes', async () => {
    const failingStream = new Readable({
      read() {
        this.destroy(new Error('storage unavailable'));
      },
    });
    mockGetStrategyFunctions.mockReturnValue({
      getDownloadStream: jest.fn(async () => failingStream),
    });
    getSharedLinkFile.mockResolvedValue({
      file: {
        file_id: 'file-1',
        source: 'local',
        filepath: '/uploads/owner/file-1',
        type: 'application/pdf',
        filename: 'report.pdf',
      },
      hasSnapshots: true,
    });

    const response = await request(buildApp()).get('/api/share/share-123/files/file-1');

    expect(response.status).toBe(500);
  });

  it('returns preview status read live from the file record', async () => {
    getSharedLinkFile.mockResolvedValue({
      file: { file_id: 'file-1', source: 'local' },
      hasSnapshots: true,
    });
    getFiles.mockResolvedValue([{ status: 'ready', text: 'extracted text', textFormat: 'text' }]);

    const response = await request(buildApp()).get('/api/share/share-123/files/file-1/preview');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      file_id: 'file-1',
      status: 'ready',
      text: 'extracted text',
      textFormat: 'text',
    });
    expect(getFiles).toHaveBeenCalledWith({ file_id: 'file-1' }, null, {});
  });

  it('404s for a file not in the snapshot without rebuilding it', async () => {
    getSharedLinkFile.mockResolvedValue({ file: null, hasSnapshots: true });

    const response = await request(buildApp()).get('/api/share/share-123/files/not-shared');

    expect(response.status).toBe(404);
    expect(backfillSharedLinkFiles).not.toHaveBeenCalled();
    expect(mockGetStrategyFunctions).not.toHaveBeenCalled();
  });

  it('lazily backfills only a legacy share that has no snapshot field', async () => {
    getSharedLinkFile.mockResolvedValue({ file: null, hasSnapshots: false });
    backfillSharedLinkFiles.mockResolvedValue({
      file_id: 'file-1',
      source: 'local',
      filepath: '/images/owner/pic.png',
      type: 'image/png',
      filename: 'pic.png',
    });

    const response = await request(buildApp()).get('/api/share/share-123/files/file-1');

    expect(response.status).toBe(200);
    expect(backfillSharedLinkFiles).toHaveBeenCalledWith('share-123', 'file-1');
  });

  it('404s cleanly when the snapshotted file is no longer available', async () => {
    getSharedLinkFile.mockResolvedValue({
      file: { file_id: 'file-1', source: 'local', filepath: '/uploads/owner/gone.pdf' },
      hasSnapshots: true,
    });
    getFiles.mockResolvedValue([]); // original record deleted/expired

    const response = await request(buildApp()).get('/api/share/share-123/files/file-1');

    expect(response.status).toBe(404);
    expect(mockGetStrategyFunctions).not.toHaveBeenCalled();
  });

  it('404s (no serving) when the global kill switch is active', async () => {
    isFileSnapshotKillSwitchActive.mockReturnValueOnce(true);

    const response = await request(buildApp()).get('/api/share/share-123/files/file-1');

    expect(response.status).toBe(404);
    expect(getSharedLinkFile).not.toHaveBeenCalled();
    expect(mockGetStrategyFunctions).not.toHaveBeenCalled();
  });

  it('404s (no serving, no backfill) for a link that opted out of file sharing', async () => {
    getSharedLinkFile.mockResolvedValue({ file: null, hasSnapshots: false, optedOut: true });

    const response = await request(buildApp()).get('/api/share/share-123/files/file-1');

    expect(response.status).toBe(404);
    expect(backfillSharedLinkFiles).not.toHaveBeenCalled();
    expect(mockGetStrategyFunctions).not.toHaveBeenCalled();
  });

  it('404s when the snapshotted file version was overwritten (revision mismatch)', async () => {
    getSharedLinkFile.mockResolvedValue({
      file: {
        file_id: 'file-1',
        source: 'local',
        filepath: '/uploads/owner/x',
        previewRevision: 'r1',
      },
      hasSnapshots: true,
    });
    getFiles.mockResolvedValue([{ status: 'ready', previewRevision: 'r2' }]);

    const response = await request(buildApp()).get('/api/share/share-123/files/file-1');

    expect(response.status).toBe(404);
    expect(mockGetStrategyFunctions).not.toHaveBeenCalled();
  });

  it('404s when the snapshotted file was overwritten (size/bytes mismatch)', async () => {
    getSharedLinkFile.mockResolvedValue({
      file: { file_id: 'file-1', source: 'local', filepath: '/uploads/owner/x', bytes: 100 },
      hasSnapshots: true,
    });
    getFiles.mockResolvedValue([{ status: 'ready', bytes: 200 }]);

    const response = await request(buildApp()).get('/api/share/share-123/files/file-1');

    expect(response.status).toBe(404);
    expect(mockGetStrategyFunctions).not.toHaveBeenCalled();
  });

  it('strips a cache-busting query string before local streaming', async () => {
    const getDownloadStream = jest.fn(async () => Readable.from(['bytes']));
    mockGetStrategyFunctions.mockReturnValue({ getDownloadStream });
    getSharedLinkFile.mockResolvedValue({
      file: {
        file_id: 'file-1',
        source: 'local',
        filepath: '/images/owner/pic.png?v=2',
        type: 'image/png',
        filename: 'pic.png',
        bytes: 100,
      },
      hasSnapshots: true,
    });
    getFiles.mockResolvedValue([{ status: 'ready', bytes: 100 }]);

    const response = await request(buildApp()).get('/api/share/share-123/files/file-1');

    expect(response.status).toBe(200);
    expect(getDownloadStream).toHaveBeenCalledWith(expect.anything(), '/images/owner/pic.png');
  });

  it('sweeps an orphaned pending preview to failed', async () => {
    getSharedLinkFile.mockResolvedValue({
      file: { file_id: 'file-1', source: 'local' },
      hasSnapshots: true,
    });
    const stale = new Date(Date.now() - 5 * 60 * 1000);
    getFiles.mockResolvedValue([{ status: 'pending', updatedAt: stale }]);
    updateFile.mockResolvedValue({ status: 'failed', previewError: 'orphaned' });

    const response = await request(buildApp()).get('/api/share/share-123/files/file-1/preview');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      file_id: 'file-1',
      status: 'failed',
      previewError: 'orphaned',
    });
    expect(updateFile).toHaveBeenCalledWith(
      { file_id: 'file-1', status: 'failed', previewError: 'orphaned' },
      { status: 'pending', updatedAt: stale },
    );
  });
});
