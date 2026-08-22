const mockAcquireLease = jest.fn();
const mockRenewLease = jest.fn();
const mockReleaseLease = jest.fn();
const mockAbortJob = jest.fn();
const mockIsStopConfirmed = jest.fn();
const mockLogger = { warn: jest.fn() };

jest.mock('@librechat/data-schemas', () => ({ logger: mockLogger }));
jest.mock('@librechat/api', () => ({
  GenerationJobManager: { abortJob: (...args) => mockAbortJob(...args) },
  isStopConfirmed: (...args) => mockIsStopConfirmed(...args),
}));
jest.mock('~/models', () => ({
  acquireSubagentThreadLease: (...args) => mockAcquireLease(...args),
  renewSubagentThreadLease: (...args) => mockRenewLease(...args),
  releaseSubagentThreadLease: (...args) => mockReleaseLease(...args),
}));

const {
  acquireEventChildGenerationLease,
} = require('~/server/services/Endpoints/agents/eventChildLease');

describe('event child generation lease', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-08-22T00:00:00.000Z') });
    jest.clearAllMocks();
    mockAcquireLease.mockResolvedValue(true);
    mockReleaseLease.mockResolvedValue(true);
    mockAbortJob.mockResolvedValue({ success: true });
    mockIsStopConfirmed.mockImplementation((result) => result?.success === true);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('aborts when a renewal lands after continuous ownership expired', async () => {
    let resolveRenewal;
    mockRenewLease.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRenewal = resolve;
        }),
    );
    const release = await acquireEventChildGenerationLease({
      userId: 'user-1',
      tenantId: 'tenant-1',
      conversationId: 'child-1',
      streamId: 'child-1',
      jobCreatedAt: 123,
    });

    jest.advanceTimersByTime(10_000);
    await Promise.resolve();
    jest.setSystemTime(new Date('2026-08-22T00:00:30.001Z'));
    resolveRenewal(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(mockAbortJob).toHaveBeenCalledWith('child-1', {
      expectedCreatedAt: 123,
      awaitProviderDrain: true,
    });
    await release();
  });

  it('aborts when renewal throws instead of silently running past expiry', async () => {
    mockRenewLease.mockRejectedValue(new Error('mongo unavailable'));
    const release = await acquireEventChildGenerationLease({
      userId: 'user-1',
      conversationId: 'child-1',
      streamId: 'child-1',
      jobCreatedAt: 123,
    });

    await jest.advanceTimersByTimeAsync(10_000);

    expect(mockAbortJob).toHaveBeenCalledWith('child-1', {
      expectedCreatedAt: 123,
      awaitProviderDrain: true,
    });
    await release();
  });

  it('caps ownership and aborts the exact generation at the inherited retention deadline', async () => {
    const retentionExpiresAt = new Date('2026-08-22T00:00:05.000Z');
    const release = await acquireEventChildGenerationLease({
      userId: 'user-1',
      tenantId: 'tenant-1',
      conversationId: 'child-1',
      streamId: 'child-1',
      jobCreatedAt: 123,
      retentionExpiresAt,
    });

    expect(mockAcquireLease).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: retentionExpiresAt }),
    );
    await jest.advanceTimersByTimeAsync(4_999);
    expect(mockAbortJob).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(mockAbortJob).toHaveBeenCalledWith('child-1', {
      expectedCreatedAt: 123,
      awaitProviderDrain: true,
    });
    await release();
  });

  it('retains the fence and retries an unconfirmed deadline abort', async () => {
    mockAbortJob
      .mockResolvedValueOnce({ success: false, failureReason: 'job_still_active' })
      .mockResolvedValueOnce({ success: true });
    const release = await acquireEventChildGenerationLease({
      userId: 'user-1',
      conversationId: 'child-1',
      streamId: 'child-1',
      jobCreatedAt: 123,
      retentionExpiresAt: new Date('2026-08-22T00:00:05.000Z'),
    });

    await jest.advanceTimersByTimeAsync(5_000);
    expect(mockAbortJob).toHaveBeenCalledTimes(1);
    expect(mockReleaseLease).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(250);
    expect(mockAbortJob).toHaveBeenCalledTimes(2);
    await release();
  });

  it('retains the fence and retries when the deadline abort throws', async () => {
    mockAbortJob
      .mockRejectedValueOnce(new Error('abort store unavailable'))
      .mockResolvedValueOnce({ success: true });
    const release = await acquireEventChildGenerationLease({
      userId: 'user-1',
      conversationId: 'child-1',
      streamId: 'child-1',
      jobCreatedAt: 123,
      retentionExpiresAt: new Date('2026-08-22T00:00:05.000Z'),
    });

    await jest.advanceTimersByTimeAsync(5_250);
    expect(mockAbortJob).toHaveBeenCalledTimes(2);
    expect(mockReleaseLease).not.toHaveBeenCalled();
    await release();
  });
});
