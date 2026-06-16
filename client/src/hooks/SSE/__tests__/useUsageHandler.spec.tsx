import { getDefaultStore } from 'jotai';
import { renderHook } from '@testing-library/react';
import type { TContextUsageEvent, TTokenUsageEvent } from 'librechat-data-provider';
import useUsageHandler from '~/hooks/SSE/useUsageHandler';
import { contextSnapshotFamily } from '~/store/usage';

/** Mirrors a real web-search + summarization turn: calibration pinned at 5
 *  inflated messageTokens to 187471 (used 213375), while the call's true prompt
 *  was 53702 + 2071 cache = 55773. */
const inflatedSnapshot = (over?: Partial<TContextUsageEvent>): TContextUsageEvent => ({
  runId: 'run-1',
  breakdown: {
    maxContextTokens: 250000,
    instructionTokens: 4205,
    systemMessageTokens: 384,
    dynamicInstructionTokens: 1525,
    toolSchemaTokens: 2296,
    summaryTokens: 1938,
    toolCount: 1,
    messageCount: 2,
    messageTokens: 187471,
    availableForMessages: 233295,
  },
  contextBudget: 237500,
  remainingContextTokens: 24125,
  calibrationRatio: 5,
  ...over,
});

const primaryUsage = (over?: Partial<TTokenUsageEvent>): TTokenUsageEvent => ({
  input_tokens: 53702,
  output_tokens: 3780,
  total_tokens: 57482,
  input_token_details: { cache_read: 2071, cache_creation: 0 },
  provider: 'anthropic',
  runId: 'run-1',
  seq: 1,
  ...over,
});

describe('useUsageHandler — live snapshot reconciliation', () => {
  it('reconciles the live snapshot to the primary call’s actual prompt tokens', () => {
    const convo = 'convo-recon-1';
    const submission = {
      userMessage: { messageId: 'u1', conversationId: convo },
      conversation: { conversationId: convo },
    };
    const { result } = renderHook(() => useUsageHandler());
    const store = getDefaultStore();

    result.current.contextHandler(inflatedSnapshot(), submission);
    expect(store.get(contextSnapshotFamily(convo))?.breakdown.messageTokens).toBe(187471);

    result.current.usageHandler(primaryUsage(), submission);

    const snap = store.get(contextSnapshotFamily(convo));
    /** used = budget − remaining = real prompt (55773), down from 213375 */
    expect(237500 - (snap?.remainingContextTokens ?? 0)).toBe(55773);
    expect(snap?.breakdown.messageTokens).toBe(55773 - 4205 - 1938);
    /** instructions/summary stay raw; the anchor is preserved */
    expect(snap?.breakdown.instructionTokens).toBe(4205);
    expect(snap?.anchorMessageId).toBe('u1');
  });

  it('does not reconcile when the usage belongs to a different run', () => {
    const convo = 'convo-recon-2';
    const submission = {
      userMessage: { messageId: 'u2', conversationId: convo },
      conversation: { conversationId: convo },
    };
    const { result } = renderHook(() => useUsageHandler());
    const store = getDefaultStore();

    result.current.contextHandler(inflatedSnapshot({ runId: 'run-A' }), submission);
    result.current.usageHandler(primaryUsage({ runId: 'run-Z', seq: 9 }), submission);

    expect(store.get(contextSnapshotFamily(convo))?.breakdown.messageTokens).toBe(187471);
  });

  it('does not let a tagged (summarization) usage touch the gauge', () => {
    const convo = 'convo-recon-3';
    const submission = {
      userMessage: { messageId: 'u3', conversationId: convo },
      conversation: { conversationId: convo },
    };
    const { result } = renderHook(() => useUsageHandler());
    const store = getDefaultStore();

    result.current.contextHandler(inflatedSnapshot(), submission);
    result.current.usageHandler(primaryUsage({ usage_type: 'summarization', seq: 2 }), submission);

    expect(store.get(contextSnapshotFamily(convo))?.breakdown.messageTokens).toBe(187471);
  });
});
