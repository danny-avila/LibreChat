// Mock dependencies first, before any imports
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('~/models/Group', () => ({
  getGroups: jest.fn(),
  getGroup: jest.fn(),
  createGroup: jest.fn(),
  updateGroup: jest.fn(),
  deleteGroup: jest.fn(),
  getGroupStats: jest.fn(),
}));

// Mock models/index to avoid createMethods issue
jest.mock('~/models', () => ({
  getProjects: jest.fn(),
  getGroupMembers: jest.fn(),
}));

const {
  getGroupsHandler,
  getGroupHandler,
  createGroupHandler,
  updateGroupHandler,
  deleteGroupHandler,
  getGroupStatsHandler,
} = require('./GroupController');

const {
  getGroups,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
  getGroupStats,
} = require('~/models/Group');

describe('GroupController', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      user: { id: '507f1f77bcf86cd799439011' },
      body: {},
      params: {},
      query: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe('getGroupsHandler', () => {
    it('should return paginated groups successfully', async () => {
      const mockGroups = {
        groups: [
          {
            _id: '507f1f77bcf86cd799439012',
            name: 'Test Group',
            description: 'Test Description',
            isActive: true,
            memberCount: 5,
          },
        ],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalItems: 1,
          itemsPerPage: 10,
        },
      };

      getGroups.mockResolvedValue(mockGroups);

      await getGroupsHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockGroups,
      });
      expect(getGroups).toHaveBeenCalledWith({}, {
        page: 1,
        limit: 10,
        sort: { name: 1 },
      });
    });

    it('should handle query parameters correctly', async () => {
      mockReq.query = {
        page: '2',
        limit: '5',
        search: 'test',
        isActive: 'true',
        sort: 'memberCount',
        sortOrder: 'desc',
      };

      const mockGroups = { groups: [], pagination: {} };
      getGroups.mockResolvedValue(mockGroups);

      await getGroupsHandler(mockReq, mockRes);

      expect(getGroups).toHaveBeenCalledWith(
        {
          name: { $regex: 'test', $options: 'i' },
          isActive: true,
        },
        {
          page: 2,
          limit: 5,
          sort: { memberCount: -1 },
        }
      );
    });

    it('should handle database errors', async () => {
      const error = new Error('Database connection failed');
      getGroups.mockRejectedValue(error);

      await getGroupsHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Failed to fetch groups',
      });
      expect(logger.error).toHaveBeenCalledWith('Error fetching groups:', error);
    });
  });

  describe('getGroupHandler', () => {
    it('should return single group successfully', async () => {
      const mockGroup = {
        _id: '507f1f77bcf86cd799439012',
        name: 'Test Group',
        description: 'Test Description',
        isActive: true,
        timeWindows: [],
      };

      mockReq.params.id = '507f1f77bcf86cd799439012';
      getGroup.mockResolvedValue(mockGroup);

      await getGroupHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockGroup,
      });
      expect(getGroup).toHaveBeenCalledWith({ _id: '507f1f77bcf86cd799439012' });
    });

    it('should return 404 when group not found', async () => {
      mockReq.params.id = '507f1f77bcf86cd799439012';
      getGroup.mockResolvedValue(null);

      await getGroupHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Group not found',
      });
    });

    it('should handle invalid ObjectId format', async () => {
      mockReq.params.id = 'invalid-id';

      await getGroupHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid group ID format',
      });
    });
  });

  describe('createGroupHandler', () => {
    it('should create group successfully', async () => {
      const groupData = {
        name: 'New Group',
        description: 'New Description',
        isActive: true,
      };

      const createdGroup = {
        _id: '507f1f77bcf86cd799439012',
        ...groupData,
        createdBy: '507f1f77bcf86cd799439011',
        memberCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockReq.body = groupData;
      createGroup.mockResolvedValue(createdGroup);

      await createGroupHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Group created successfully',
        data: createdGroup,
      });
      expect(createGroup).toHaveBeenCalledWith({
        ...groupData,
        createdBy: '507f1f77bcf86cd799439011',
      });
    });

    it('should return 400 when name is missing', async () => {
      mockReq.body = { description: 'Test Description' };

      await createGroupHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Group name is required',
      });
      expect(createGroup).not.toHaveBeenCalled();
    });

    it('should handle duplicate name error', async () => {
      const error = new Error('Group with this name already exists');
      mockReq.body = { name: 'Duplicate Group' };
      createGroup.mockRejectedValue(error);

      await createGroupHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Group with this name already exists',
      });
    });

    it('should handle database errors', async () => {
      const error = new Error('Database connection failed');
      mockReq.body = { name: 'Test Group' };
      createGroup.mockRejectedValue(error);

      await createGroupHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Failed to create group',
      });
    });
  });

  describe('updateGroupHandler', () => {
    it('should update group successfully', async () => {
      const updateData = {
        name: 'Updated Group',
        description: 'Updated Description',
        isActive: false,
      };

      const updatedGroup = {
        _id: '507f1f77bcf86cd799439012',
        ...updateData,
        updatedBy: '507f1f77bcf86cd799439011',
        updatedAt: new Date(),
      };

      mockReq.params.id = '507f1f77bcf86cd799439012';
      mockReq.body = updateData;
      updateGroup.mockResolvedValue(updatedGroup);

      await updateGroupHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Group updated successfully',
        data: updatedGroup,
      });
      expect(updateGroup).toHaveBeenCalledWith(
        { _id: '507f1f77bcf86cd799439012' },
        {
          ...updateData,
          updatedBy: '507f1f77bcf86cd799439011',
          updatedAt: expect.any(Date),
        }
      );
    });

    it('should return 404 when group not found for update', async () => {
      mockReq.params.id = '507f1f77bcf86cd799439012';
      mockReq.body = { name: 'Updated Name' };
      updateGroup.mockResolvedValue(null);

      await updateGroupHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Group not found',
      });
    });

    it('should handle invalid ObjectId format', async () => {
      mockReq.params.id = 'invalid-id';
      mockReq.body = { name: 'Updated Name' };

      await updateGroupHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid group ID format',
      });
    });
  });

  describe('deleteGroupHandler', () => {
    it('should delete group successfully', async () => {
      mockReq.params.id = '507f1f77bcf86cd799439012';
      deleteGroup.mockResolvedValue(true);

      await deleteGroupHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Group deleted successfully',
      });
      expect(deleteGroup).toHaveBeenCalledWith({ _id: '507f1f77bcf86cd799439012' });
    });

    it('should return 404 when group not found for deletion', async () => {
      mockReq.params.id = '507f1f77bcf86cd799439012';
      deleteGroup.mockResolvedValue(false);

      await deleteGroupHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Group not found or already deleted',
      });
    });

    it('should handle invalid ObjectId format', async () => {
      mockReq.params.id = 'invalid-id';

      await deleteGroupHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid group ID format',
      });
    });
  });

  describe('getGroupStatsHandler', () => {
    it('should return group statistics successfully', async () => {
      const mockStats = {
        totalGroups: 15,
        activeGroups: 12,
        totalMembers: 125,
        averageMembersPerGroup: 8.3,
        groupsWithTimeWindows: 7,
      };

      getGroupStats.mockResolvedValue(mockStats);

      await getGroupStatsHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockStats,
      });
      expect(getGroupStats).toHaveBeenCalled();
    });

    it('should handle database errors in stats', async () => {
      const error = new Error('Failed to fetch group statistics');
      getGroupStats.mockRejectedValue(error);

      await getGroupStatsHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Failed to fetch group statistics',
      });
      expect(logger.error).toHaveBeenCalledWith('Error fetching group stats:', error);
    });
  });

  describe('edge cases and validation', () => {
    it('should handle empty request body for create', async () => {
      mockReq.body = {};

      await createGroupHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Group name is required',
      });
    });

    it('should handle missing user context', async () => {
      mockReq.user = undefined;
      mockReq.body = { name: 'Test Group' };

      await createGroupHandler(mockReq, mockRes);

      expect(createGroup).toHaveBeenCalledWith({
        name: 'Test Group',
        isActive: true,
        createdBy: '507f1f77bcf86cd799439011', // Default fallback
      });
    });

    it('should handle extremely long group names', async () => {
      const longName = 'A'.repeat(500);
      const error = new Error('Group name too long');
      mockReq.body = { name: longName };
      createGroup.mockRejectedValue(error);

      await createGroupHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Failed to create group',
      });
    });

    it('should handle pagination edge cases', async () => {
      mockReq.query = { page: '-1', limit: '0' };
      const mockGroups = { groups: [], pagination: {} };
      getGroups.mockResolvedValue(mockGroups);

      await getGroupsHandler(mockReq, mockRes);

      expect(getGroups).toHaveBeenCalledWith({}, {
        page: 1, // Should default to 1
        limit: 10, // Should default to 10
        sort: { name: 1 },
      });
    });
  });
});