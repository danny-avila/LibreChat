import { ViolationTypes } from 'librechat-data-provider';
import type { CheckBalanceDeps } from './checkBalance';
import { checkBalance } from './checkBalance';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

describe('checkBalance', () => {
  const createMockDeps = (overrides: Partial<CheckBalanceDeps> = {}): CheckBalanceDeps => ({
    findBalanceByUser: jest.fn().mockResolvedValue({ tokenCredits: 1000 }),
    getMultiplier: jest.fn().mockReturnValue(1),
    createAutoRefillTransaction: jest.fn(),
    logViolation: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  const createMockReqRes = () => ({
    req: { user: { id: 'user-1' } } as unknown as Parameters<typeof checkBalance>[0]['req'],
    res: {} as unknown as Parameters<typeof checkBalance>[0]['res'],
  });

  const baseTxData = {
    user: 'user-1',
    tokenType: 'prompt',
    amount: 100,
    endpoint: 'openAI',
    model: 'gpt-4',
  };

  it('should return true when user has sufficient balance', async () => {
    const deps = createMockDeps();
    const { req, res } = createMockReqRes();

    const result = await checkBalance({ req, res, txData: baseTxData }, deps);
    expect(result).toBe(true);
  });

  it('should throw when user has insufficient balance', async () => {
    const deps = createMockDeps({
      findBalanceByUser: jest.fn().mockResolvedValue({ tokenCredits: 10 }),
      getMultiplier: jest.fn().mockReturnValue(1),
    });
    const { req, res } = createMockReqRes();

    await expect(
      checkBalance({ req, res, txData: { ...baseTxData, amount: 100 } }, deps),
    ).rejects.toThrow();

    expect(deps.logViolation).toHaveBeenCalledWith(
      req,
      res,
      ViolationTypes.TOKEN_BALANCE,
      expect.objectContaining({ balance: 10, tokenCost: 100 }),
      0,
    );
  });

  describe('lazy balance initialization', () => {
    it('should create balance record when no record exists and startBalance is configured', async () => {
      const upsertBalanceFields = jest.fn().mockResolvedValue({ tokenCredits: 5000 });
      const deps = createMockDeps({
        findBalanceByUser: jest.fn().mockResolvedValue(null),
        balanceConfig: { startBalance: 5000 },
        upsertBalanceFields,
      });
      const { req, res } = createMockReqRes();

      const result = await checkBalance({ req, res, txData: baseTxData }, deps);

      expect(result).toBe(true);
      expect(upsertBalanceFields).toHaveBeenCalledWith('user-1', {
        user: 'user-1',
        tokenCredits: 5000,
      });
    });

    it('should include auto-refill fields when configured', async () => {
      const upsertBalanceFields = jest.fn().mockResolvedValue({ tokenCredits: 5000 });
      const deps = createMockDeps({
        findBalanceByUser: jest.fn().mockResolvedValue(null),
        balanceConfig: {
          startBalance: 5000,
          autoRefillEnabled: true,
          refillIntervalValue: 1,
          refillIntervalUnit: 'days',
          refillAmount: 1000,
        },
        upsertBalanceFields,
      });
      const { req, res } = createMockReqRes();

      await checkBalance({ req, res, txData: baseTxData }, deps);

      expect(upsertBalanceFields).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          user: 'user-1',
          tokenCredits: 5000,
          autoRefillEnabled: true,
          refillIntervalValue: 1,
          refillIntervalUnit: 'days',
          refillAmount: 1000,
          lastRefill: expect.any(Date),
        }),
      );
    });

    it('should not include auto-refill fields when config is partial', async () => {
      const upsertBalanceFields = jest.fn().mockResolvedValue({ tokenCredits: 5000 });
      const deps = createMockDeps({
        findBalanceByUser: jest.fn().mockResolvedValue(null),
        balanceConfig: { startBalance: 5000, autoRefillEnabled: true },
        upsertBalanceFields,
      });
      const { req, res } = createMockReqRes();

      await checkBalance({ req, res, txData: baseTxData }, deps);

      expect(upsertBalanceFields).toHaveBeenCalledWith('user-1', {
        user: 'user-1',
        tokenCredits: 5000,
      });
    });

    it('should throw a TOKEN_BALANCE violation when lazy-initialized balance is less than token cost', async () => {
      const upsertBalanceFields = jest.fn().mockResolvedValue({ tokenCredits: 50 });
      const deps = createMockDeps({
        findBalanceByUser: jest.fn().mockResolvedValue(null),
        getMultiplier: jest.fn().mockReturnValue(1),
        balanceConfig: { startBalance: 50 },
        upsertBalanceFields,
      });
      const { req, res } = createMockReqRes();

      await expect(
        checkBalance({ req, res, txData: { ...baseTxData, amount: 100 } }, deps),
      ).rejects.toThrow();

      expect(upsertBalanceFields).toHaveBeenCalledWith('user-1', {
        user: 'user-1',
        tokenCredits: 50,
      });
      expect(deps.logViolation).toHaveBeenCalledWith(
        req,
        res,
        ViolationTypes.TOKEN_BALANCE,
        expect.objectContaining({ balance: 50, tokenCost: 100 }),
        0,
      );
    });

    it('should use DB-returned tokenCredits over raw startBalance config constant', async () => {
      const upsertBalanceFields = jest.fn().mockResolvedValue({ tokenCredits: 3000 });
      const deps = createMockDeps({
        findBalanceByUser: jest.fn().mockResolvedValue(null),
        getMultiplier: jest.fn().mockReturnValue(1),
        balanceConfig: { startBalance: 5000 },
        upsertBalanceFields,
      });
      const { req, res } = createMockReqRes();

      await expect(
        checkBalance({ req, res, txData: { ...baseTxData, amount: 4000 } }, deps),
      ).rejects.toThrow();

      expect(deps.logViolation).toHaveBeenCalledWith(
        req,
        res,
        ViolationTypes.TOKEN_BALANCE,
        expect.objectContaining({ balance: 3000, tokenCost: 4000 }),
        0,
      );
    });

    it('should throw a TOKEN_BALANCE violation when no record and no balanceConfig', async () => {
      const deps = createMockDeps({
        findBalanceByUser: jest.fn().mockResolvedValue(null),
      });
      const { req, res } = createMockReqRes();

      await expect(checkBalance({ req, res, txData: baseTxData }, deps)).rejects.toThrow();
      expect(deps.logViolation).toHaveBeenCalledWith(
        req,
        res,
        ViolationTypes.TOKEN_BALANCE,
        expect.objectContaining({ balance: 0 }),
        0,
      );
    });

    it('should throw a TOKEN_BALANCE violation when no record and startBalance is undefined', async () => {
      const deps = createMockDeps({
        findBalanceByUser: jest.fn().mockResolvedValue(null),
        balanceConfig: {},
        upsertBalanceFields: jest.fn(),
      });
      const { req, res } = createMockReqRes();

      await expect(checkBalance({ req, res, txData: baseTxData }, deps)).rejects.toThrow();
      expect(deps.upsertBalanceFields).not.toHaveBeenCalled();
      expect(deps.logViolation).toHaveBeenCalledWith(
        req,
        res,
        ViolationTypes.TOKEN_BALANCE,
        expect.objectContaining({ balance: 0 }),
        0,
      );
    });

    it('should throw a TOKEN_BALANCE violation when upsertBalanceFields is not provided', async () => {
      const deps = createMockDeps({
        findBalanceByUser: jest.fn().mockResolvedValue(null),
        balanceConfig: { startBalance: 5000 },
      });
      const { req, res } = createMockReqRes();

      await expect(checkBalance({ req, res, txData: baseTxData }, deps)).rejects.toThrow();
      expect(deps.logViolation).toHaveBeenCalledWith(
        req,
        res,
        ViolationTypes.TOKEN_BALANCE,
        expect.objectContaining({ balance: 0 }),
        0,
      );
    });

    it('should handle startBalance of 0', async () => {
      const upsertBalanceFields = jest.fn().mockResolvedValue({ tokenCredits: 0 });
      const deps = createMockDeps({
        findBalanceByUser: jest.fn().mockResolvedValue(null),
        getMultiplier: jest.fn().mockReturnValue(1),
        balanceConfig: { startBalance: 0 },
        upsertBalanceFields,
      });
      const { req, res } = createMockReqRes();

      await expect(
        checkBalance({ req, res, txData: { ...baseTxData, amount: 100 } }, deps),
      ).rejects.toThrow();

      expect(upsertBalanceFields).toHaveBeenCalledWith('user-1', {
        user: 'user-1',
        tokenCredits: 0,
      });
    });

    it('should fall back to balance: 0 when upsertBalanceFields rejects', async () => {
      const upsertBalanceFields = jest.fn().mockRejectedValue(new Error('DB unavailable'));
      const deps = createMockDeps({
        findBalanceByUser: jest.fn().mockResolvedValue(null),
        balanceConfig: { startBalance: 5000 },
        upsertBalanceFields,
      });
      const { req, res } = createMockReqRes();

      await expect(checkBalance({ req, res, txData: baseTxData }, deps)).rejects.toThrow();
      expect(deps.logViolation).toHaveBeenCalledWith(
        req,
        res,
        ViolationTypes.TOKEN_BALANCE,
        expect.objectContaining({ balance: 0 }),
        0,
      );
    });
  });
});
