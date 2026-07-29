const mockModelRegistry = {};
const mockModelFor = (name) => {
  if (!mockModelRegistry[name]) {
    mockModelRegistry[name] = {
      findOne: jest.fn(async () => null),
      deleteOne: jest.fn(async () => ({ deletedCount: 1 })),
      deleteMany: jest.fn(async () => ({ deletedCount: 0 })),
      updateOne: jest.fn(async () => ({ modifiedCount: 0 })),
      updateMany: jest.fn(async () => ({ modifiedCount: 0 })),
      countDocuments: jest.fn(async () => 0),
    };
  }
  return mockModelRegistry[name];
};

const mockMarkUserDeleting = jest.fn(async () => new Date());
const mockDisableUserSchedules = jest.fn(async () => undefined);
const mockSilentExit = jest.fn();
const mockAskQuestion = jest.fn();

jest.mock('../connect', () => jest.fn(async () => {}));
jest.mock('mongoose', () => ({ disconnect: jest.fn(async () => {}) }));
// The real package cannot load here: this suite mocks mongoose to a bare stub, and
// @librechat/api reads Types.ObjectId at import time. The live CLI harness exercises
// the real wiring; this suite only needs the constant.
jest.mock('@librechat/data-schemas', () => ({
  createModels: () => new Proxy({}, { get: (_target, prop) => mockModelFor(prop) }),
}));
jest.mock('~/models', () => ({
  markUserDeleting: mockMarkUserDeleting,
  disableUserSchedulesForDeletion: mockDisableUserSchedules,
}));
jest.mock('../helpers', () => ({
  ...jest.requireActual('../helpers'),
  askQuestion: mockAskQuestion,
  silentExit: mockSilentExit,
}));

const USER_ID = 'user-being-deleted';

/** Runs the CLI to completion, resolving with the exit code it passed to silentExit. */
const runCli = () =>
  new Promise((resolve, reject) => {
    mockSilentExit.mockImplementation((code = 0) => resolve(code));
    jest.isolateModules(() => {
      try {
        require('../delete-user');
      } catch (err) {
        reject(err);
      }
    });
  });

describe('Delete user CLI', () => {
  const originalArgv = process.argv;
  let logSpy;

  beforeEach(() => {
    delete process.env.AUTH_USER_CACHE_MODE;
    process.argv = ['node', 'delete-user.js', 'deleted@example.com'];
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    for (const model of Object.values(mockModelRegistry)) {
      for (const fn of Object.values(model)) {
        fn.mockClear();
      }
    }
    mockModelFor('User').findOne.mockResolvedValue({
      _id: { toString: () => USER_ID },
      email: 'deleted@example.com',
    });
    mockModelFor('ScheduleRun').countDocuments.mockResolvedValue(0);
    mockMarkUserDeleting.mockReset().mockResolvedValue(new Date());
    mockDisableUserSchedules.mockReset().mockResolvedValue(undefined);
    // Confirm deletion, decline transaction history.
    mockAskQuestion.mockReset().mockResolvedValueOnce('y').mockResolvedValueOnce('n');
  });

  afterEach(() => {
    process.argv = originalArgv;
    logSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it('raises the barrier through markUserDeleting, never a raw update', async () => {
    const code = await runCli();

    expect(code).toBe(0);
    expect(mockMarkUserDeleting).toHaveBeenCalledWith(USER_ID);
    // A raw User.updateOne would stamp deletionRequestedAt without dropping the cached
    // auth user document, so a live server keeps admitting requests with a pre-barrier
    // req.user while the cascade below runs.
    expect(mockModelFor('User').updateOne).not.toHaveBeenCalled();
    expect(mockModelFor('User').deleteOne).toHaveBeenCalled();
  });

  it('raises the barrier before counting active scheduled runs', async () => {
    await runCli();

    const barrierAt = mockMarkUserDeleting.mock.invocationCallOrder[0];
    const countAt = mockModelFor('ScheduleRun').countDocuments.mock.invocationCallOrder[0];
    // The count only means anything once new fires are refused; otherwise a fire can be
    // claimed and accepted between a zero result and the deletes.
    expect(barrierAt).toBeLessThan(countAt);
  });

  it('deletes nothing when the barrier cannot be raised', async () => {
    mockMarkUserDeleting.mockRejectedValue(
      new Error('Auth user-doc cache is enabled but unavailable'),
    );

    const code = await runCli();

    expect(code).toBe(1);
    expect(mockModelFor('User').deleteOne).not.toHaveBeenCalled();
    expect(mockModelFor('Schedule').deleteMany).not.toHaveBeenCalled();
    expect(mockModelFor('ScheduleRun').deleteMany).not.toHaveBeenCalled();
    expect(mockModelFor('Message').deleteMany).not.toHaveBeenCalled();
  });

  it('fences in-flight fires before the count can mean anything', async () => {
    // The barrier alone leaves a fire that passed the owner-deleting probe moments
    // earlier still in preflight: invisible to the count, then free to reserve and
    // dispatch, because every later fence revalidates the SCHEDULE, not the user.
    // Disabling the schedules rotates each claim token, which is what those fences
    // check — so it has to land before the count, not merely before the deletes.
    await runCli();

    const disableAt = mockDisableUserSchedules.mock.invocationCallOrder[0];
    const countAt = mockModelFor('ScheduleRun').countDocuments.mock.invocationCallOrder[0];
    expect(mockDisableUserSchedules).toHaveBeenCalledWith(USER_ID);
    expect(disableAt).toBeLessThan(countAt);
  });

  it('refuses while a scheduled run is still active', async () => {
    mockModelFor('ScheduleRun').countDocuments.mockResolvedValue(2);

    const code = await runCli();

    expect(code).toBe(1);
    expect(mockModelFor('User').deleteOne).not.toHaveBeenCalled();
    expect(mockModelFor('Schedule').deleteMany).not.toHaveBeenCalled();
    // The barrier stays up: it is one-way, and a live server must keep refusing fires
    // for an account the operator has already committed to erasing.
    expect(mockMarkUserDeleting).toHaveBeenCalledWith(USER_ID);
  });
});
