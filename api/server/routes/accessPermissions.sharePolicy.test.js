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

const { updateResourcePermissions } = require('~/server/controllers/PermissionsController');
const { hasCapability } = require('~/server/middleware/roles/capabilities');
const { canAccessResource } = require('~/server/middleware');
const accessPermissionsRouter = require('./accessPermissions');
const { getRoleByName } = require('~/models');

describe('Access permissions share policy', () => {
  let app;

  const resourceId = '507f1f77bcf86cd799439011';
  const sharePolicyCases = [
    {
      label: 'agent',
      resourceType: ResourceType.AGENT,
      permissionType: PermissionTypes.AGENTS,
      accessRoleId: AccessRoleIds.AGENT_VIEWER,
      middlewareOptions: {
        resourceType: ResourceType.AGENT,
        requiredPermission: PermissionBits.SHARE,
        resourceIdParam: 'resourceId',
      },
    },
    {
      label: 'prompt group',
      resourceType: ResourceType.PROMPTGROUP,
      permissionType: PermissionTypes.PROMPTS,
      accessRoleId: AccessRoleIds.PROMPTGROUP_VIEWER,
      middlewareOptions: {
        resourceType: ResourceType.PROMPTGROUP,
        requiredPermission: PermissionBits.SHARE,
        resourceIdParam: 'resourceId',
      },
    },
    {
      label: 'MCP server',
      resourceType: ResourceType.MCPSERVER,
      permissionType: PermissionTypes.MCP_SERVERS,
      accessRoleId: AccessRoleIds.MCPSERVER_VIEWER,
      middlewareOptions: {
        resourceType: ResourceType.MCPSERVER,
        requiredPermission: PermissionBits.SHARE,
        resourceIdParam: 'resourceId',
        idResolver: expect.any(Function),
      },
    },
    {
      label: 'remote agent',
      resourceType: ResourceType.REMOTE_AGENT,
      permissionType: PermissionTypes.REMOTE_AGENTS,
      accessRoleId: AccessRoleIds.REMOTE_AGENT_VIEWER,
      middlewareOptions: {
        resourceType: ResourceType.REMOTE_AGENT,
        requiredPermission: PermissionBits.SHARE,
        resourceIdParam: 'resourceId',
      },
    },
    {
      label: 'skill',
      resourceType: ResourceType.SKILL,
      permissionType: PermissionTypes.SKILLS,
      accessRoleId: AccessRoleIds.SKILL_VIEWER,
      middlewareOptions: {
        resourceType: ResourceType.SKILL,
        requiredPermission: PermissionBits.SHARE,
        resourceIdParam: 'resourceId',
        idResolver: expect.any(Function),
      },
    },
  ];

  const createUpdatedPrincipal = (accessRoleId) => ({
    type: PrincipalType.USER,
    id: 'target-user',
    accessRoleId,
  });

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

  it.each(sharePolicyCases)(
    'blocks non-public $label sharing when ACL SHARE passes but role SHARE is disabled',
    async ({ resourceType, permissionType, accessRoleId, middlewareOptions }) => {
      getRoleByName.mockResolvedValue({
        permissions: {
          [permissionType]: {
            [Permissions.SHARE]: false,
            [Permissions.SHARE_PUBLIC]: false,
          },
        },
      });

      const response = await request(app)
        .put(`/api/permissions/${resourceType}/${resourceId}`)
        .send({ updated: [createUpdatedPrincipal(accessRoleId)], public: false });

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error: 'Forbidden',
        message: `You do not have permission to share ${resourceType} resources`,
      });
      expect(canAccessResource).toHaveBeenCalledWith(middlewareOptions);
      expect(updateResourcePermissions).not.toHaveBeenCalled();
    },
  );

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
      .put(`/api/permissions/${ResourceType.SKILL}/${resourceId}`)
      .send({ updated: [createUpdatedPrincipal(AccessRoleIds.SKILL_VIEWER)], public: false });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(updateResourcePermissions).toHaveBeenCalledTimes(1);
  });

  it('preserves resource management capability bypass for non-public skill sharing', async () => {
    hasCapability.mockResolvedValue(true);

    const response = await request(app)
      .put(`/api/permissions/${ResourceType.SKILL}/${resourceId}`)
      .send({ updated: [createUpdatedPrincipal(AccessRoleIds.SKILL_VIEWER)], public: false });

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
      .put(`/api/permissions/${ResourceType.SKILL}/${resourceId}`)
      .send({ public: true, publicAccessRoleId: AccessRoleIds.SKILL_VIEWER });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'Forbidden',
      message: `You do not have permission to share ${ResourceType.SKILL} resources publicly`,
    });
    expect(updateResourcePermissions).not.toHaveBeenCalled();
  });
});
