jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import mongoose, { Types, Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createModels, createMethods } from '@librechat/data-schemas';
import { ResourceType, PrincipalType, AccessRoleIds } from 'librechat-data-provider';
import type { Request, Response, NextFunction } from 'express';
import type { IAclEntry, ISharedLink } from '@librechat/data-schemas';
import { AccessControlService } from '~/acl/accessControlService';
import { createSharedLinkAccessMiddleware } from './access';

let mongoServer: MongoMemoryServer;
let AclEntry: Model<IAclEntry>;
let SharedLink: Model<ISharedLink>;
let aclService: AccessControlService;
let canAccessSharedLink: ReturnType<typeof createSharedLinkAccessMiddleware>;

const userId = new Types.ObjectId();
const mockGetUserPrincipals = jest.fn();

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  const methods = createMethods(mongoose);
  await methods.seedDefaultRoles();
  AclEntry = mongoose.models.AclEntry as Model<IAclEntry>;
  SharedLink = mongoose.models.SharedLink as Model<ISharedLink>;

  aclService = new AccessControlService(mongoose);
  const originalMethods = aclService['_dbMethods'];
  aclService['_dbMethods'] = {
    ...originalMethods,
    getUserPrincipals: mockGetUserPrincipals,
  };

  canAccessSharedLink = createSharedLinkAccessMiddleware({ mongoose, aclService });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await AclEntry.deleteMany({});
  await SharedLink.deleteMany({});
  mockGetUserPrincipals.mockReset();
  delete process.env.ALLOW_SHARED_LINKS_PUBLIC;
  delete process.env.SHARED_LINKS_AUTO_MIGRATE;
});

function createReq(overrides: Record<string, unknown> = {}): Request {
  return { params: {}, user: undefined, ...overrides } as unknown as Request;
}

function createRes(): Response & { _status: number; _json: unknown } {
  const res = {
    _status: 0,
    _json: null as unknown,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: unknown) {
      res._json = body;
      return res;
    },
  };
  return res as unknown as Response & { _status: number; _json: unknown };
}

async function createTestLink(overrides: Partial<ISharedLink> = {}) {
  return SharedLink.create({
    shareId: `share-${Date.now()}-${Math.random()}`,
    conversationId: 'convo1',
    user: userId.toString(),
    messages: [],
    ...overrides,
  });
}

async function grantPublicViewer(resourceId: Types.ObjectId) {
  await aclService.grantPermission({
    principalType: PrincipalType.PUBLIC,
    principalId: null,
    resourceType: ResourceType.SHARED_LINK,
    resourceId,
    accessRoleId: AccessRoleIds.SHARED_LINK_VIEWER,
    grantedBy: userId,
  });
}

async function grantUserViewer(resourceId: Types.ObjectId, uid: Types.ObjectId) {
  await aclService.grantPermission({
    principalType: PrincipalType.USER,
    principalId: uid,
    resourceType: ResourceType.SHARED_LINK,
    resourceId,
    accessRoleId: AccessRoleIds.SHARED_LINK_VIEWER,
    grantedBy: userId,
  });
}

