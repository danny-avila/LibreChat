import type { TContextUsageEvent, TTokenUsageEvent } from './runs';
import { promptTokensFromUsage, reconcileContextUsage } from './runs';

describe('promptTokensFromUsage', () => {
  it('adds cache reads/writes for additive providers (Bedrock)', () => {
    const event: TTokenUsageEvent = {
      input_tokens: 53702,
      input_token_details: { cache_read: 2071, cache_creation: 0 },
      provider: 'bedrock',
    };
    expect(promptTokensFromUsage(event)).toBe(55773);
  });

  it('treats input_tokens as the full prompt for Anthropic (cache-inclusive)', () => {
    const event: TTokenUsageEvent = {
      input_tokens: 55773,
      input_token_details: { cache_read: 2071, cache_creation: 0 },
      provider: 'anthropic',
    };
    expect(promptTokensFromUsage(event)).toBe(55773);
  });

  it('treats input_tokens as the full prompt for subset providers (OpenAI)', () => {
    const event: TTokenUsageEvent = {
      input_tokens: 1000,
      input_token_details: { cache_read: 200, cache_creation: 100 },
      provider: 'openAI',
    };
    expect(promptTokensFromUsage(event)).toBe(1000);
  });

  it('handles missing fields', () => {
    expect(promptTokensFromUsage({ provider: 'anthropic' })).toBe(0);
  });

  it('uses the magnitude heuristic when the provider is absent (cache ≤ input ⇒ included)', () => {
    /** OpenAI-compatible/custom payload with no provider: cache already folded
     *  into input_tokens, so it must NOT be re-added. */
    const event: TTokenUsageEvent = {
      input_tokens: 1000,
      input_token_details: { cache_read: 400, cache_creation: 0 },
    };
    expect(promptTokensFromUsage(event)).toBe(1000);
  });

  it('adds cache when provider is absent and cache exceeds input (additive shape)', () => {
    const event: TTokenUsageEvent = {
      input_tokens: 100,
      input_token_details: { cache_read: 900, cache_creation: 0 },
    };
    expect(promptTokensFromUsage(event)).toBe(1000);
  });
});

describe('reconcileContextUsage', () => {
  /** The exact over-reporting case from a real web-search + summarization turn:
   *  calibrationRatio pinned at 5 inflated messageTokens to 187471 → used 213375,
   *  while the provider's real prompt for that call was 55773. */
  const inflatedSnapshot: TContextUsageEvent = {
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
  };

  it('reconciles the inflated estimate to the real prompt tokens', () => {
    const result = reconcileContextUsage(inflatedSnapshot, 55773);
    /** used = budget − remaining = real prompt, down from the inflated 213375 */
    expect(237500 - (result.remainingContextTokens ?? 0)).toBe(55773);
    /** only messageTokens is corrected; instructions/summary stay raw */
    expect(result.breakdown.messageTokens).toBe(55773 - 4205 - 1938);
    expect(result.breakdown.instructionTokens).toBe(4205);
    expect(result.breakdown.summaryTokens).toBe(1938);
    /** rows still sum to the real total */
    expect(
      result.breakdown.messageTokens +
        result.breakdown.instructionTokens +
        result.breakdown.summaryTokens,
    ).toBe(55773);
  });

  it('clamps messageTokens to zero when the prompt is smaller than the overhead', () => {
    const result = reconcileContextUsage(inflatedSnapshot, 3000);
    expect(result.breakdown.messageTokens).toBe(0);
    expect(result.remainingContextTokens).toBe(237500 - 3000);
  });

  it('is a no-op for an unusable prompt count', () => {
    expect(reconcileContextUsage(inflatedSnapshot, 0)).toBe(inflatedSnapshot);
    expect(reconcileContextUsage(inflatedSnapshot, -5)).toBe(inflatedSnapshot);
    expect(reconcileContextUsage(inflatedSnapshot, NaN)).toBe(inflatedSnapshot);
  });

  it('end-to-end: promptTokensFromUsage feeds reconcileContextUsage (followup turn)', () => {
    const followupSnapshot: TContextUsageEvent = {
      ...inflatedSnapshot,
      breakdown: { ...inflatedSnapshot.breakdown, messageTokens: 30480 },
      remainingContextTokens: 202815,
    };
    const usage: TTokenUsageEvent = {
      input_tokens: 9875, // cache-inclusive (Anthropic): 7804 fresh + 2071 read
      input_token_details: { cache_read: 2071, cache_creation: 0 },
      provider: 'anthropic',
    };
    const result = reconcileContextUsage(followupSnapshot, promptTokensFromUsage(usage));
    expect(237500 - (result.remainingContextTokens ?? 0)).toBe(9875);
    expect(result.breakdown.messageTokens).toBe(9875 - 4205 - 1938);
  });
});
