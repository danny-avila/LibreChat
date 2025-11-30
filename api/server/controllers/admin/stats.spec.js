// Mock dependencies before requiring the controller
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
  },
}));

jest.mock('~/db/models', () => ({
  Transaction: {
    countDocuments: jest.fn(),
    aggregate: jest.fn(),
  },
}));

const { Transaction } = require('~/db/models');
const { logger } = require('@librechat/data-schemas');
const { getStats } = require('./stats');

describe('Admin Stats Controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {};
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe('getStats', () => {
    it('should return statistics successfully', async () => {
      const mockTotalTransactions = 150;
      const mockTokenStats = [
        {
          _id: null,
          totalTokens: 50000,
          count: 150,
        },
      ];

      Transaction.countDocuments.mockResolvedValue(mockTotalTransactions);
      Transaction.aggregate.mockResolvedValue(mockTokenStats);

      await getStats(mockReq, mockRes);

      expect(Transaction.countDocuments).toHaveBeenCalled();
      expect(Transaction.aggregate).toHaveBeenCalledWith([
        {
          $group: {
            _id: null,
            totalTokens: { $sum: '$tokenValue' },
            count: { $sum: 1 },
          },
        },
      ]);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        totalTransactions: 150,
        tokenStats: {
          _id: null,
          totalTokens: 50000,
          count: 150,
        },
      });
    });

    it('should return default values when no transactions exist', async () => {
      Transaction.countDocuments.mockResolvedValue(0);
      Transaction.aggregate.mockResolvedValue([]);

      await getStats(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        totalTransactions: 0,
        tokenStats: {
          totalTokens: 0,
          count: 0,
        },
      });
    });

    it('should handle null tokenValue fields gracefully', async () => {
      const mockTokenStats = [
        {
          _id: null,
          totalTokens: null,
          count: 5,
        },
      ];

      Transaction.countDocuments.mockResolvedValue(5);
      Transaction.aggregate.mockResolvedValue(mockTokenStats);

      await getStats(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        totalTransactions: 5,
        tokenStats: {
          _id: null,
          totalTokens: null,
          count: 5,
        },
      });
    });

    it('should handle errors and return 500', async () => {
      const error = new Error('Database error');
      Transaction.countDocuments.mockRejectedValue(error);

      await getStats(mockReq, mockRes);

      expect(logger.error).toHaveBeenCalledWith('Error getting stats:', error);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Internal Server Error' });
    });

    it('should handle aggregate errors and return 500', async () => {
      const error = new Error('Aggregation failed');
      Transaction.countDocuments.mockResolvedValue(100);
      Transaction.aggregate.mockRejectedValue(error);

      await getStats(mockReq, mockRes);

      expect(logger.error).toHaveBeenCalledWith('Error getting stats:', error);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Internal Server Error' });
    });

    it('should handle large numbers correctly', async () => {
      const mockTotalTransactions = 1000000;
      const mockTokenStats = [
        {
          _id: null,
          totalTokens: 999999999,
          count: 1000000,
        },
      ];

      Transaction.countDocuments.mockResolvedValue(mockTotalTransactions);
      Transaction.aggregate.mockResolvedValue(mockTokenStats);

      await getStats(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        totalTransactions: 1000000,
        tokenStats: {
          _id: null,
          totalTokens: 999999999,
          count: 1000000,
        },
      });
    });

    it('should handle zero tokens but non-zero transactions', async () => {
      const mockTokenStats = [
        {
          _id: null,
          totalTokens: 0,
          count: 10,
        },
      ];

      Transaction.countDocuments.mockResolvedValue(10);
      Transaction.aggregate.mockResolvedValue(mockTokenStats);

      await getStats(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        totalTransactions: 10,
        tokenStats: {
          _id: null,
          totalTokens: 0,
          count: 10,
        },
      });
    });
  });
});
