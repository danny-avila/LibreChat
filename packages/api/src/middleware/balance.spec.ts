import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { logger, balanceSchema } from '@librechat/data-schemas';
import type { NextFunction, Request as ServerRequest, Response as ServerResponse } from 'express';
import type { IBalance } from '@librechat/data-schemas';
import { createSetBalanceConfig } from './balance';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: {
    error: jest.fn(),
  },
}));

let mongoServer: MongoMemoryServer;
let Balance: mongoose.Model<IBalance>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  Balance = mongoose.models.Balance || mongoose.model('Balance', balanceSchema);
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('createSetBalanceConfig', () => {
  const createMockRequest = (userId: string | mongoose.Types.ObjectId): Partial<ServerRequest> => ({
    user: {
      _id: userId,
      id: userId.toString(),
      email: 'test@example.com',
    },
  });

  const createMockResponse = (): Partial<ServerResponse> => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  });

  const mockNext: NextFunction = jest.fn();
  describe('Basic Functionality', () => {
    test('should create balance record for new user with start balance', async () => {
      const userId = new mongoose.Types.ObjectId();
      const getAppConfig = jest.fn().mockResolvedValue({
        balance: {
          enabled: true,
          startBalance: 1000,
          autoRefillEnabled: true,
          refillIntervalValue: 30,
          refillIntervalUnit: 'days',
          refillAmount: 500,
        },
      });

      const middleware = createSetBalanceConfig({
        getAppConfig,
        Balance,
      });

      const req = createMockRequest(userId);
      const res = createMockResponse();

      await middleware(req as ServerRequest, res as ServerResponse, mockNext);

      expect(getAppConfig).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();

      const balanceRecord = await Balance.findOne({ user: userId });
      expect(balanceRecord).toBeTruthy();
      expect(balanceRecord?.tokenCredits).toBe(1000);
      expect(balanceRecord?.autoRefillEnabled).toBe(true);
      expect(balanceRecord?.refillIntervalValue).toBe(30);
      expect(balanceRecord?.refillIntervalUnit).toBe('days');
      expect(balanceRecord?.refillAmount).toBe(500);
      expect(balanceRecord?.lastRefill).toBeInstanceOf(Date);
    });

    test('should skip if balance config is not enabled', async () => {
      const userId = new mongoose.Types.ObjectId();
      const getAppConfig = jest.fn().mockResolvedValue({
        balance: {
          enabled: false,
        },
      });

      const middleware = createSetBalanceConfig({
        getAppConfig,
        Balance,
      });

      const req = createMockRequest(userId);
      const res = createMockResponse();

      await middleware(req as ServerRequest, res as ServerResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();

      const balanceRecord = await Balance.findOne({ user: userId });
      expect(balanceRecord).toBeNull();
    });

    test('should skip if startBalance is null', async () => {
      const userId = new mongoose.Types.ObjectId();
      const getAppConfig = jest.fn().mockResolvedValue({
        balance: {
          enabled: true,
          startBalance: null,
        },
      });

      const middleware = createSetBalanceConfig({
        getAppConfig,
        Balance,
      });

      const req = createMockRequest(userId);
      const res = createMockResponse();

      await middleware(req as ServerRequest, res as ServerResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();

      const balanceRecord = await Balance.findOne({ user: userId });
      expect(balanceRecord).toBeNull();
    });

    test('should handle user._id as string', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const getAppConfig = jest.fn().mockResolvedValue({
        balance: {
          enabled: true,
          startBalance: 1000,
          autoRefillEnabled: true,
          refillIntervalValue: 30,
          refillIntervalUnit: 'days',
          refillAmount: 500,
        },
      });

      const middleware = createSetBalanceConfig({
        getAppConfig,
        Balance,
      });

      const req = createMockRequest(userId);
      const res = createMockResponse();

      await middleware(req as ServerRequest, res as ServerResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();

      const balanceRecord = await Balance.findOne({ user: userId });
      expect(balanceRecord).toBeTruthy();
      expect(balanceRecord?.tokenCredits).toBe(1000);
    });

    test('should skip if user is not present in request', async () => {
      const getAppConfig = jest.fn().mockResolvedValue({
        balance: {
          enabled: true,
          startBalance: 1000,
          autoRefillEnabled: true,
          refillIntervalValue: 30,
          refillIntervalUnit: 'days',
          refillAmount: 500,
        },
      });

      const middleware = createSetBalanceConfig({
        getAppConfig,
        Balance,
      });

      const req = {} as ServerRequest;
      const res = createMockResponse();

      await middleware(req, res as ServerResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(getAppConfig).toHaveBeenCalled();
    });
  });

  describe('Edge Case: Auto-refill without lastRefill', () => {
    test('should initialize lastRefill when enabling auto-refill for existing user without lastRefill', async () => {
      const userId = new mongoose.Types.ObjectId();

      // Create existing balance record without lastRefill
      // Note: We need to unset lastRefill after creation since the schema has a default
      const doc = await Balance.create({
        user: userId,
        tokenCredits: 500,
        autoRefillEnabled: false,
      });

      // Remove lastRefill to simulate existing user without it
      await Balance.updateOne({ _id: doc._id }, { $unset: { lastRefill: 1 } });

      const getAppConfig = jest.fn().mockResolvedValue({
        balance: {
          enabled: true,
          startBalance: 1000,
          autoRefillEnabled: true,
          refillIntervalValue: 30,
          refillIntervalUnit: 'days',
          refillAmount: 500,
        },
      });

      const middleware = createSetBalanceConfig({
        getAppConfig,
        Balance,
      });

      const req = createMockRequest(userId);
      const res = createMockResponse();

      const beforeTime = new Date();
      await middleware(req as ServerRequest, res as ServerResponse, mockNext);
      const afterTime = new Date();

      expect(mockNext).toHaveBeenCalled();

      const balanceRecord = await Balance.findOne({ user: userId });
      expect(balanceRecord).toBeTruthy();
      expect(balanceRecord?.tokenCredits).toBe(500); // Should not change existing credits
      expect(balanceRecord?.autoRefillEnabled).toBe(true);
      expect(balanceRecord?.lastRefill).toBeInstanceOf(Date);

      // Verify lastRefill was set to current time
      const lastRefillTime = balanceRecord?.lastRefill?.getTime() || 0;
      expect(lastRefillTime).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(lastRefillTime).toBeLessThanOrEqual(afterTime.getTime());
    });

    test('should not update lastRefill if it already exists', async () => {
      const userId = new mongoose.Types.ObjectId();
      const existingLastRefill = new Date('2024-01-01');

      // Create existing balance record with lastRefill
      await Balance.create({
        user: userId,
        tokenCredits: 500,
        autoRefillEnabled: true,
        refillIntervalValue: 30,
        refillIntervalUnit: 'days',
        refillAmount: 500,
        lastRefill: existingLastRefill,
      });

      const getAppConfig = jest.fn().mockResolvedValue({
        balance: {
          enabled: true,
          startBalance: 1000,
          autoRefillEnabled: true,
          refillIntervalValue: 30,
          refillIntervalUnit: 'days',
          refillAmount: 500,
        },
      });

      const middleware = createSetBalanceConfig({
        getAppConfig,
        Balance,
      });

      const req = createMockRequest(userId);
      const res = createMockResponse();

      await middleware(req as ServerRequest, res as ServerResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();

      const balanceRecord = await Balance.findOne({ user: userId });
      expect(balanceRecord?.lastRefill?.getTime()).toBe(existingLastRefill.getTime());
    });

    test('should handle existing user with auto-refill enabled but missing lastRefill', async () => {
      const userId = new mongoose.Types.ObjectId();

      // Create a balance record with auto-refill enabled but missing lastRefill
      // This simulates the exact edge case reported by the user
      const doc = await Balance.create({
        user: userId,
        tokenCredits: 500,
        autoRefillEnabled: true,
        refillIntervalValue: 30,
        refillIntervalUnit: 'days',
        refillAmount: 500,
      });

      // Remove lastRefill to simulate the edge case
      await Balance.updateOne({ _id: doc._id }, { $unset: { lastRefill: 1 } });

      const getAppConfig = jest.fn().mockResolvedValue({
        balance: {
          enabled: true,
          startBalance: 1000,
          autoRefillEnabled: true,
          refillIntervalValue: 30,
          refillIntervalUnit: 'days',
          refillAmount: 500,
        },
      });

      const middleware = createSetBalanceConfig({
        getAppConfig,
        Balance,
      });

      const req = createMockRequest(userId);
      const res = createMockResponse();

      await middleware(req as ServerRequest, res as ServerResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();

      const balanceRecord = await Balance.findOne({ user: userId });
      expect(balanceRecord).toBeTruthy();
      expect(balanceRecord?.autoRefillEnabled).toBe(true);
      expect(balanceRecord?.lastRefill).toBeInstanceOf(Date);
      // This should have fixed the issue - user should no longer get the error
    });

    test('should not set lastRefill when auto-refill is disabled', async () => {
      const userId = new mongoose.Types.ObjectId();

      const getAppConfig = jest.fn().mockResolvedValue({
        balance: {
          enabled: true,

          startBalance: 1000,
          autoRefillEnabled: false,
        },
      });

      const middleware = createSetBalanceConfig({
        getAppConfig,
        Balance,
      });

      const req = createMockRequest(userId);
      const res = createMockResponse();

      await middleware(req as ServerRequest, res as ServerResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();

      const balanceRecord = await Balance.findOne({ user: userId });
      expect(balanceRecord).toBeTruthy();
      expect(balanceRecord?.tokenCredits).toBe(1000);
      expect(balanceRecord?.autoRefillEnabled).toBe(false);
      // lastRefill should have default value from schema
      expect(balanceRecord?.lastRefill).toBeInstanceOf(Date);
    });
  });

  describe('Update Scenarios', () => {
    test('should update auto-refill settings for existing user', async () => {
      const userId = new mongoose.Types.ObjectId();

      // Create existing balance record
      await Balance.create({
        user: userId,
        tokenCredits: 500,
        autoRefillEnabled: false,
        refillIntervalValue: 7,
        refillIntervalUnit: 'days',
        refillAmount: 100,
      });

      const getAppConfig = jest.fn().mockResolvedValue({
        balance: {
          enabled: true,
          startBalance: 1000,
          autoRefillEnabled: true,
          refillIntervalValue: 30,
          refillIntervalUnit: 'days',
          refillAmount: 500,
        },
      });

      const middleware = createSetBalanceConfig({
        getAppConfig,
        Balance,
      });

      const req = createMockRequest(userId);
      const res = createMockResponse();

      await middleware(req as ServerRequest, res as ServerResponse, mockNext);

      const balanceRecord = await Balance.findOne({ user: userId });
      expect(balanceRecord?.tokenCredits).toBe(500); // Should not change
      expect(balanceRecord?.autoRefillEnabled).toBe(true);
      expect(balanceRecord?.refillIntervalValue).toBe(30);
      expect(balanceRecord?.refillIntervalUnit).toBe('days');
      expect(balanceRecord?.refillAmount).toBe(500);
    });

    test('should not update if values are already the same', async () => {
      const userId = new mongoose.Types.ObjectId();
      const lastRefillTime = new Date();

      // Create existing balance record with same values
      await Balance.create({
        user: userId,
        tokenCredits: 1000,
        autoRefillEnabled: true,
        refillIntervalValue: 30,
        refillIntervalUnit: 'days',
        refillAmount: 500,
        lastRefill: lastRefillTime,
      });

      const getAppConfig = jest.fn().mockResolvedValue({
        balance: {
          enabled: true,
          startBalance: 1000,
          autoRefillEnabled: true,
          refillIntervalValue: 30,
          refillIntervalUnit: 'days',
          refillAmount: 500,
        },
      });

      const middleware = createSetBalanceConfig({
        getAppConfig,
        Balance,
      });

      const req = createMockRequest(userId);
      const res = createMockResponse();

      // Spy on Balance.findOneAndUpdate to verify it's not called
      const updateSpy = jest.spyOn(Balance, 'findOneAndUpdate');

      await middleware(req as ServerRequest, res as ServerResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(updateSpy).not.toHaveBeenCalled();
    });

    test('should set tokenCredits for user with null tokenCredits', async () => {
      const userId = new mongoose.Types.ObjectId();

      // Create balance record with null tokenCredits
      await Balance.create({
        user: userId,
        tokenCredits: null,
      });

      const getAppConfig = jest.fn().mockResolvedValue({
        balance: {
          enabled: true,

          startBalance: 2000,
        },
      });

      const middleware = createSetBalanceConfig({
        getAppConfig,
        Balance,
      });

      const req = createMockRequest(userId);
      const res = createMockResponse();

      await middleware(req as ServerRequest, res as ServerResponse, mockNext);

      const balanceRecord = await Balance.findOne({ user: userId });
      expect(balanceRecord?.tokenCredits).toBe(2000);
    });
  });

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      const userId = new mongoose.Types.ObjectId();
      const getAppConfig = jest.fn().mockResolvedValue({
        balance: {
          enabled: true,
          startBalance: 1000,
          autoRefillEnabled: true,
          refillIntervalValue: 30,
          refillIntervalUnit: 'days',
          refillAmount: 500,
        },
      });
      const dbError = new Error('Database error');

      // Mock Balance.findOne to throw an error
      jest.spyOn(Balance, 'findOne').mockImplementationOnce((() => {
        return {
          lean: jest.fn().mockRejectedValue(dbError),
        };
      }) as unknown as mongoose.Model<IBalance>['findOne']);

      const middleware = createSetBalanceConfig({
        getAppConfig,
        Balance,
      });

      const req = createMockRequest(userId);
      const res = createMockResponse();

      await middleware(req as ServerRequest, res as ServerResponse, mockNext);

      expect(logger.error).toHaveBeenCalledWith('Error setting user balance:', dbError);
      expect(mockNext).toHaveBeenCalledWith(dbError);
    });

    test('should handle getAppConfig errors', async () => {
      const userId = new mongoose.Types.ObjectId();
      const configError = new Error('Config error');
      const getAppConfig = jest.fn().mockRejectedValue(configError);

      const middleware = createSetBalanceConfig({
        getAppConfig,
        Balance,
      });

      const req = createMockRequest(userId);
      const res = createMockResponse();

      await middleware(req as ServerRequest, res as ServerResponse, mockNext);

      expect(logger.error).toHaveBeenCalledWith('Error setting user balance:', configError);
      expect(mockNext).toHaveBeenCalledWith(configError);
    });

    test('should handle invalid auto-refill configuration', async () => {
      const userId = new mongoose.Types.ObjectId();

      // Missing required auto-refill fields
      const getAppConfig = jest.fn().mockResolvedValue({
        balance: {
          enabled: true,

          startBalance: 1000,
          autoRefillEnabled: true,
          refillIntervalValue: null, // Invalid
          refillIntervalUnit: 'days',
          refillAmount: 500,
        },
      });

      const middleware = createSetBalanceConfig({
        getAppConfig,
        Balance,
      });

      const req = createMockRequest(userId);
      const res = createMockResponse();

      await middleware(req as ServerRequest, res as ServerResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();

      const balanceRecord = await Balance.findOne({ user: userId });
      expect(balanceRecord).toBeTruthy();
      expect(balanceRecord?.tokenCredits).toBe(1000);
      // Auto-refill fields should not be updated due to invalid config
      expect(balanceRecord?.autoRefillEnabled).toBe(false);
    });
  });

  describe('Concurrent Updates', () => {
    test('should handle concurrent middleware calls for same user', async () => {
      const userId = new mongoose.Types.ObjectId();
      const getAppConfig = jest.fn().mockResolvedValue({
        balance: {
          enabled: true,
          startBalance: 1000,
          autoRefillEnabled: true,
          refillIntervalValue: 30,
          refillIntervalUnit: 'days',
          refillAmount: 500,
        },
      });

      const middleware = createSetBalanceConfig({
        getAppConfig,
        Balance,
      });

      const req = createMockRequest(userId);
      const res1 = createMockResponse();
      const res2 = createMockResponse();
      const mockNext1 = jest.fn();
      const mockNext2 = jest.fn();

      // Run middleware concurrently
      await Promise.all([
        middleware(req as ServerRequest, res1 as ServerResponse, mockNext1),
        middleware(req as ServerRequest, res2 as ServerResponse, mockNext2),
      ]);

      expect(mockNext1).toHaveBeenCalled();
      expect(mockNext2).toHaveBeenCalled();

      // Should only have one balance record
      const balanceRecords = await Balance.find({ user: userId });
      expect(balanceRecords).toHaveLength(1);
      expect(balanceRecords[0].tokenCredits).toBe(1000);
    });
  });

  describe('Integration with Different refillIntervalUnits', () => {
    test.each(['seconds', 'minutes', 'hours', 'days', 'weeks', 'months'])(
      'should handle refillIntervalUnit: %s',
      async (unit) => {
        const userId = new mongoose.Types.ObjectId();

        const getAppConfig = jest.fn().mockResolvedValue({
          balance: {
            enabled: true,

            startBalance: 1000,
            autoRefillEnabled: true,
            refillIntervalValue: 10,
            refillIntervalUnit: unit,
            refillAmount: 100,
          },
        });

        const middleware = createSetBalanceConfig({
          getAppConfig,
          Balance,
        });

        const req = createMockRequest(userId);
        const res = createMockResponse();

        await middleware(req as ServerRequest, res as ServerResponse, mockNext);

        const balanceRecord = await Balance.findOne({ user: userId });
        expect(balanceRecord?.refillIntervalUnit).toBe(unit);
        expect(balanceRecord?.refillIntervalValue).toBe(10);
        expect(balanceRecord?.lastRefill).toBeInstanceOf(Date);
      },
    );
  });
});
