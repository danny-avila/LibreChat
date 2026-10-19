import {
  getOutboundTimeoutMs,
  outboundRequestBudget,
  DEFAULT_OUTBOUND_TIMEOUTS_MS,
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
});

describe('outboundRequestBudget', () => {
  it('aborts at the wall-clock deadline even if the socket stays busy', async () => {
    const { timeout, signal } = outboundRequestBudget(20);

    expect(timeout).toBe(20);
    await new Promise((resolve) => signal.addEventListener('abort', resolve));
    expect(signal.aborted).toBe(true);
  });

  it('also follows the caller signal', () => {
    const controller = new AbortController();
    const { signal } = outboundRequestBudget(60_000, controller.signal);

    controller.abort();

    expect(signal.aborted).toBe(true);
  });
});
