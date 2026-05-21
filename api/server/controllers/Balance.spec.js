jest.mock('~/models', () => ({
  findBalanceByUser: jest.fn(),
  createAutoRefillTransaction: jest.fn(),
}));

const { findBalanceByUser, createAutoRefillTransaction } = require('~/models');
const balanceController = require('./Balance');

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const makeReq = () => ({ user: { id: 'user-1' } });

describe('balanceController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 404 when no balance record exists', async () => {
    findBalanceByUser.mockResolvedValue(null);
    const res = makeRes();

    await balanceController(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Balance not found' });
  });

  it('strips refill fields when autoRefillEnabled is false', async () => {
    findBalanceByUser.mockResolvedValue({
      _id: 'b1',
      tokenCredits: 100,
      autoRefillEnabled: false,
      refillIntervalValue: 7,
      refillIntervalUnit: 'days',
      lastRefill: new Date(),
      refillAmount: 1000,
    });
    const res = makeRes();

    await balanceController(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload).toEqual({ tokenCredits: 100, autoRefillEnabled: false });
    expect(createAutoRefillTransaction).not.toHaveBeenCalled();
  });

  it('returns the balance unchanged when auto-refill is enabled but not eligible yet', async () => {
    const recentRefill = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    findBalanceByUser.mockResolvedValue({
      _id: 'b1',
      tokenCredits: 0,
      autoRefillEnabled: true,
      refillIntervalValue: 7,
      refillIntervalUnit: 'days',
      lastRefill: recentRefill,
      refillAmount: 5000,
    });
    const res = makeRes();

    await balanceController(makeReq(), res);

    expect(createAutoRefillTransaction).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toMatchObject({ tokenCredits: 0 });
  });

  it('returns the balance unchanged when auto-refill is enabled but balance is positive', async () => {
    const oldRefill = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    findBalanceByUser.mockResolvedValue({
      _id: 'b1',
      tokenCredits: 12345,
      autoRefillEnabled: true,
      refillIntervalValue: 7,
      refillIntervalUnit: 'days',
      lastRefill: oldRefill,
      refillAmount: 5000,
    });
    const res = makeRes();

    await balanceController(makeReq(), res);

    expect(createAutoRefillTransaction).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0]).toMatchObject({ tokenCredits: 12345 });
  });

  it('triggers eager refill when eligible and balance is at zero, returning the refreshed balance', async () => {
    const expiredRefill = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    findBalanceByUser.mockResolvedValue({
      _id: 'b1',
      tokenCredits: 0,
      autoRefillEnabled: true,
      refillIntervalValue: 7,
      refillIntervalUnit: 'days',
      lastRefill: expiredRefill,
      refillAmount: 5000,
    });
    createAutoRefillTransaction.mockResolvedValue({ balance: 5000 });
    const res = makeRes();

    await balanceController(makeReq(), res);

    expect(createAutoRefillTransaction).toHaveBeenCalledWith({
      user: 'user-1',
      tokenType: 'credits',
      context: 'autoRefill',
      rawAmount: 5000,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toMatchObject({ tokenCredits: 5000 });
  });
});
