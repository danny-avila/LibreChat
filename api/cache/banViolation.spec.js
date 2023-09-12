const banViolation = require('./banViolation');

jest.mock('keyv');
jest.mock('../models/Session');

describe('banViolation', () => {
  let req, res, errorMessage;

  beforeEach(() => {
    req = {
      ip: '127.0.0.1',
      cookies: {
        refreshToken: 'someToken',
      },
    };
    res = {
      clearCookie: jest.fn(),
    };
    errorMessage = {
      type: 'someViolation',
      user_id: '12345',
      prev_count: 0,
      violation_count: 0,
    };
    process.env.BAN_VIOLATIONS = 'true';
    process.env.BAN_DURATION = '7200000'; // 2 hours in ms
    process.env.BAN_INTERVAL = '20';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should not ban if BAN_VIOLATIONS are not enabled', async () => {
    process.env.BAN_VIOLATIONS = 'false';
    await banViolation(req, res, errorMessage);
    expect(errorMessage.ban).toBeFalsy();
  });

  it('should not ban if errorMessage is not provided', async () => {
    await banViolation(req, res, null);
    expect(errorMessage.ban).toBeFalsy();
  });

  it('[1/3] should ban if violation_count crosses the interval threshold: 19 -> 39', async () => {
    errorMessage.prev_count = 19;
    errorMessage.violation_count = 39;
    await banViolation(req, res, errorMessage);
    expect(errorMessage.ban).toBeTruthy();
  });

  it('[2/3] should ban if violation_count crosses the interval threshold: 19 -> 20', async () => {
    errorMessage.prev_count = 19;
    errorMessage.violation_count = 20;
    await banViolation(req, res, errorMessage);
    expect(errorMessage.ban).toBeTruthy();
  });

  const randomValueAbove = Math.floor(20 + Math.random() * 100);
  it(`[3/3] should ban if violation_count crosses the interval threshold: 19 -> ${randomValueAbove}`, async () => {
    errorMessage.prev_count = 19;
    errorMessage.violation_count = randomValueAbove;
    await banViolation(req, res, errorMessage);
    expect(errorMessage.ban).toBeTruthy();
  });

  it('should handle invalid BAN_INTERVAL and default to 20', async () => {
    process.env.BAN_INTERVAL = 'invalid';
    errorMessage.prev_count = 19;
    errorMessage.violation_count = 39;
    await banViolation(req, res, errorMessage);
    expect(errorMessage.ban).toBeTruthy();
  });

  it('should not ban if BAN_DURATION is invalid', async () => {
    process.env.BAN_DURATION = 'invalid';
    errorMessage.prev_count = 19;
    errorMessage.violation_count = 39;
    await banViolation(req, res, errorMessage);
    expect(errorMessage.ban).toBeFalsy();
  });

  it('should not ban if violation_count does not change', async () => {
    errorMessage.prev_count = 0;
    errorMessage.violation_count = 0;
    await banViolation(req, res, errorMessage);
    expect(errorMessage.ban).toBeFalsy();
  });

  it('[1/2] should not ban if violation_count does not cross the interval threshold: 0 -> 19', async () => {
    errorMessage.prev_count = 0;
    errorMessage.violation_count = 19;
    await banViolation(req, res, errorMessage);
    expect(errorMessage.ban).toBeFalsy();
  });

  const randomValueUnder = Math.floor(1 + Math.random() * 19);
  it(`[2/2] should not ban if violation_count does not cross the interval threshold: 0 -> ${randomValueUnder}`, async () => {
    errorMessage.prev_count = 0;
    errorMessage.violation_count = randomValueUnder;
    await banViolation(req, res, errorMessage);
    expect(errorMessage.ban).toBeFalsy();
  });

  it('[EDGE CASE] should not ban if violation_count is lower', async () => {
    errorMessage.prev_count = 0;
    errorMessage.violation_count = -10;
    await banViolation(req, res, errorMessage);
    expect(errorMessage.ban).toBeFalsy();
  });
});
