import { Types } from 'mongoose';
import type { IUser } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
import { createAdminMigrationsHandlers } from './migrations';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
  runAsSystem: (fn: () => Promise<unknown>) => fn(),
}));

const sourceId = new Types.ObjectId().toString();
const targetId = new Types.ObjectId().toString();

function mockUser(overrides: Partial<IUser> = {}): IUser {
  return {
    _id: new Types.ObjectId(overrides._id ?? sourceId),
    name: 'Source User',
    email: 'source@example.com',
    role: 'USER',
    provider: 'local',
    tenantId: 'tenant-a',
    ...overrides,
  } as IUser;
}

function createReqRes(body: Record<string, unknown> = {}, userId?: string) {
  const req = {
    body,
    user: { _id: new Types.ObjectId(userId ?? targetId), id: userId ?? targetId },
  } as unknown as ServerRequest;
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  return { req, res, status, json };
}

function createDeps() {
  return {
    findUser: jest.fn(),
    countUserData: jest.fn().mockResolvedValue({ conversation: 2 }),
    reassignUserData: jest
      .fn()
      .mockResolvedValue([{ scopeKey: 'conversation', matched: 2, modified: 2, skipped: 0 }]),
    createAuditEntry: jest.fn().mockResolvedValue({}),
    getTransactionSupport: jest.fn().mockResolvedValue(false),
  };
}

describe('createAdminMigrationsHandlers', () => {
  it('previewMigration returns counts and crossTenant flag', async () => {
    const deps = createDeps();
    deps.findUser.mockImplementation(async (filter: { _id?: string }) => {
      if (String(filter._id) === sourceId) {
        return mockUser({ _id: new Types.ObjectId(sourceId), tenantId: 'tenant-a' });
      }
      return mockUser({
        _id: new Types.ObjectId(targetId),
        email: 'target@example.com',
        name: 'Target User',
        tenantId: 'tenant-b',
      });
    });

    const handlers = createAdminMigrationsHandlers(deps);
    const { req, res, status, json } = createReqRes({
      sourceUserId: sourceId,
      targetUserId: targetId,
      scopes: ['conversation'],
    });

    await handlers.previewMigration(req, res);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        crossTenant: true,
        counts: { conversation: 2 },
        scopes: ['conversation'],
      }),
    );
  });

  it('previewMigration rejects same user', async () => {
    const handlers = createAdminMigrationsHandlers(createDeps());
    const { req, res, status, json } = createReqRes({
      sourceUserId: sourceId,
      targetUserId: sourceId,
    });

    await handlers.previewMigration(req, res);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: 'Source and target users must be different',
    });
  });

  it('migrateUser writes audit entry and returns summary', async () => {
    const deps = createDeps();
    deps.findUser.mockImplementation(async (filter: { _id?: string }) => {
      if (String(filter._id) === sourceId) {
        return mockUser({ _id: new Types.ObjectId(sourceId) });
      }
      return mockUser({
        _id: new Types.ObjectId(targetId),
        email: 'target@example.com',
        tenantId: 'tenant-a',
      });
    });

    const handlers = createAdminMigrationsHandlers(deps);
    const actorId = new Types.ObjectId().toString();
    const { req, res, status, json } = createReqRes(
      { sourceUserId: sourceId, targetUserId: targetId },
      actorId,
    );

    await handlers.migrateUser(req, res);

    expect(deps.reassignUserData).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUserId: sourceId,
        targetUserId: targetId,
        targetTenantId: 'tenant-a',
      }),
    );
    expect(deps.createAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user_migrated',
        actorId,
      }),
    );
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        totalModified: 2,
        totalSkipped: 0,
      }),
    );
  });
});
