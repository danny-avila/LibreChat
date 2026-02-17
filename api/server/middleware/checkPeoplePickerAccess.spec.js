const { logger } = require('@librechat/data-schemas');
const { PrincipalType, PermissionTypes, Permissions } = require('librechat-data-provider');
const { checkPeoplePickerAccess } = require('./checkPeoplePickerAccess');
const { getRoleByName } = require('~/models');

jest.mock('~/models');
jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: {
    error: jest.fn(),
  },
}));

describe('checkPeoplePickerAccess', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      user: { id: 'user123', role: 'USER' },
      query: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('should return 401 if user is not authenticated', async () => {
    req.user = null;

    await checkPeoplePickerAccess(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 if role has no permissions', async () => {
    getRoleByName.mockResolvedValue(null);

    await checkPeoplePickerAccess(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Forbidden',
      message: 'No permissions configured for user role',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should allow access when searching for users with VIEW_USERS permission', async () => {
    req.query.type = PrincipalType.USER;
    getRoleByName.mockResolvedValue({
      permissions: {
        [PermissionTypes.PEOPLE_PICKER]: {
          [Permissions.VIEW_USERS]: true,
          [Permissions.VIEW_GROUPS]: false,
          [Permissions.VIEW_ROLES]: false,
        },
      },
    });

    await checkPeoplePickerAccess(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should deny access when searching for users without VIEW_USERS permission', async () => {
    req.query.type = PrincipalType.USER;
    getRoleByName.mockResolvedValue({
      permissions: {
        [PermissionTypes.PEOPLE_PICKER]: {
          [Permissions.VIEW_USERS]: false,
          [Permissions.VIEW_GROUPS]: true,
          [Permissions.VIEW_ROLES]: true,
        },
      },
    });

    await checkPeoplePickerAccess(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Forbidden',
      message: 'Insufficient permissions to search for users',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should allow access when searching for groups with VIEW_GROUPS permission', async () => {
    req.query.type = PrincipalType.GROUP;
    getRoleByName.mockResolvedValue({
      permissions: {
        [PermissionTypes.PEOPLE_PICKER]: {
          [Permissions.VIEW_USERS]: false,
          [Permissions.VIEW_GROUPS]: true,
          [Permissions.VIEW_ROLES]: false,
        },
      },
    });

    await checkPeoplePickerAccess(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should deny access when searching for groups without VIEW_GROUPS permission', async () => {
    req.query.type = PrincipalType.GROUP;
    getRoleByName.mockResolvedValue({
      permissions: {
        [PermissionTypes.PEOPLE_PICKER]: {
          [Permissions.VIEW_USERS]: true,
          [Permissions.VIEW_GROUPS]: false,
          [Permissions.VIEW_ROLES]: true,
        },
      },
    });

    await checkPeoplePickerAccess(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Forbidden',
      message: 'Insufficient permissions to search for groups',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should allow access when searching for roles with VIEW_ROLES permission', async () => {
    req.query.type = PrincipalType.ROLE;
    getRoleByName.mockResolvedValue({
      permissions: {
        [PermissionTypes.PEOPLE_PICKER]: {
          [Permissions.VIEW_USERS]: false,
          [Permissions.VIEW_GROUPS]: false,
          [Permissions.VIEW_ROLES]: true,
        },
      },
    });

    await checkPeoplePickerAccess(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should deny access when searching for roles without VIEW_ROLES permission', async () => {
    req.query.type = PrincipalType.ROLE;
    getRoleByName.mockResolvedValue({
      permissions: {
        [PermissionTypes.PEOPLE_PICKER]: {
          [Permissions.VIEW_USERS]: true,
          [Permissions.VIEW_GROUPS]: true,
          [Permissions.VIEW_ROLES]: false,
        },
      },
    });

    await checkPeoplePickerAccess(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Forbidden',
      message: 'Insufficient permissions to search for roles',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should allow mixed search when user has at least one permission', async () => {
    // No type specified = mixed search
    req.query.type = undefined;
    getRoleByName.mockResolvedValue({
      permissions: {
        [PermissionTypes.PEOPLE_PICKER]: {
          [Permissions.VIEW_USERS]: false,
          [Permissions.VIEW_GROUPS]: false,
          [Permissions.VIEW_ROLES]: true,
        },
      },
    });

    await checkPeoplePickerAccess(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should deny mixed search when user has no permissions', async () => {
    // No type specified = mixed search
    req.query.type = undefined;
    getRoleByName.mockResolvedValue({
      permissions: {
        [PermissionTypes.PEOPLE_PICKER]: {
          [Permissions.VIEW_USERS]: false,
          [Permissions.VIEW_GROUPS]: false,
          [Permissions.VIEW_ROLES]: false,
        },
      },
    });

    await checkPeoplePickerAccess(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Forbidden',
      message: 'Insufficient permissions to search for users, groups, or roles',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should handle errors gracefully', async () => {
    const error = new Error('Database error');
    getRoleByName.mockRejectedValue(error);

    await checkPeoplePickerAccess(req, res, next);

    expect(logger.error).toHaveBeenCalledWith(
      '[checkPeoplePickerAccess][user123] checkPeoplePickerAccess error for req.query.type = undefined',
      error,
    );
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Internal Server Error',
      message: 'Failed to check permissions',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should handle missing permissions object gracefully', async () => {
    req.query.type = PrincipalType.USER;
    getRoleByName.mockResolvedValue({
      permissions: {}, // No PEOPLE_PICKER permissions
    });

    await checkPeoplePickerAccess(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Forbidden',
      message: 'Insufficient permissions to search for users',
    });
    expect(next).not.toHaveBeenCalled();
  });
});
