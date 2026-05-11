jest.mock('~/models', () => ({
  getRoleByName: jest.fn(),
  findMCPServerByObjectId: jest.fn(),
  getSkillById: jest.fn(),
}));

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, _res, next) => next(),
  checkBan: (_req, _res, next) => next(),
  uaParser: (_req, _res, next) => next(),
  canAccessResource: jest.fn(() => (_req, _res, next) => next()),
}));

jest.mock('~/server/middleware/checkPeoplePickerAccess', () => ({
  checkPeoplePickerAccess: jest.fn((_req, _res, next) => next()),
}));

jest.mock('~/server/middleware/roles/capabilities', () => ({
  hasCapability: jest.fn(),
}));

jest.mock('~/server/controllers/PermissionsController', () => ({
  getUserEffectivePermissions: jest.fn((_req, res) => res.json({ permissions: [] })),
  getAllEffectivePermissions: jest.fn((_req, res) => res.json({ permissions: [] })),
  updateResourcePermissions: jest.fn((_req, res) => res.json({ success: true })),
  getResourcePermissions: jest.fn((_req, res) => res.json({ permissions: [] })),
  getResourceRoles: jest.fn((_req, res) => res.json({ roles: [] })),
  searchPrincipals: jest.fn((_req, res) => res.json({ principals: [] })),
}));

const express = require('express');
const request = require('supertest');
const {
  SystemRoles,
  ResourceType,
  AccessRoleIds,
  PrincipalType,
  PermissionBits,
  PermissionTypes,
  Permissions,
} = require('librechat-data-provider');

const { getRoleByName } = require('~/models');
const { canAccessResource } = require('~/server/middleware');
const { hasCapability } = require('~/server/middleware/roles/capabilities');
const { updateResourcePermissions } = require('~/server/controllers/PermissionsController');
const accessPermissionsRouter = require('./accessPermissions');

describe('Access permissions share policy', () => {
  let app;

  const skillResourceId = '507f1f77bcf86cd799439011';
  const updatedPrincipal = {
    type: PrincipalType.USER,
    id: 'target-user',
    accessRoleId: AccessRoleIds.SKILL_VIEWER,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    hasCapability.mockResolvedValue(false);

    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: 'skill-owner', role: SystemRoles.USER };
      next();
    });
    app.use('/api/permissions', accessPermissionsRouter);
  });

  it('blocks non-public skill sharing when ACL SHARE passes but role SKILLS.SHARE is disabled', async () => {
    getRoleByName.mockResolvedValue({
      permissions: {
        [PermissionTypes.SKILLS]: {
          [Permissions.SHARE]: false,
          [Permissions.SHARE_PUBLIC]: false,
        },
      },
    });

    const response = await request(app)
      .put(`/api/permissions/${ResourceType.SKILL}/${skillResourceId}`)
      .send({ updated: [updatedPrincipal], public: false });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'Forbidden',
      message: `You do not have permission to share ${ResourceType.SKILL} resources`,
    });
    expect(canAccessResource).toHaveBeenCalledWith({
      resourceType: ResourceType.SKILL,
      requiredPermission: PermissionBits.SHARE,
      resourceIdParam: 'resourceId',
      idResolver: expect.any(Function),
    });
    expect(updateResourcePermissions).not.toHaveBeenCalled();
  });

  it('allows non-public skill sharing when both ACL SHARE and role SKILLS.SHARE pass', async () => {
    getRoleByName.mockResolvedValue({
      permissions: {
        [PermissionTypes.SKILLS]: {
          [Permissions.SHARE]: true,
          [Permissions.SHARE_PUBLIC]: false,
        },
      },
    });

    const response = await request(app)
      .put(`/api/permissions/${ResourceType.SKILL}/${skillResourceId}`)
      .send({ updated: [updatedPrincipal], public: false });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(updateResourcePermissions).toHaveBeenCalledTimes(1);
  });

  it('preserves resource management capability bypass for non-public skill sharing', async () => {
    hasCapability.mockResolvedValue(true);

    const response = await request(app)
      .put(`/api/permissions/${ResourceType.SKILL}/${skillResourceId}`)
      .send({ updated: [updatedPrincipal], public: false });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(getRoleByName).not.toHaveBeenCalled();
    expect(updateResourcePermissions).toHaveBeenCalledTimes(1);
  });

  it('still requires SHARE_PUBLIC when enabling public skill sharing', async () => {
    getRoleByName.mockResolvedValue({
      permissions: {
        [PermissionTypes.SKILLS]: {
          [Permissions.SHARE]: true,
          [Permissions.SHARE_PUBLIC]: false,
        },
      },
    });

    const response = await request(app)
      .put(`/api/permissions/${ResourceType.SKILL}/${skillResourceId}`)
      .send({ public: true, publicAccessRoleId: AccessRoleIds.SKILL_VIEWER });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'Forbidden',
      message: `You do not have permission to share ${ResourceType.SKILL} resources publicly`,
    });
    expect(updateResourcePermissions).not.toHaveBeenCalled();
  });
});
