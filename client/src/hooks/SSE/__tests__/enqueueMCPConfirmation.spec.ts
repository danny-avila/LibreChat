/**
 * Unit tests for the `enqueueMCPConfirmation` helper used by the SSE
 * listeners (`useSSE.ts`, `useResumableSSE.ts`) to queue incoming
 * confirmation envelopes.
 *
 * Covers:
 *   - append in arrival order
 *   - dedup by confirmationId returns SAME reference (not a new array)
 *   - per-entry deadline computed at call time from `expiresInSeconds`
 */

import { enqueueMCPConfirmation } from '../enqueueMCPConfirmation';
import type { MCPPendingConfirmation } from '~/store/mcpConfirmation';

function makeIncoming(
  overrides: Partial<Omit<MCPPendingConfirmation, 'deadline'>> = {},
): Omit<MCPPendingConfirmation, 'deadline'> {
  return {
    confirmationId: 'cid-A',
    serverName: 'test-server',
    toolName: 'test-tool',
    preview: 'Tool: test-tool\n  arg: "value"',
    expiresInSeconds: 120,
    expiresAt: Date.now() + 120_000,
    ...overrides,
  };
}

describe('enqueueMCPConfirmation', () => {
  test('appends to an empty queue', () => {
    const incoming = makeIncoming({ confirmationId: 'cid-A' });
    const result = enqueueMCPConfirmation([], incoming);
    expect(result).toHaveLength(1);
    expect(result[0].confirmationId).toBe('cid-A');
  });

  test('appends in arrival order', () => {
    const a = enqueueMCPConfirmation([], makeIncoming({ confirmationId: 'cid-A' }));
    const b = enqueueMCPConfirmation(a, makeIncoming({ confirmationId: 'cid-B' }));
    expect(b.map((e) => e.confirmationId)).toEqual(['cid-A', 'cid-B']);
  });

  test('dedups by confirmationId — returns SAME reference on hit', () => {
    const seeded = enqueueMCPConfirmation([], makeIncoming({ confirmationId: 'cid-A' }));
    const result = enqueueMCPConfirmation(seeded, makeIncoming({ confirmationId: 'cid-A' }));
    // Reference identity is the contract — Recoil/React skip re-render on Object.is.
    expect(result).toBe(seeded);
  });

  test('dedup is per-confirmationId, not per-toolName', () => {
    const seeded = enqueueMCPConfirmation(
      [],
      makeIncoming({ confirmationId: 'cid-A', toolName: 'send-message' }),
    );
    const result = enqueueMCPConfirmation(
      seeded,
      makeIncoming({ confirmationId: 'cid-B', toolName: 'send-message' }),
    );
    expect(result).toHaveLength(2);
    expect(result).not.toBe(seeded);
  });

  test('computes deadline from expiresInSeconds at call time', () => {
    const before = Date.now();
    const result = enqueueMCPConfirmation(
      [],
      makeIncoming({ confirmationId: 'cid-A', expiresInSeconds: 60 }),
    );
    const after = Date.now();
    // deadline must be ~60s ahead of "now". Allow the test-execution window.
    expect(result[0].deadline).toBeGreaterThanOrEqual(before + 60_000);
    expect(result[0].deadline).toBeLessThanOrEqual(after + 60_000);
  });
});
