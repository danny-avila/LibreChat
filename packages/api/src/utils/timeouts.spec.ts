import {
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
});
