import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { logger, createMethods, createModels } from '@librechat/data-schemas';
import { DEFAULT_BALANCE_RESERVATION_TTL_MS, ViolationTypes } from 'librechat-data-provider';
import type { BalanceConfig, IBalance } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { CheckBalanceDeps } from './checkBalance';
import type { ServerRequest } from '~/types/http';
import { checkBalance } from './checkBalance';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('checkBalance', () => {
  const createMockDeps = (overrides: Partial<CheckBalanceDeps> = {}): CheckBalanceDeps => ({
    reserveBalance: jest.fn().mockResolvedValue({ reserved: true, balance: 1000 }),
    releaseBalanceReservation: jest.fn().mockResolvedValue(undefined),
    getMultiplier: jest.fn().mockReturnValue(1),
    logViolation: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  const req = { user: { id: 'user-1' } } as ServerRequest;
  const res = {} as Response;

  const baseTxData = {
    user: 'user-1',
    tokenType: 'prompt',
    amount: 100,
    endpoint: 'openAI',
    model: 'gpt-4',
  };

  it('reserves the token cost and releases that reservation exactly once', async () => {
    const deps = createMockDeps({ getMultiplier: jest.fn().mockReturnValue(2) });

    const reservation = await checkBalance({ req, res, txData: baseTxData }, deps);

    expect(deps.reserveBalance).toHaveBeenCalledWith({
      user: 'user-1',
      amount: 200,
      reservationId: expect.any(String),
      expiresAt: expect.any(Date),
    });
    const [{ reservationId }] = (deps.reserveBalance as jest.Mock).mock.calls[0];
    expect(deps.releaseBalanceReservation).not.toHaveBeenCalled();

    await Promise.all([reservation.release(), reservation.release()]);
    await reservation.release();

    expect(deps.releaseBalanceReservation).toHaveBeenCalledTimes(1);
    expect(deps.releaseBalanceReservation).toHaveBeenCalledWith({ user: 'user-1', reservationId });
  });

  it('logs instead of throwing when a release fails', async () => {
    const deps = createMockDeps({
      releaseBalanceReservation: jest.fn().mockRejectedValue(new Error('DB unavailable')),
    });

    const reservation = await checkBalance({ req, res, txData: baseTxData }, deps);

    await expect(reservation.release()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      '[Balance.check] Failed to release balance reservation',
      expect.objectContaining({ user: 'user-1' }),
    );
  });

  it('throws a TOKEN_BALANCE violation with the unreserved balance when refused', async () => {
    const deps = createMockDeps({
      reserveBalance: jest.fn().mockResolvedValue({ reserved: false, balance: 10 }),
    });

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

  describe('reservation expiry', () => {
    const expiryOf = (deps: CheckBalanceDeps) =>
      (deps.reserveBalance as jest.Mock).mock.calls[0][0].expiresAt.getTime();

    it('expires reservations after the configured TTL', async () => {
      const deps = createMockDeps({ balanceConfig: { reservationTtlMs: 5000 } });
      const before = Date.now();

      await checkBalance({ req, res, txData: baseTxData }, deps);

      expect(expiryOf(deps)).toBeGreaterThanOrEqual(before + 5000);
      expect(expiryOf(deps)).toBeLessThanOrEqual(Date.now() + 5000);
    });

    it('falls back to the default TTL, warning once, when the configured TTL is invalid', async () => {
      const balanceConfig = { reservationTtlMs: -1 } as BalanceConfig;
      const before = Date.now();

      for (let i = 0; i < 2; i++) {
        const deps = createMockDeps({ balanceConfig });
        await checkBalance({ req, res, txData: baseTxData }, deps);
        expect(expiryOf(deps)).toBeGreaterThanOrEqual(before + DEFAULT_BALANCE_RESERVATION_TTL_MS);
      }

      expect(logger.warn).toHaveBeenCalledTimes(1);
    });
  });

  describe('lazy balance initialization', () => {
    const missingThenReserved = (balance: number, reserved = true) =>
      jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ reserved, balance });

    it('should create balance record when no record exists and startBalance is configured', async () => {
      const upsertBalanceFields = jest.fn().mockResolvedValue({ tokenCredits: 5000 });
      const deps = createMockDeps({
        reserveBalance: missingThenReserved(5000),
        balanceConfig: { startBalance: 5000 },
        upsertBalanceFields,
      });

      await checkBalance({ req, res, txData: baseTxData }, deps);

      expect(upsertBalanceFields).toHaveBeenCalledWith('user-1', {
        user: 'user-1',
        tokenCredits: 5000,
      });
      expect(deps.reserveBalance).toHaveBeenCalledTimes(2);
    });

    it('should include auto-refill fields when configured', async () => {
      const upsertBalanceFields = jest.fn().mockResolvedValue({ tokenCredits: 5000 });
      const deps = createMockDeps({
        reserveBalance: missingThenReserved(5000),
        balanceConfig: {
          startBalance: 5000,
          autoRefillEnabled: true,
          refillIntervalValue: 1,
          refillIntervalUnit: 'days',
          refillAmount: 1000,
        },
        upsertBalanceFields,
      });

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
        reserveBalance: missingThenReserved(5000),
        balanceConfig: { startBalance: 5000, autoRefillEnabled: true },
        upsertBalanceFields,
      });

      await checkBalance({ req, res, txData: baseTxData }, deps);

      expect(upsertBalanceFields).toHaveBeenCalledWith('user-1', {
        user: 'user-1',
        tokenCredits: 5000,
      });
    });

    it('should throw a TOKEN_BALANCE violation with the stored balance when initialized credits fall short', async () => {
      const upsertBalanceFields = jest.fn().mockResolvedValue({ tokenCredits: 3000 });
      const deps = createMockDeps({
        reserveBalance: missingThenReserved(3000, false),
        balanceConfig: { startBalance: 5000 },
        upsertBalanceFields,
      });

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
      const deps = createMockDeps({ reserveBalance: jest.fn().mockResolvedValue(null) });

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
        reserveBalance: jest.fn().mockResolvedValue(null),
        balanceConfig: {},
        upsertBalanceFields: jest.fn(),
      });

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
        reserveBalance: jest.fn().mockResolvedValue(null),
        balanceConfig: { startBalance: 5000 },
      });

      await expect(checkBalance({ req, res, txData: baseTxData }, deps)).rejects.toThrow();
      expect(deps.logViolation).toHaveBeenCalledWith(
        req,
        res,
        ViolationTypes.TOKEN_BALANCE,
        expect.objectContaining({ balance: 0 }),
        0,
      );
    });

    it('should fall back to balance: 0 when upsertBalanceFields rejects', async () => {
      const upsertBalanceFields = jest.fn().mockRejectedValue(new Error('DB unavailable'));
      const deps = createMockDeps({
        reserveBalance: jest.fn().mockResolvedValue(null),
        balanceConfig: { startBalance: 5000 },
        upsertBalanceFields,
      });

      await expect(checkBalance({ req, res, txData: baseTxData }, deps)).rejects.toThrow();
      expect(deps.reserveBalance).toHaveBeenCalledTimes(1);
      expect(deps.logViolation).toHaveBeenCalledWith(
        req,
        res,
        ViolationTypes.TOKEN_BALANCE,
        expect.objectContaining({ balance: 0 }),
        0,
      );
    });
  });

  describe('against a real balance store', () => {
    let mongoServer: MongoMemoryServer;
    let Balance: mongoose.Model<IBalance>;
    let methods: ReturnType<typeof createMethods>;

    beforeAll(async () => {
      mongoServer = await MongoMemoryServer.create();
      await mongoose.connect(mongoServer.getUri());
      createModels(mongoose);
      Balance = mongoose.models.Balance as mongoose.Model<IBalance>;
      methods = createMethods(mongoose);
    });

    afterAll(async () => {
      await mongoose.disconnect();
      await mongoServer.stop();
    });

    beforeEach(async () => {
      await mongoose.connection.dropDatabase();
    });

    const realDeps = (balanceConfig?: BalanceConfig): CheckBalanceDeps => ({
      getMultiplier: () => 1,
      reserveBalance: methods.reserveBalance,
      releaseBalanceReservation: methods.releaseBalanceReservation,
      upsertBalanceFields: methods.upsertBalanceFields,
      logViolation: jest.fn().mockResolvedValue(undefined),
      balanceConfig,
    });

    const admitConcurrently = (user: string, count: number, deps: CheckBalanceDeps) =>
      Promise.allSettled(
        Array.from({ length: count }, () =>
          checkBalance({ req, res, txData: { ...baseTxData, user, amount: 400 } }, deps),
        ),
      );

    it('admits concurrent requests only against credits no in-flight request holds', async () => {
      const user = new mongoose.Types.ObjectId().toString();
      await Balance.create({ user, tokenCredits: 1000 });
      const deps = realDeps();

      const outcomes = await admitConcurrently(user, 20, deps);
      const admitted = outcomes.filter((outcome) => outcome.status === 'fulfilled');

      expect(admitted).toHaveLength(2);
      expect(deps.logViolation).toHaveBeenCalledTimes(18);

      await expect(
        checkBalance({ req, res, txData: { ...baseTxData, user, amount: 400 } }, deps),
      ).rejects.toThrow();

      await Promise.all(
        admitted.map((outcome) =>
          (outcome as PromiseFulfilledResult<{ release: () => Promise<void> }>).value.release(),
        ),
      );
      const after = await admitConcurrently(user, 3, deps);
      expect(after.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(2);
    });

    it('refills once for concurrent requests arriving in one refill window', async () => {
      const user = new mongoose.Types.ObjectId().toString();
      await Balance.create({
        user,
        tokenCredits: 5,
        autoRefillEnabled: true,
        refillAmount: 1000,
        refillIntervalValue: 30,
        refillIntervalUnit: 'days',
        lastRefill: new Date('2020-01-01T00:00:00.000Z'),
      });

      const outcomes = await admitConcurrently(user, 10, realDeps());

      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(2);
      const stored = await Balance.findOne({ user }).lean();
      expect(stored?.tokenCredits).toBe(1005);
      const refills = await methods.getTransactions({ user, context: 'autoRefill' });
      expect(refills).toHaveLength(1);
    });

    it('lazily initializes a missing record and reserves against it', async () => {
      const user = new mongoose.Types.ObjectId().toString();
      const deps = realDeps({ startBalance: 1000 });

      await checkBalance({ req, res, txData: { ...baseTxData, user, amount: 400 } }, deps);
      const outcomes = await admitConcurrently(user, 4, deps);

      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
      const stored = await Balance.findOne({ user }).select('+reservations').lean();
      expect(stored?.tokenCredits).toBe(1000);
      expect(stored?.reservations).toHaveLength(2);
    });
  });
});
