const { logger } = require('@librechat/data-schemas');
const { Transaction, Balance, User, Group } = require('~/db/models');
const { SystemRoles } = require('librechat-data-provider');
const {
  getGroupLeaderboard,
  getGroupStatistics,
  getGroupMemberStatistics
} = require('./GroupStatisticsController');

// Mock dependencies
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn()
  }
}));

jest.mock('~/db/models', () => ({
  Transaction: {
    aggregate: jest.fn(),
    find: jest.fn()
  },
  Balance: {
    find: jest.fn()
  },
  User: {
    countDocuments: jest.fn()
  },
  Group: {
    find: jest.fn(),
    findById: jest.fn()
  }
}));

describe('GroupStatisticsController', () => {
  let req, res;

  beforeEach(() => {
    req = {
      user: { role: SystemRoles.ADMIN },
      query: {},
      params: {}
    };
    res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('getGroupLeaderboard', () => {
    it('should return group leaderboard successfully', async () => {
      // Mock data
      const mockGroups = [
        {
          _id: 'group1',
          name: 'Test Group 1',
          description: 'Test description',
          isActive: true,
          members: ['user1', 'user2'],
          timeWindows: []
        }
      ];

      const mockGroupStats = [
        {
          _id: 'group1',
          groupName: 'Test Group 1',
          memberCount: 2,
          totalTokens: 1000,
          promptTokens: 600,
          completionTokens: 400,
          totalCost: 0.05,
          lastActivity: new Date('2024-01-01'),
          conversationCount: 5,
          activeMemberCount: 2
        }
      ];

      const mockBalances = [
        { tokenCredits: 5000 },
        { tokenCredits: 3000 }
      ];

      const mockSummaryData = [
        {
          totalTokensUsed: 1000,
          totalCost: 0.05,
          uniqueUsers: ['user1', 'user2']
        }
      ];

      // Setup mocks
      Group.find.mockResolvedValue(mockGroups);
      Transaction.aggregate
        .mockResolvedValueOnce(mockGroupStats) // Main aggregation
        .mockResolvedValueOnce([{ total: 1 }]) // Count aggregation
        .mockResolvedValueOnce(mockSummaryData); // Summary aggregation
      Balance.find.mockResolvedValue(mockBalances);
      User.countDocuments.mockResolvedValue(2);

      req.query = {
        page: '1',
        limit: '20',
        sortBy: 'totalTokens',
        sortOrder: 'desc'
      };

      await getGroupLeaderboard(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          groups: expect.arrayContaining([
            expect.objectContaining({
              groupName: 'Test Group 1',
              totalTokens: 1000,
              rank: 1,
              groupBalance: 8000,
              averageBalance: 4000,
              membersWithLowBalance: 0
            })
          ]),
          pagination: {
            currentPage: 1,
            totalPages: 1,
            totalGroups: 1,
            groupsPerPage: 20
          },
          summary: {
            totalGroups: 1,
            totalMembers: 2,
            totalTokensUsed: 1000,
            averageGroupSize: 2,
            mostActiveGroup: 'Test Group 1'
          }
        }
      });
    });

    it('should return 403 for non-admin users', async () => {
      req.user.role = SystemRoles.USER;

      await getGroupLeaderboard(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'Admin role required to access group statistics'
        }
      });
    });

    it('should return empty result when no groups exist', async () => {
      Group.find.mockResolvedValue([]);

      await getGroupLeaderboard(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          groups: [],
          pagination: {
            currentPage: 1,
            totalPages: 0,
            totalGroups: 0,
            groupsPerPage: 20
          },
          summary: {
            totalGroups: 0,
            totalMembers: 0,
            totalTokensUsed: 0,
            averageGroupSize: 0,
            mostActiveGroup: null
          }
        }
      });
    });

    it('should handle database errors gracefully', async () => {
      const error = new Error('Database connection failed');
      Group.find.mockRejectedValue(error);

      await getGroupLeaderboard(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate group leaderboard',
          details: 'Database connection failed'
        }
      });
      expect(logger.error).toHaveBeenCalled();
    });

    it('should apply date filters correctly', async () => {
      req.query = {
        dateFrom: '2024-01-01',
        dateTo: '2024-01-31'
      };

      Group.find.mockResolvedValue([]);
      
      await getGroupLeaderboard(req, res);

      // Verify that Transaction.aggregate was called with date filter
      expect(Transaction.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $match: {
              createdAt: {
                $gte: new Date('2024-01-01'),
                $lte: new Date('2024-01-31')
              }
            }
          })
        ])
      );
    });

    it('should filter by minimum members', async () => {
      req.query = { minMembers: '5' };
      
      Group.find.mockResolvedValue([]);
      
      await getGroupLeaderboard(req, res);

      // Verify minMembers filter was applied
      expect(Transaction.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $match: { memberCount: { $gte: 5 } }
          })
        ])
      );
    });
  });

  describe('getGroupStatistics', () => {
    it('should return detailed group statistics', async () => {
      const groupId = 'group1';
      const mockGroup = {
        _id: groupId,
        name: 'Test Group',
        description: 'Test description',
        members: ['user1', 'user2'],
        isActive: true,
        timeWindows: [
          { name: 'Business Hours', windowType: 'daily', isActive: true }
        ]
      };

      const mockUsageStats = [
        {
          promptTokens: 600,
          completionTokens: 400,
          totalTokens: 1000,
          totalCost: 0.05,
          conversationCount: 10,
          activeMemberCount: 2
        }
      ];

      const mockMemberUsage = [
        {
          userId: 'user1',
          email: 'user1@test.com',
          tokens: 600,
          cost: 0.03,
          balance: 5000,
          lastActivity: new Date('2024-01-01'),
          percentageOfGroup: 60
        }
      ];

      const mockBalances = [
        { tokenCredits: 5000 },
        { tokenCredits: 3000 }
      ];

      const mockTopModels = [
        {
          model: 'gpt-4',
          usage: 800,
          cost: 0.04,
          percentage: 80
        }
      ];

      Group.findById.mockResolvedValue(mockGroup);
      Transaction.aggregate
        .mockResolvedValueOnce(mockUsageStats) // Usage stats
        .mockResolvedValueOnce(mockMemberUsage) // Member usage
        .mockResolvedValueOnce([{ tokens: 500, cost: 0.025 }]) // This month
        .mockResolvedValueOnce([{ tokens: 400, cost: 0.02 }]) // Last month
        .mockResolvedValueOnce(mockTopModels); // Top models
      Balance.find.mockResolvedValue(mockBalances);

      req.params = { groupId };

      await getGroupStatistics(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          groupId,
          groupName: 'Test Group',
          memberCount: 2,
          isActive: true,
          totalUsage: expect.objectContaining({
            totalTokens: 1000,
            totalCost: 0.05
          }),
          groupBalance: expect.objectContaining({
            totalBalance: 8000,
            averageBalance: 4000
          }),
          topModels: mockTopModels,
          timeWindows: expect.arrayContaining([
            expect.objectContaining({
              name: 'Business Hours',
              isActive: true
            })
          ])
        })
      });
    });

    it('should return 404 for non-existent group', async () => {
      Group.findById.mockResolvedValue(null);
      req.params = { groupId: 'nonexistent' };

      await getGroupStatistics(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'GROUP_NOT_FOUND',
          message: 'Group not found'
        }
      });
    });

    it('should return 403 for non-admin users', async () => {
      req.user.role = SystemRoles.USER;
      req.params = { groupId: 'group1' };

      await getGroupStatistics(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'Admin role required to access group statistics'
        }
      });
    });

    it('should calculate period comparison correctly', async () => {
      const mockGroup = {
        _id: 'group1',
        name: 'Test Group',
        members: ['user1'],
        isActive: true,
        timeWindows: []
      };

      Group.findById.mockResolvedValue(mockGroup);
      Transaction.aggregate
        .mockResolvedValueOnce([]) // Usage stats
        .mockResolvedValueOnce([]) // Member usage
        .mockResolvedValueOnce([{ tokens: 600, cost: 0.03 }]) // This month
        .mockResolvedValueOnce([{ tokens: 400, cost: 0.02 }]) // Last month
        .mockResolvedValueOnce([]); // Top models
      Balance.find.mockResolvedValue([]);

      req.params = { groupId: 'group1' };

      await getGroupStatistics(req, res);

      const response = res.json.mock.calls[0][0];
      expect(response.data.periodComparison.growth).toBe('+50.0%');
    });
  });

  describe('getGroupMemberStatistics', () => {
    it('should return group member statistics with pagination', async () => {
      const groupId = 'group1';
      const mockGroup = {
        _id: groupId,
        name: 'Test Group',
        members: ['user1', 'user2']
      };

      const mockMemberStats = [
        {
          userId: 'user1',
          email: 'user1@test.com',
          tokens: 600,
          promptTokens: 300,
          completionTokens: 300,
          cost: 0.03,
          balance: 5000,
          lastActivity: new Date('2024-01-01'),
          conversationCount: 5,
          percentageOfGroup: 60,
          rank: 1
        }
      ];

      const mockGroupTotal = [{ totalTokens: 1000 }];

      Group.findById.mockResolvedValue(mockGroup);
      Transaction.aggregate
        .mockResolvedValueOnce(mockGroupTotal) // Group total
        .mockResolvedValueOnce(mockMemberStats); // Member stats

      req.params = { groupId };
      req.query = { page: '1', limit: '50' };

      await getGroupMemberStatistics(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          groupId,
          groupName: 'Test Group',
          members: expect.arrayContaining([
            expect.objectContaining({
              userId: 'user1',
              email: 'user1@test.com',
              tokens: 600,
              rank: 1
            })
          ]),
          groupTotals: {
            totalTokens: 1000,
            totalMembers: 2,
            averagePerMember: 500
          },
          pagination: {
            currentPage: 1,
            totalPages: 1,
            totalMembers: 2,
            membersPerPage: 50
          }
        }
      });
    });

    it('should handle sorting correctly', async () => {
      const mockGroup = { _id: 'group1', name: 'Test Group', members: [] };
      Group.findById.mockResolvedValue(mockGroup);
      Transaction.aggregate
        .mockResolvedValueOnce([{ totalTokens: 0 }])
        .mockResolvedValueOnce([]);

      req.params = { groupId: 'group1' };
      req.query = { sortBy: 'balance', sortOrder: 'asc' };

      await getGroupMemberStatistics(req, res);

      // Verify sort object was applied correctly
      expect(Transaction.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $sort: { 'balance.tokenCredits': 1 }
          })
        ])
      );
    });

    it('should return 404 for non-existent group', async () => {
      Group.findById.mockResolvedValue(null);
      req.params = { groupId: 'nonexistent' };

      await getGroupMemberStatistics(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'GROUP_NOT_FOUND',
          message: 'Group not found'
        }
      });
    });

    it('should validate pagination parameters', async () => {
      const mockGroup = { _id: 'group1', name: 'Test Group', members: [] };
      Group.findById.mockResolvedValue(mockGroup);
      Transaction.aggregate.mockResolvedValue([]).mockResolvedValue([]);

      req.params = { groupId: 'group1' };
      req.query = { page: '0', limit: '200' }; // Invalid values

      await getGroupMemberStatistics(req, res);

      // Should clamp values to valid ranges
      const aggregateCall = Transaction.aggregate.mock.calls.find(call => 
        call[0].some(stage => stage.$skip !== undefined)
      );
      const skipStage = aggregateCall[0].find(stage => stage.$skip !== undefined);
      const limitStage = aggregateCall[0].find(stage => stage.$limit !== undefined);
      
      expect(skipStage.$skip).toBe(0); // page 1 = skip 0
      expect(limitStage.$limit).toBe(100); // max limit 100
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Database error');
      Group.findById.mockRejectedValue(error);
      req.params = { groupId: 'group1' };

      await getGroupMemberStatistics(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate group member statistics',
          details: 'Database error'
        }
      });
      expect(logger.error).toHaveBeenCalled();
    });
  });
});