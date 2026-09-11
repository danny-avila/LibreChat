import { maybeAutoRefill } from './refill';
import type { RefillDeps, RefillRecord } from './refill';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

describe('maybeAutoRefill', () => {
  const user = 'user-1';

  const createDeps = (overrides: Partial<RefillDeps> = {}): RefillDeps => ({
    createAutoRefillTransaction: jest.fn().mockResolvedValue({ balance: 5000 }),
    ...overrides,
  });

  const eligibleRecord = (overrides: Partial<RefillRecord> = {}): RefillRecord => ({
    tokenCredits: 0,
    autoRefillEnabled: true,
    refillAmount: 5000,
    refillIntervalValue: 7,
    refillIntervalUnit: 'days',
    lastRefill: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    ...overrides,
  });

  it('returns the existing balance when autoRefillEnabled is false', async () => {
    const deps = createDeps();
    const record = eligibleRecord({ autoRefillEnabled: false, tokenCredits: 0 });

    const balance = await maybeAutoRefill({ user, record, deps });

    expect(balance).toBe(0);
    expect(deps.createAutoRefillTransaction).not.toHaveBeenCalled();
  });

  it('returns the existing balance when refillAmount is missing or zero', async () => {
    const deps = createDeps();
    const record = eligibleRecord({ refillAmount: 0 });

    const balance = await maybeAutoRefill({ user, record, deps });

    expect(balance).toBe(0);
    expect(deps.createAutoRefillTransaction).not.toHaveBeenCalled();
  });

  it('returns the existing balance when balance is positive and tokenCost is zero', async () => {
    const deps = createDeps();
    const record = eligibleRecord({ tokenCredits: 100 });

    const balance = await maybeAutoRefill({ user, record, deps });

    expect(balance).toBe(100);
    expect(deps.createAutoRefillTransaction).not.toHaveBeenCalled();
  });

  it('returns the existing balance when projected balance after tokenCost is still positive', async () => {
    const deps = createDeps();
    const record = eligibleRecord({ tokenCredits: 1000 });

    const balance = await maybeAutoRefill({ user, record, tokenCost: 100, deps });

    expect(balance).toBe(1000);
    expect(deps.createAutoRefillTransaction).not.toHaveBeenCalled();
  });

  it('returns the existing balance when balance is depleted but refill interval has not elapsed', async () => {
    const deps = createDeps();
    const record = eligibleRecord({
      lastRefill: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    });

    const balance = await maybeAutoRefill({ user, record, deps });

    expect(balance).toBe(0);
    expect(deps.createAutoRefillTransaction).not.toHaveBeenCalled();
  });

  it('refills when balance is at zero and refill interval has elapsed', async () => {
    const deps = createDeps();
    const record = eligibleRecord();

    const balance = await maybeAutoRefill({ user, record, deps });

    expect(balance).toBe(5000);
    expect(deps.createAutoRefillTransaction).toHaveBeenCalledWith({
      user,
      tokenType: 'credits',
      context: 'autoRefill',
      rawAmount: 5000,
    });
  });

  it('refills when balance minus tokenCost would drop to zero or below', async () => {
    const deps = createDeps();
    const record = eligibleRecord({ tokenCredits: 50 });

    const balance = await maybeAutoRefill({ user, record, tokenCost: 100, deps });

    expect(balance).toBe(5000);
    expect(deps.createAutoRefillTransaction).toHaveBeenCalled();
  });

  it('refills when lastRefill is missing or invalid', async () => {
    const deps = createDeps();
    const record = eligibleRecord({ lastRefill: undefined });

    const balance = await maybeAutoRefill({ user, record, deps });

    expect(balance).toBe(5000);
    expect(deps.createAutoRefillTransaction).toHaveBeenCalled();
  });

  it('returns the original balance when the refill transaction fails', async () => {
    const deps = createDeps({
      createAutoRefillTransaction: jest.fn().mockRejectedValue(new Error('db down')),
    });
    const record = eligibleRecord();

    const balance = await maybeAutoRefill({ user, record, deps });

    expect(balance).toBe(0);
  });

  it('returns the original balance when the refill transaction returns nothing', async () => {
    const deps = createDeps({
      createAutoRefillTransaction: jest.fn().mockResolvedValue(undefined),
    });
    const record = eligibleRecord();

    const balance = await maybeAutoRefill({ user, record, deps });

    expect(balance).toBe(0);
  });
});
