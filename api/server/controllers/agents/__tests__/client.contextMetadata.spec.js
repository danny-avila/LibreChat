const AgentClient = require('../client');

/** Minimal post-(maybe-)summary snapshot. baseUsed = maxContextTokens(1000) -
 *  remainingContextTokens(700) = 300, so the marker (summaryUsedTokens) is 300. */
const snapshot = (summaryTokens) => ({
  runId: 'run-1',
  agentId: 'agent-1',
  breakdown: {
    maxContextTokens: 1000,
    instructionTokens: 50,
    systemMessageTokens: 50,
    dynamicInstructionTokens: 0,
    toolSchemaTokens: 0,
    summaryTokens,
    toolCount: 0,
    messageCount: 1,
    messageTokens: 20,
    availableForMessages: 900,
  },
  contextBudget: 1000,
  remainingContextTokens: 700,
  prePruneContextTokens: 300,
  effectiveInstructionTokens: 50,
  calibrationRatio: 1,
});

const primary = { input_tokens: 10, output_tokens: 5, total_tokens: 15 };
const summarizationUsage = { ...primary, usage_type: 'summarization' };

function buildMeta({ snap, latestUsageIndex, usageEvents }) {
  const self = {
    collectedThoughtSignatures: null,
    usageEmitSink: usageEvents,
    contextUsageSink: snap
      ? { latest: snap, count: 1, latestUsageIndex }
      : { latest: null, count: 0 },
  };
  return AgentClient.prototype.buildResponseMetadata.call(self);
}

describe('AgentClient.buildResponseMetadata — snapshot persistence + summary marker', () => {
  it('persists the snapshot when a primary usage follows it (normal turn)', () => {
    const meta = buildMeta({ snap: snapshot(0), latestUsageIndex: 0, usageEvents: [primary] });
    expect(meta.contextUsage).toBeDefined();
    expect(meta.summaryUsedTokens).toBeUndefined();
  });

  it('persists the post-summary snapshot when the only pre-primary usage is the summarization', () => {
    /** A summarized turn: the summarization usage precedes the post-summary
     *  snapshot (index 1), then the model's primary usage follows it. The old
     *  count guard miscounted and dropped this; the new guard keeps it. */
    const meta = buildMeta({
      snap: snapshot(80),
      latestUsageIndex: 1,
      usageEvents: [summarizationUsage, primary],
    });
    expect(meta.contextUsage).toBeDefined();
    expect(meta.summaryUsedTokens).toBe(300);
  });

  it('still emits the summary marker when the final call emitted no usage', () => {
    /** Interrupted summarized turn: no primary usage follows the latest snapshot,
     *  so the snapshot is (correctly) not persisted — but the coarse marker
     *  survives so the client estimate still caps the discarded history. */
    const meta = buildMeta({
      snap: snapshot(80),
      latestUsageIndex: 1,
      usageEvents: [summarizationUsage],
    });
    expect(meta.contextUsage).toBeUndefined();
    expect(meta.summaryUsedTokens).toBe(300);
  });

  it('drops the snapshot and emits no marker when the final call had no usage and no summary', () => {
    const meta = buildMeta({ snap: snapshot(0), latestUsageIndex: 1, usageEvents: [primary] });
    expect(meta.contextUsage).toBeUndefined();
    expect(meta.summaryUsedTokens).toBeUndefined();
  });
});
