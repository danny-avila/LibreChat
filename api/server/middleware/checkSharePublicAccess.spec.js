const { ResourceType, PermissionTypes, Permissions } = require('librechat-data-provider');
const { checkSharePublicAccess } = require('./checkSharePublicAccess');
const { getRoleByName } = require('~/models');

jest.mock('~/models');

describe('checkSharePublicAccess middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      user: { id: 'user123', role: 'USER' },
      params: { resourceType: ResourceType.AGENT },
      body: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
  });

  it('should call next() when public is not true', async () => {
    mockReq.body = { public: false };

    await checkSharePublicAccess(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('should call next() when public is undefined', async () => {
    mockReq.body = { updated: [] };

    await checkSharePublicAccess(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('should return 401 when user is not authenticated', async () => {
    mockReq.body = { public: true };
    mockReq.user = null;

    await checkSharePublicAccess(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should return 403 when user role has no SHARE_PUBLIC permission for agents', async () => {
    mockReq.body = { public: true };
    mockReq.params = { resourceType: ResourceType.AGENT };
    getRoleByName.mockResolvedValue({
      permissions: {
        [PermissionTypes.AGENTS]: {
          [Permissions.SHARE]: true,
          [Permissions.SHARE_PUBLIC]: false,
        },
      },
    });

    await checkSharePublicAccess(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Forbidden',
      message: `You do not have permission to share ${ResourceType.AGENT} resources publicly`,
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should call next() when user has SHARE_PUBLIC permission for agents', async () => {
    mockReq.body = { public: true };
    mockReq.params = { resourceType: ResourceType.AGENT };
    getRoleByName.mockResolvedValue({
      permissions: {
        [PermissionTypes.AGENTS]: {
          [Permissions.SHARE]: true,
          [Permissions.SHARE_PUBLIC]: true,
        },
      },
    });

    await checkSharePublicAccess(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('should check prompts permission for promptgroup resource type', async () => {
    mockReq.body = { public: true };
    mockReq.params = { resourceType: ResourceType.PROMPTGROUP };
    getRoleByName.mockResolvedValue({
      permissions: {
        [PermissionTypes.PROMPTS]: {
          [Permissions.SHARE_PUBLIC]: true,
        },
      },
    });

    await checkSharePublicAccess(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  it('should check mcp_servers permission for mcpserver resource type', async () => {
    mockReq.body = { public: true };
    mockReq.params = { resourceType: ResourceType.MCPSERVER };
    getRoleByName.mockResolvedValue({
      permissions: {
        [PermissionTypes.MCP_SERVERS]: {
          [Permissions.SHARE_PUBLIC]: true,
        },
      },
    });

    await checkSharePublicAccess(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  it('should return 400 for unsupported resource type', async () => {
    mockReq.body = { public: true };
    mockReq.params = { resourceType: 'unsupported' };

    await checkSharePublicAccess(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Bad Request',
      message: 'Unsupported resource type for public sharing: unsupported',
    });
  });

  it('should return 403 when role has no permissions object', async () => {
    mockReq.body = { public: true };
    getRoleByName.mockResolvedValue({ permissions: null });

    await checkSharePublicAccess(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
  });

  it('should return 500 on error', async () => {
    mockReq.body = { public: true };
    getRoleByName.mockRejectedValue(new Error('Database error'));

    await checkSharePublicAccess(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Internal Server Error',
      message: 'Failed to check public sharing permissions',
    });
  });
});