describe('canAccessSharedLink', () => {
  describe('input validation', () => {
    test('returns 400 when shareId is missing', async () => {
      const req = createReq({ params: {} });
      const res = createRes();
      const next = jest.fn();
      await canAccessSharedLink(req, res, next as unknown as NextFunction);
      expect(res._status).toBe(400);
      expect(next).not.toHaveBeenCalled();
    });

    test('returns 404 when share does not exist', async () => {
      const req = createReq({ params: { shareId: 'nonexistent' } });
      const res = createRes();
      const next = jest.fn();
      await canAccessSharedLink(req, res, next as unknown as NextFunction);
      expect(res._status).toBe(404);
      expect(next).not.toHaveBeenCalled();
    });

    test('returns 404 when share is expired but ACL still exists', async () => {
      const link = await createTestLink({ expiredAt: new Date('2020-01-01T00:00:00.000Z') });
      await grantPublicViewer(link._id);
      process.env.ALLOW_SHARED_LINKS_PUBLIC = 'true';

      const req = createReq({ params: { shareId: link.shareId } });
      const res = createRes();
      const next = jest.fn();
      await canAccessSharedLink(req, res, next as unknown as NextFunction);

      expect(res._status).toBe(404);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('public links', () => {
    test('calls next() for anonymous access when ALLOW_SHARED_LINKS_PUBLIC is true', async () => {
      const link = await createTestLink();
      await grantPublicViewer(link._id);
      process.env.ALLOW_SHARED_LINKS_PUBLIC = 'true';

      const req = createReq({ params: { shareId: link.shareId } });
      const res = createRes();
      const next = jest.fn();
      await canAccessSharedLink(req, res, next as unknown as NextFunction);

      expect(next).toHaveBeenCalled();
      expect((req as unknown as Record<string, unknown>).shareResourceId).toBe(link._id.toString());
    });

    test('returns 401 for anonymous access when ALLOW_SHARED_LINKS_PUBLIC is not set', async () => {
      const link = await createTestLink();
      await grantPublicViewer(link._id);

      const req = createReq({ params: { shareId: link.shareId } });
      const res = createRes();
      const next = jest.fn();
      await canAccessSharedLink(req, res, next as unknown as NextFunction);

      expect(res._status).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });

    test('calls next() for authenticated access to public link even without ALLOW_SHARED_LINKS_PUBLIC', async () => {
      const link = await createTestLink();
      await grantPublicViewer(link._id);

      const req = createReq({
        params: { shareId: link.shareId },
        user: { id: userId.toString(), _id: userId },
      });
      const res = createRes();
      const next = jest.fn();
      await canAccessSharedLink(req, res, next as unknown as NextFunction);

      expect(next).toHaveBeenCalled();
      expect((req as unknown as Record<string, unknown>).shareResourceId).toBe(link._id.toString());
    });
  });

  describe('private links', () => {
    test('returns 401 for unauthenticated user', async () => {
      const link = await createTestLink();

      const req = createReq({ params: { shareId: link.shareId } });
      const res = createRes();
      const next = jest.fn();
      await canAccessSharedLink(req, res, next as unknown as NextFunction);

      expect(res._status).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });

    test('returns 403 for authenticated user without ACL entry', async () => {
      const link = await createTestLink();
      const otherUser = new Types.ObjectId();

      mockGetUserPrincipals.mockResolvedValue([
        { principalType: PrincipalType.USER, principalId: otherUser },
      ]);

      const req = createReq({
        params: { shareId: link.shareId },
        user: { id: otherUser.toString(), _id: otherUser, role: 'USER' },
      });
      const res = createRes();
      const next = jest.fn();
      await canAccessSharedLink(req, res, next as unknown as NextFunction);

      expect(res._status).toBe(403);
      expect(next).not.toHaveBeenCalled();
    });

    test('calls next() for authenticated user with ACL entry', async () => {
      const link = await createTestLink();
      const viewer = new Types.ObjectId();
      await grantUserViewer(link._id, viewer);

      mockGetUserPrincipals.mockResolvedValue([
        { principalType: PrincipalType.USER, principalId: viewer },
      ]);

      const req = createReq({
        params: { shareId: link.shareId },
        user: { id: viewer.toString(), _id: viewer, role: 'USER' },
      });
      const res = createRes();
      const next = jest.fn();
      await canAccessSharedLink(req, res, next as unknown as NextFunction);

      expect(next).toHaveBeenCalled();
      expect((req as unknown as Record<string, unknown>).shareResourceId).toBe(link._id.toString());
    });
  });

  describe('legacy link auto-migration', () => {
    async function createLegacyLink(isPublic: boolean) {
      const link = await createTestLink();
      // Inject isPublic directly into MongoDB to simulate a legacy document
      await mongoose.connection
        .db!.collection('sharedlinks')
        .updateOne({ _id: link._id }, { $set: { isPublic } });
      return link;
    }

    test('auto-migrates public legacy link and calls next()', async () => {
      const link = await createLegacyLink(true);
      process.env.ALLOW_SHARED_LINKS_PUBLIC = 'true';

      const req = createReq({ params: { shareId: link.shareId } });
      const res = createRes();
      const next = jest.fn();
      await canAccessSharedLink(req, res, next as unknown as NextFunction);

      expect(next).toHaveBeenCalled();

      const entries = await AclEntry.find({ resourceId: link._id }).lean();
      const hasOwner = entries.some((e) => e.principalType === PrincipalType.USER);
      const hasPublic = entries.some((e) => e.principalType === PrincipalType.PUBLIC);
      expect(hasOwner).toBe(true);
      expect(hasPublic).toBe(true);

      const rawDoc = await mongoose.connection
        .db!.collection('sharedlinks')
        .findOne({ _id: link._id });
      expect(rawDoc).not.toHaveProperty('isPublic');
    });

    test('does not re-create PUBLIC after owner removes it', async () => {
      const link = await createLegacyLink(true);
      process.env.ALLOW_SHARED_LINKS_PUBLIC = 'true';

      const next1 = jest.fn();
      const req1 = createReq({ params: { shareId: link.shareId } });
      await canAccessSharedLink(req1, createRes(), next1 as unknown as NextFunction);

      await AclEntry.deleteMany({
        resourceId: link._id,
        principalType: PrincipalType.PUBLIC,
      });

      const next2 = jest.fn();
      const req2 = createReq({ params: { shareId: link.shareId } });
      const res2 = createRes();
      await canAccessSharedLink(req2, res2, next2 as unknown as NextFunction);

      const publicEntries = await AclEntry.find({
        resourceId: link._id,
        principalType: PrincipalType.PUBLIC,
      }).lean();
      expect(publicEntries).toHaveLength(0);
    });

    test('auto-migrates legacy link with isPublic: false — no PUBLIC grant', async () => {
      const link = await createLegacyLink(false);
      const viewer = new Types.ObjectId();
      await grantUserViewer(link._id, viewer);

      mockGetUserPrincipals.mockResolvedValue([
        { principalType: PrincipalType.USER, principalId: viewer },
      ]);

      const req = createReq({
        params: { shareId: link.shareId },
        user: { id: viewer.toString(), _id: viewer, role: 'USER' },
      });
      const res = createRes();
      const next = jest.fn();
      await canAccessSharedLink(req, res, next as unknown as NextFunction);

      const publicEntries = await AclEntry.find({
        resourceId: link._id,
        principalType: PrincipalType.PUBLIC,
      }).lean();
      expect(publicEntries).toHaveLength(0);
    });

    test('returns 403 when auto-migration is disabled', async () => {
      const link = await createLegacyLink(true);
      process.env.SHARED_LINKS_AUTO_MIGRATE = 'false';

      const req = createReq({ params: { shareId: link.shareId } });
      const res = createRes();
      const next = jest.fn();
      await canAccessSharedLink(req, res, next as unknown as NextFunction);

      expect(res._status).toBe(403);
      expect(next).not.toHaveBeenCalled();
      expect((res._json as Record<string, string>).message).toContain('migration');
    });
  });
});
