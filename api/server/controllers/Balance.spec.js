jest.mock('~/models', () => ({
  findBalanceByUser: jest.fn(),
  createAutoRefillTransaction: jest.fn(),
}));

const { findBalanceByUser, createAutoRefillTransaction } = require('~/models');
const balanceController = require('./Balance');

describe('balanceController', () => {
  const createResponse = () => ({
    locals: {},
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    sendStatus: jest.fn().mockReturnThis(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns no content without reading balance when balance config is disabled', async () => {
    const req = { user: { id: 'user-1' } };
    const res = createResponse();
    res.locals.balanceConfigEnabled = false;

    await balanceController(req, res);

    expect(findBalanceByUser).not.toHaveBeenCalled();
    expect(res.sendStatus).toHaveBeenCalledWith(204);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('uses balance data attached by middleware without a second read', async () => {
    const req = { user: { id: 'user-1' } };
    const res = createResponse();
    res.locals.balanceConfigEnabled = true;
    res.locals.balanceData = {
      _id: 'balance-1',
      user: 'user-1',
      tokenCredits: 100,
      autoRefillEnabled: false,
    };

    await balanceController(req, res);

    expect(findBalanceByUser).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      user: 'user-1',
      tokenCredits: 100,
      autoRefillEnabled: false,
    });
  });

  it('returns not found when balance is enabled and no record exists', async () => {
    findBalanceByUser.mockResolvedValue(null);
    const req = { user: { id: 'user-1' } };
    const res = createResponse();
    res.locals.balanceConfigEnabled = true;

    await balanceController(req, res);

    expect(findBalanceByUser).toHaveBeenCalledWith('user-1');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Balance not found' });
  });

  it('returns the balance unchanged when auto-refill is enabled but not eligible yet', async () => {
    const req = { user: { id: 'user-1' } };
    const res = createResponse();
    res.locals.balanceConfigEnabled = true;
    res.locals.balanceData = {
      _id: 'b1',
      tokenCredits: 0,
      autoRefillEnabled: true,
      refillIntervalValue: 7,
      refillIntervalUnit: 'days',
      lastRefill: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      refillAmount: 5000,
    };

    await balanceController(req, res);

    expect(createAutoRefillTransaction).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toMatchObject({ tokenCredits: 0 });
  });

  it('returns the balance unchanged when auto-refill is enabled but balance is positive', async () => {
    const req = { user: { id: 'user-1' } };
    const res = createResponse();
    res.locals.balanceConfigEnabled = true;
    res.locals.balanceData = {
      _id: 'b1',
      tokenCredits: 12345,
      autoRefillEnabled: true,
      refillIntervalValue: 7,
      refillIntervalUnit: 'days',
      lastRefill: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      refillAmount: 5000,
    };

    await balanceController(req, res);

    expect(createAutoRefillTransaction).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0]).toMatchObject({ tokenCredits: 12345 });
  });

  it('triggers eager refill when eligible and balance is at zero, returning the refreshed balance', async () => {
    createAutoRefillTransaction.mockResolvedValue({ balance: 5000 });
    const req = { user: { id: 'user-1' } };
    const res = createResponse();
    res.locals.balanceConfigEnabled = true;
    res.locals.balanceData = {
      _id: 'b1',
      tokenCredits: 0,
      autoRefillEnabled: true,
      refillIntervalValue: 7,
      refillIntervalUnit: 'days',
      lastRefill: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      refillAmount: 5000,
    };

    await balanceController(req, res);

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
