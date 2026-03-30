// Mock logger first
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock mongoose models
const mockGroup = {
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOneAndUpdate: jest.fn(),
  countDocuments: jest.fn(),
  deleteOne: jest.fn(),
  aggregate: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
};

const mockUser = {
  findById: jest.fn(),
};

jest.mock('~/db/models', () => ({
  Group: mockGroup,
  User: mockUser,
}));

const { logger } = require('@librechat/data-schemas');
const {
  getGroups,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
  getGroupStats,
  getUserGroups,
} = require('./Group');

describe('Group Model Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getGroups', () => {
    it('should return paginated groups successfully', async () => {
      const mockGroups = [
        { _id: '1', name: 'Group 1', description: 'First group' },
        { _id: '2', name: 'Group 2', description: 'Second group' },
      ];

      // Mock the chain of mongoose methods
      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockGroups),
      };

      mockGroup.find.mockReturnValue(mockQuery);
      mockGroup.countDocuments.mockResolvedValue(3);

      const result = await getGroups({}, { page: 1, limit: 2 });

      expect(result.groups).toEqual(mockGroups);
      expect(result.pagination.totalItems).toBe(3);
      expect(result.pagination.totalPages).toBe(2);
      expect(result.pagination.currentPage).toBe(1);
      expect(mockGroup.find).toHaveBeenCalledWith({});
    });

    it('should handle Group model not available', async () => {
      // Mock models to return null Group
      jest.doMock('~/db/models', () => ({ Group: null }), { virtual: true });
      
      const result = await getGroups({});

      expect(result.groups).toHaveLength(0);
      expect(result.pagination.totalItems).toBe(0);
      expect(logger.warn).toHaveBeenCalledWith('Group model not available, returning empty result');
    });

    it('should handle database errors', async () => {
      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockRejectedValue(new Error('DB Error')),
      };

      mockGroup.find.mockReturnValue(mockQuery);
      mockGroup.countDocuments.mockResolvedValue(0);

      await expect(getGroups({})).rejects.toThrow('Failed to fetch groups');
      expect(logger.error).toHaveBeenCalledWith('Error in getGroups:', expect.any(Error));
    });
  });

  describe('getGroup', () => {
    it('should return single group successfully', async () => {
      const mockGroup = { _id: '1', name: 'Test Group', description: 'Test Description' };

      const mockQuery = {
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockGroup),
      };

      require('~/db/models').Group.findOne.mockReturnValue(mockQuery);

      const result = await getGroup({ _id: '1' });

      expect(result).toEqual(mockGroup);
      expect(require('~/db/models').Group.findOne).toHaveBeenCalledWith({ _id: '1' });
    });

    it('should return null when group not found', async () => {
      const mockQuery = {
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      };

      require('~/db/models').Group.findOne.mockReturnValue(mockQuery);

      const result = await getGroup({ _id: 'nonexistent' });

      expect(result).toBeNull();
    });

    it('should handle Group model not available', async () => {
      // Temporarily mock Group as null
      const originalGroup = require('~/db/models').Group;
      require('~/db/models').Group = null;

      const result = await getGroup({ _id: 'test' });

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith('Group model not available, returning null');

      // Restore mock
      require('~/db/models').Group = originalGroup;
    });
  });

  describe('createGroup', () => {
    it('should create group successfully', async () => {
      const groupData = { name: 'New Group', description: 'New Description' };
      const savedGroup = { _id: '123', ...groupData };
      const populatedGroup = { ...savedGroup, createdBy: { name: 'User' } };

      const mockGroupInstance = {
        save: jest.fn().mockResolvedValue(savedGroup),
      };

      const mockQuery = {
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(populatedGroup),
      };

      // Mock Group constructor
      jest.doMock('~/db/models', () => ({
        Group: jest.fn().mockImplementation(() => mockGroupInstance),
      }), { virtual: true });

      require('~/db/models').Group.findById = jest.fn().mockReturnValue(mockQuery);

      const result = await createGroup(groupData);

      expect(result).toEqual(populatedGroup);
    });

    it('should handle duplicate name error', async () => {
      const groupData = { name: 'Duplicate Group' };
      const mockGroupInstance = {
        save: jest.fn().mockRejectedValue({ code: 11000 }),
      };

      jest.doMock('~/db/models', () => ({
        Group: jest.fn().mockImplementation(() => mockGroupInstance),
      }), { virtual: true });

      await expect(createGroup(groupData)).rejects.toThrow('Group with this name already exists');
      expect(logger.error).toHaveBeenCalledWith('Error in createGroup:', expect.any(Error));
    });

    it('should handle Group model not available', async () => {
      jest.doMock('~/db/models', () => ({ Group: null }), { virtual: true });

      await expect(createGroup({ name: 'Test' })).rejects.toThrow('Group model not available');
      expect(logger.warn).toHaveBeenCalledWith('Group model not available, cannot create group');
    });
  });

  describe('updateGroup', () => {
    it('should update group successfully', async () => {
      const updateData = { name: 'Updated Group' };
      const updatedGroup = { _id: '1', ...updateData };

      const mockQuery = {
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(updatedGroup),
      };

      require('~/db/models').Group.findOneAndUpdate.mockReturnValue(mockQuery);

      const result = await updateGroup({ _id: '1' }, updateData);

      expect(result).toEqual(updatedGroup);
      expect(require('~/db/models').Group.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: '1' },
        { $set: updateData },
        expect.objectContaining({ new: true, runValidators: true })
      );
    });

    it('should return null when group not found for update', async () => {
      const mockQuery = {
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      };

      require('~/db/models').Group.findOneAndUpdate.mockReturnValue(mockQuery);

      const result = await updateGroup({ _id: 'nonexistent' }, { name: 'Updated' });

      expect(result).toBeNull();
    });
  });

  describe('deleteGroup', () => {
    it('should delete group successfully', async () => {
      require('~/db/models').Group.deleteOne.mockResolvedValue({ deletedCount: 1 });

      const result = await deleteGroup({ _id: '1' });

      expect(result).toBe(true);
      expect(require('~/db/models').Group.deleteOne).toHaveBeenCalledWith({ _id: '1' });
    });

    it('should return false when group not found for deletion', async () => {
      require('~/db/models').Group.deleteOne.mockResolvedValue({ deletedCount: 0 });

      const result = await deleteGroup({ _id: 'nonexistent' });

      expect(result).toBe(false);
    });
  });

  describe('getGroupStats', () => {
    it('should return group statistics successfully', async () => {
      const mockAggregateResult = [{ _id: null, totalMembers: 15, avgMembersPerGroup: 5.0 }];

      require('~/db/models').Group.countDocuments.mockImplementation((filter) => {
        if (filter === undefined || Object.keys(filter).length === 0) return Promise.resolve(3);
        if (filter.isActive === true) return Promise.resolve(2);
        if (filter['timeWindows.0']) return Promise.resolve(1);
        return Promise.resolve(0);
      });

      require('~/db/models').Group.aggregate.mockResolvedValue(mockAggregateResult);

      const result = await getGroupStats();

      expect(result).toEqual({
        totalGroups: 3,
        activeGroups: 2,
        totalMembers: 15,
        averageMembersPerGroup: 5.0,
        groupsWithTimeWindows: 1,
      });
    });

    it('should handle empty database', async () => {
      require('~/db/models').Group.countDocuments.mockResolvedValue(0);
      require('~/db/models').Group.aggregate.mockResolvedValue([]);

      const result = await getGroupStats();

      expect(result.totalGroups).toBe(0);
      expect(result.activeGroups).toBe(0);
      expect(result.totalMembers).toBe(0);
      expect(result.averageMembersPerGroup).toBe(0);
    });

    it('should handle Group model not available', async () => {
      jest.doMock('~/db/models', () => ({ Group: null }), { virtual: true });

      await expect(getGroupStats()).rejects.toThrow('Group model not available');
      expect(logger.warn).toHaveBeenCalledWith('Group model not available');
    });
  });

  describe('getUserGroups', () => {
    it('should return user groups successfully', async () => {
      const mockUser = {
        groupMemberships: [
          {
            groupId: { _id: '1', name: 'Group 1', isActive: true },
            assignedAt: new Date(),
            assignedBy: 'admin',
          },
        ],
      };

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockUser),
      };

      mockUser.findById.mockReturnValue(mockQuery);

      const result = await getUserGroups('userId');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Group 1');
    });

    it('should return empty array when user not found', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      };

      mockUser.findById.mockReturnValue(mockQuery);

      const result = await getUserGroups('nonexistent');

      expect(result).toHaveLength(0);
    });

    it('should filter out null group references', async () => {
      const mockUser = {
        groupMemberships: [
          { groupId: { _id: '1', name: 'Group 1' }, assignedAt: new Date() },
          { groupId: null, assignedAt: new Date() },
        ],
      };

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockUser),
      };

      mockUser.findById.mockReturnValue(mockQuery);

      const result = await getUserGroups('userId');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Group 1');
    });
  });
});