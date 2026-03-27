import { Types } from 'mongoose';
import { PrincipalType } from 'librechat-data-provider';
import { SystemCapabilities, expandImplications } from '@librechat/data-schemas';
import type { ISystemGrant } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
import type { AdminGrantsDeps } from './grants';
import { createAdminGrantsHandlers } from './grants';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn() },
}));

const validObjectId = new Types.ObjectId().toString();

function mockGrant(overrides: Partial<ISystemGrant> = {}): ISystemGrant {
  return {
    _id: new Types.ObjectId(),
    principalType: PrincipalType.ROLE,
    principalId: 'editor',
    capability: SystemCapabilities.READ_USERS,
    grantedAt: new Date(),
    ...overrides,
  } as ISystemGrant;
}

function createReqRes(
  overrides: {
    params?: Record<string, string>;
    query?: Record<string, string>;
    body?: Record<string, unknown>;
    user?: { _id: Types.ObjectId; role: string };
  } = {},
) {
  const req = {
    params: overrides.params ?? {},
    query: overrides.query ?? {},
    body: overrides.body ?? {},
    user: overrides.user ?? { _id: new Types.ObjectId(), role: 'admin' },
  } as unknown as ServerRequest;

  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;

  return { req, res, status, json };
}

function createDeps(overrides: Partial<AdminGrantsDeps> = {}): AdminGrantsDeps {
  return {
    getCapabilitiesForPrincipal: jest.fn().mockResolvedValue([]),
    grantCapability: jest.fn().mockResolvedValue(mockGrant()),
    revokeCapability: jest.fn().mockResolvedValue(undefined),
    getUserPrincipals: jest.fn().mockResolvedValue([
      { principalType: PrincipalType.USER, principalId: new Types.ObjectId() },
      { principalType: PrincipalType.ROLE, principalId: 'admin' },
    ]),
    hasCapabilityForPrincipals: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('createAdminGrantsHandlers', () => {
  describe('getEffectiveCapabilities', () => {
    it('returns expanded capabilities for the user', async () => {
      const manageRolesGrant = mockGrant({ capability: SystemCapabilities.MANAGE_ROLES });
      const deps = createDeps({
        getCapabilitiesForPrincipal: jest.fn().mockResolvedValue([manageRolesGrant]),
      });
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status, json } = createReqRes();

      await handlers.getEffectiveCapabilities(req, res);

      expect(status).toHaveBeenCalledWith(200);
      const response = json.mock.calls[0][0];
      const expected = expandImplications([SystemCapabilities.MANAGE_ROLES]);
      expect(response.capabilities).toEqual(expect.arrayContaining(expected));
      expect(response.capabilities).toContain(SystemCapabilities.READ_ROLES);
    });

    it('returns empty capabilities when user has no grants', async () => {
      const deps = createDeps();
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status, json } = createReqRes();

      await handlers.getEffectiveCapabilities(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ capabilities: [] });
    });

    it('queries each principal separately', async () => {
      const userId = new Types.ObjectId();
      const principals = [
        { principalType: PrincipalType.USER, principalId: userId },
        { principalType: PrincipalType.ROLE, principalId: 'editor' },
      ];
      const deps = createDeps({
        getUserPrincipals: jest.fn().mockResolvedValue(principals),
        getCapabilitiesForPrincipal: jest.fn().mockResolvedValue([]),
      });
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res } = createReqRes();

      await handlers.getEffectiveCapabilities(req, res);

      expect(deps.getCapabilitiesForPrincipal).toHaveBeenCalledTimes(2);
      expect(deps.getCapabilitiesForPrincipal).toHaveBeenCalledWith({
        principalType: PrincipalType.USER,
        principalId: userId,
      });
      expect(deps.getCapabilitiesForPrincipal).toHaveBeenCalledWith({
        principalType: PrincipalType.ROLE,
        principalId: 'editor',
      });
    });

    it('skips principals without principalId', async () => {
      const principals = [
        { principalType: PrincipalType.PUBLIC },
        { principalType: PrincipalType.ROLE, principalId: 'editor' },
      ];
      const deps = createDeps({
        getUserPrincipals: jest.fn().mockResolvedValue(principals),
        getCapabilitiesForPrincipal: jest.fn().mockResolvedValue([]),
      });
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res } = createReqRes();

      await handlers.getEffectiveCapabilities(req, res);

      expect(deps.getCapabilitiesForPrincipal).toHaveBeenCalledTimes(1);
    });

    it('deduplicates capabilities across principals', async () => {
      const readUsersGrant = mockGrant({ capability: SystemCapabilities.READ_USERS });
      const deps = createDeps({
        getUserPrincipals: jest.fn().mockResolvedValue([
          { principalType: PrincipalType.USER, principalId: new Types.ObjectId() },
          { principalType: PrincipalType.ROLE, principalId: 'editor' },
        ]),
        getCapabilitiesForPrincipal: jest.fn().mockResolvedValue([readUsersGrant]),
      });
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status, json } = createReqRes();

      await handlers.getEffectiveCapabilities(req, res);

      expect(status).toHaveBeenCalledWith(200);
      const response = json.mock.calls[0][0];
      const readUsersCount = response.capabilities.filter(
        (c: string) => c === SystemCapabilities.READ_USERS,
      ).length;
      expect(readUsersCount).toBe(1);
    });

    it('returns 401 when user is not authenticated', async () => {
      const deps = createDeps();
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status, json } = createReqRes();
      (req as unknown as Record<string, unknown>).user = undefined;

      await handlers.getEffectiveCapabilities(req, res);

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('returns 500 on unexpected error', async () => {
      const deps = createDeps({
        getUserPrincipals: jest.fn().mockRejectedValue(new Error('db error')),
      });
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status, json } = createReqRes();

      await handlers.getEffectiveCapabilities(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Failed to get effective capabilities' });
    });
  });

  describe('getPrincipalGrants', () => {
    it('returns grants for a role principal', async () => {
      const grants = [mockGrant()];
      const deps = createDeps({
        getCapabilitiesForPrincipal: jest.fn().mockResolvedValue(grants),
      });
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { principalType: PrincipalType.ROLE, principalId: 'editor' },
      });

      await handlers.getPrincipalGrants(req, res);

      expect(deps.getCapabilitiesForPrincipal).toHaveBeenCalledWith({
        principalType: PrincipalType.ROLE,
        principalId: 'editor',
      });
      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ grants });
    });

    it('returns grants for a group principal', async () => {
      const deps = createDeps({
        getCapabilitiesForPrincipal: jest.fn().mockResolvedValue([]),
      });
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { principalType: PrincipalType.GROUP, principalId: validObjectId },
      });

      await handlers.getPrincipalGrants(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ grants: [] });
    });

    it('returns 400 for invalid principal type', async () => {
      const deps = createDeps();
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { principalType: 'invalid', principalId: 'abc' },
      });

      await handlers.getPrincipalGrants(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Invalid principal type' });
    });

    it('returns 400 when principalId is missing', async () => {
      const deps = createDeps();
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { principalType: PrincipalType.ROLE, principalId: '' },
      });

      await handlers.getPrincipalGrants(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'principalId is required' });
    });

    it('returns 400 for non-ObjectId group principalId', async () => {
      const deps = createDeps();
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { principalType: PrincipalType.GROUP, principalId: 'not-an-objectid' },
      });

      await handlers.getPrincipalGrants(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Invalid principalId format' });
    });

    it('accepts string principalId for role type without ObjectId validation', async () => {
      const deps = createDeps({
        getCapabilitiesForPrincipal: jest.fn().mockResolvedValue([]),
      });
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status } = createReqRes({
        params: { principalType: PrincipalType.ROLE, principalId: 'custom-role-name' },
      });

      await handlers.getPrincipalGrants(req, res);

      expect(status).toHaveBeenCalledWith(200);
    });

    it('returns 401 when user is not authenticated', async () => {
      const deps = createDeps();
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { principalType: PrincipalType.ROLE, principalId: 'editor' },
      });
      (req as unknown as Record<string, unknown>).user = undefined;

      await handlers.getPrincipalGrants(req, res);

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('returns 403 when caller lacks READ capability', async () => {
      const deps = createDeps({
        hasCapabilityForPrincipals: jest.fn().mockResolvedValue(false),
      });
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { principalType: PrincipalType.ROLE, principalId: 'editor' },
      });

      await handlers.getPrincipalGrants(req, res);

      expect(status).toHaveBeenCalledWith(403);
      expect(json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
      expect(deps.hasCapabilityForPrincipals).toHaveBeenCalledWith(
        expect.objectContaining({ capability: SystemCapabilities.READ_ROLES }),
      );
    });

    it('returns 500 on unexpected error', async () => {
      const deps = createDeps({
        getCapabilitiesForPrincipal: jest.fn().mockRejectedValue(new Error('db error')),
      });
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { principalType: PrincipalType.ROLE, principalId: 'editor' },
      });

      await handlers.getPrincipalGrants(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Failed to get grants' });
    });
  });

  describe('assignGrant', () => {
    const validBody = {
      principalType: PrincipalType.ROLE,
      principalId: 'editor',
      capability: SystemCapabilities.READ_USERS,
    };

    it('assigns a grant and returns 201', async () => {
      const grant = mockGrant();
      const deps = createDeps({ grantCapability: jest.fn().mockResolvedValue(grant) });
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status, json } = createReqRes({ body: validBody });

      await handlers.assignGrant(req, res);

      expect(deps.grantCapability).toHaveBeenCalledWith(
        expect.objectContaining({
          principalType: PrincipalType.ROLE,
          principalId: 'editor',
          capability: SystemCapabilities.READ_USERS,
        }),
      );
      expect(status).toHaveBeenCalledWith(201);
      expect(json).toHaveBeenCalledWith({ grant });
    });

    it('passes grantedBy from the authenticated user', async () => {
      const userId = new Types.ObjectId();
      const deps = createDeps();
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res } = createReqRes({ body: validBody, user: { _id: userId, role: 'admin' } });

      await handlers.assignGrant(req, res);

      expect(deps.grantCapability).toHaveBeenCalledWith(
        expect.objectContaining({ grantedBy: userId.toString() }),
      );
    });

    it('returns 400 for missing principalType', async () => {
      const deps = createDeps();
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status, json } = createReqRes({
        body: { principalId: 'editor', capability: SystemCapabilities.READ_USERS },
      });

      await handlers.assignGrant(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Invalid principal type' });
    });

    it('returns 400 for invalid principalType', async () => {
      const deps = createDeps();
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status, json } = createReqRes({
        body: { ...validBody, principalType: 'invalid' },
      });

      await handlers.assignGrant(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Invalid principal type' });
    });

    it('returns 400 for missing principalId', async () => {
      const deps = createDeps();
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status, json } = createReqRes({
        body: { principalType: PrincipalType.ROLE, capability: SystemCapabilities.READ_USERS },
      });

      await handlers.assignGrant(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'principalId is required' });
    });

    it('returns 400 for invalid capability', async () => {
      const deps = createDeps();
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status, json } = createReqRes({
        body: { ...validBody, capability: 'not:a:real:capability' },
      });

      await handlers.assignGrant(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Invalid capability' });
    });

    it('returns 400 for invalid ObjectId on group principalId', async () => {
      const deps = createDeps();
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status, json } = createReqRes({
        body: {
          principalType: PrincipalType.GROUP,
          principalId: 'not-an-objectid',
          capability: SystemCapabilities.READ_USERS,
        },
      });

      await handlers.assignGrant(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Invalid principalId format' });
    });

    it('returns 401 when user is not authenticated', async () => {
      const deps = createDeps();
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status, json } = createReqRes({ body: validBody });
      (req as unknown as Record<string, unknown>).user = undefined;

      await handlers.assignGrant(req, res);

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(deps.grantCapability).not.toHaveBeenCalled();
    });

    it('returns 403 when caller lacks manage capability', async () => {
      const deps = createDeps({
        hasCapabilityForPrincipals: jest.fn().mockResolvedValue(false),
      });
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status, json } = createReqRes({ body: validBody });

      await handlers.assignGrant(req, res);

      expect(status).toHaveBeenCalledWith(403);
      expect(deps.grantCapability).not.toHaveBeenCalled();
    });

    it('returns 403 when caller lacks the capability being granted', async () => {
      const deps = createDeps({
        hasCapabilityForPrincipals: jest.fn().mockImplementation(({ capability }) => {
          if (capability === SystemCapabilities.MANAGE_ROLES) {
            return Promise.resolve(true);
          }
          return Promise.resolve(false);
        }),
      });
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status, json } = createReqRes({ body: validBody });

      await handlers.assignGrant(req, res);

      expect(status).toHaveBeenCalledWith(403);
      expect(json).toHaveBeenCalledWith({ error: 'Cannot grant a capability you do not possess' });
      expect(deps.grantCapability).not.toHaveBeenCalled();
    });

    it('checks MANAGE_ROLES for role principal type', async () => {
      const deps = createDeps();
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res } = createReqRes({ body: validBody });

      await handlers.assignGrant(req, res);

      expect(deps.hasCapabilityForPrincipals).toHaveBeenCalledWith(
        expect.objectContaining({ capability: SystemCapabilities.MANAGE_ROLES }),
      );
    });

    it('checks MANAGE_GROUPS for group principal type', async () => {
      const deps = createDeps();
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res } = createReqRes({
        body: {
          principalType: PrincipalType.GROUP,
          principalId: validObjectId,
          capability: SystemCapabilities.READ_USERS,
        },
      });

      await handlers.assignGrant(req, res);

      expect(deps.hasCapabilityForPrincipals).toHaveBeenCalledWith(
        expect.objectContaining({ capability: SystemCapabilities.MANAGE_GROUPS }),
      );
    });

    it('checks MANAGE_USERS for user principal type', async () => {
      const deps = createDeps();
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res } = createReqRes({
        body: {
          principalType: PrincipalType.USER,
          principalId: validObjectId,
          capability: SystemCapabilities.READ_USERS,
        },
      });

      await handlers.assignGrant(req, res);

      expect(deps.hasCapabilityForPrincipals).toHaveBeenCalledWith(
        expect.objectContaining({ capability: SystemCapabilities.MANAGE_USERS }),
      );
    });

    it('returns 500 when grantCapability returns null', async () => {
      const deps = createDeps({
        grantCapability: jest.fn().mockResolvedValue(null),
      });
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status, json } = createReqRes({ body: validBody });

      await handlers.assignGrant(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Failed to create grant' });
    });

    it('returns 500 on unexpected error', async () => {
      const deps = createDeps({
        grantCapability: jest.fn().mockRejectedValue(new Error('db error')),
      });
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status, json } = createReqRes({ body: validBody });

      await handlers.assignGrant(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Failed to assign grant' });
    });
  });

  describe('revokeGrant', () => {
    const validParams = {
      principalType: PrincipalType.ROLE,
      principalId: 'editor',
      capability: SystemCapabilities.READ_USERS,
    };

    it('revokes a grant and returns 200', async () => {
      const deps = createDeps();
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: validParams });

      await handlers.revokeGrant(req, res);

      expect(deps.revokeCapability).toHaveBeenCalledWith({
        principalType: PrincipalType.ROLE,
        principalId: 'editor',
        capability: SystemCapabilities.READ_USERS,
      });
      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ success: true });
    });

    it('returns 400 for missing principalType', async () => {
      const deps = createDeps();
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: {
          principalType: '',
          principalId: 'editor',
          capability: SystemCapabilities.READ_USERS,
        },
      });

      await handlers.revokeGrant(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Invalid principal type' });
    });

    it('returns 400 for missing principalId', async () => {
      const deps = createDeps();
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: {
          principalType: PrincipalType.ROLE,
          principalId: '',
          capability: SystemCapabilities.READ_USERS,
        },
      });

      await handlers.revokeGrant(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'principalId is required' });
    });

    it('returns 400 for invalid capability', async () => {
      const deps = createDeps();
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { ...validParams, capability: 'fake' },
      });

      await handlers.revokeGrant(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Invalid capability' });
    });

    it('returns 401 when user is not authenticated', async () => {
      const deps = createDeps();
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: validParams });
      (req as unknown as Record<string, unknown>).user = undefined;

      await handlers.revokeGrant(req, res);

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(deps.revokeCapability).not.toHaveBeenCalled();
    });

    it('returns 403 when caller lacks manage capability', async () => {
      const deps = createDeps({
        hasCapabilityForPrincipals: jest.fn().mockResolvedValue(false),
      });
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: validParams });

      await handlers.revokeGrant(req, res);

      expect(status).toHaveBeenCalledWith(403);
      expect(json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
      expect(deps.revokeCapability).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid user ObjectId', async () => {
      const deps = createDeps();
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: {
          principalType: PrincipalType.USER,
          principalId: 'bad-id',
          capability: SystemCapabilities.READ_USERS,
        },
      });

      await handlers.revokeGrant(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Invalid principalId format' });
    });

    it('returns 500 on unexpected error', async () => {
      const deps = createDeps({
        revokeCapability: jest.fn().mockRejectedValue(new Error('db error')),
      });
      const handlers = createAdminGrantsHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: validParams });

      await handlers.revokeGrant(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Failed to revoke grant' });
    });
  });
});
