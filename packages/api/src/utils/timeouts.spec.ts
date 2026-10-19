import {
  pollUntilSettled,
  DEFAULT_OUTBOUND_TIMEOUTS_MS,
  getOutboundTimeoutMs,
  startOutboundDeadline,
} from './timeouts';

describe('outbound timeouts', () => {
  it('uses the default when the config omits the key', () => {
    expect(getOutboundTimeoutMs(undefined, 'ragMs')).toBe(DEFAULT_OUTBOUND_TIMEOUTS_MS.ragMs);
    expect(getOutboundTimeoutMs({ timeouts: { ocrMs: 1_000 } }, 'ragMs')).toBe(
      DEFAULT_OUTBOUND_TIMEOUTS_MS.ragMs,
    );
  });

  it('uses the configured value when present', () => {
    expect(getOutboundTimeoutMs({ timeouts: { moderationMs: 2_500 } }, 'moderationMs')).toBe(2_500);
  });

  it('expires a poll deadline once its budget is spent', () => {
    jest.useFakeTimers();
    try {
      const deadline = startOutboundDeadline(
        { timeouts: { imageGenerationMs: 1_000 } },
        'imageGenerationMs',
      );
      expect(deadline.expired()).toBe(false);
      jest.advanceTimersByTime(400);
      expect(deadline.remainingMs()).toBe(600);
      jest.advanceTimersByTime(600);
      expect(deadline.expired()).toBe(true);
      expect(deadline.remainingMs()).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('returns the first settled poll and hands each poll the remaining budget', async () => {
    const deadline = startOutboundDeadline(
      { timeouts: { imageGenerationMs: 5_000 } },
      'imageGenerationMs',
    );
    const poll = jest
      .fn()
      .mockResolvedValueOnce({ status: 'Pending' })
      .mockResolvedValueOnce({ status: 'Ready' });

    const result = await pollUntilSettled({
      deadline,
      intervalMs: 1,
      poll,
      isSettled: (data: { status: string }) => data.status !== 'Pending',
    });

    expect(result).toEqual({ status: 'Ready' });
    expect(poll).toHaveBeenCalledTimes(2);
    expect(poll.mock.calls[0][0]).toBeLessThanOrEqual(5_000);
  });

  it('gives up at the deadline when no poll settles', async () => {
    const deadline = startOutboundDeadline(
      { timeouts: { imageGenerationMs: 30 } },
      'imageGenerationMs',
    );
    const poll = jest.fn().mockResolvedValue({ status: 'Content Moderated' });

    const result = await pollUntilSettled({
      deadline,
      intervalMs: 5,
      poll,
      isSettled: (data: { status: string }) => data.status === 'Ready',
    });

    expect(result).toBeUndefined();
    expect(deadline.expired()).toBe(true);
  });
});
