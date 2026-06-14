import { Constants, Providers } from 'librechat-data-provider';
import type { TMessage, TResponseUsage } from 'librechat-data-provider';
import {
  buildIndex,
  upsertEntries,
  migrateIndex,
  clearIndex,
  hasIndex,
  sumBranch,
  mergeUsage,
  setEntryUsage,
  sumTotalUsage,
  findBranchSnapshotAnchor,
  estimateTokens,
  normalizeUsageUnits,
  formatCost,
  groupToolTokens,
  countTrailingOutputChars,
  EMPTY_BRANCH,
  EMPTY_USAGE,
  EMPTY_TOOL_GROUPS,
} from './tokens';

const CONVO = 'convo-1';

function msg(
  messageId: string,
  parentMessageId: string | null,
  isCreatedByUser: boolean,
  tokenCount?: number,
): TMessage {
  return {
    messageId,
    parentMessageId,
    isCreatedByUser,
    tokenCount,
    conversationId: CONVO,
    text: '',
  } as TMessage;
}

/** Response message carrying a persisted `metadata.usage` rollup (the backend
 *  persists already-normalized display units). */
function responseMsg(
  messageId: string,
  parentMessageId: string | null,
  tokenCount: number,
  usage: TResponseUsage,
): TMessage {
  return {
    messageId,
    parentMessageId,
    isCreatedByUser: false,
    tokenCount,
    conversationId: CONVO,
    text: '',
    metadata: { usage },
  } as TMessage;
}

const USAGE_A: TResponseUsage = { input: 100, output: 50, cacheWrite: 0, cacheRead: 0, cost: 0.01 };
const USAGE_B: TResponseUsage = { input: 200, output: 80, cacheWrite: 0, cacheRead: 0, cost: 0.02 };

describe('token index', () => {
  afterEach(() => {
    clearIndex(CONVO);
    clearIndex('convo-2');
    clearIndex(Constants.NEW_CONVO);
  });

  it('sums only the active branch via the parent chain', () => {
    buildIndex(CONVO, [
      msg('u1', Constants.NO_PARENT, true, 10),
      msg('a1', 'u1', false, 20),
      msg('u2', 'a1', true, 30),
      msg('a2', 'u2', false, 40),
      /** Sibling branch that must not be counted */
      msg('a2-alt', 'u2', false, 999),
    ]);

    const totals = sumBranch(CONVO, 'a2');
    expect(totals.input).toBe(40);
    expect(totals.output).toBe(60);
    expect(totals.total).toBe(4);
    expect(totals.counted).toBe(4);

    const altTotals = sumBranch(CONVO, 'a2-alt');
    expect(altTotals.output).toBe(1019);
  });

  it('flags whether the anchor message is on the branch', () => {
    buildIndex(CONVO, [
      msg('u1', Constants.NO_PARENT, true, 10),
      msg('a1', 'u1', false, 20),
      msg('a1-alt', 'u1', false, 25),
    ]);

    expect(sumBranch(CONVO, 'a1', 'a1').containsAnchor).toBe(true);
    expect(sumBranch(CONVO, 'a1-alt', 'a1').containsAnchor).toBe(false);
  });

  it('tracks uncounted messages and tolerates missing parents', () => {
    buildIndex(CONVO, [msg('u2', 'missing-parent', true, undefined), msg('a2', 'u2', false, 15)]);

    const totals = sumBranch(CONVO, 'a2');
    expect(totals.total).toBe(2);
    expect(totals.counted).toBe(1);
    expect(totals.output).toBe(15);
  });

  it('returns EMPTY_BRANCH without an index or tail', () => {
    expect(sumBranch('unknown', 'x')).toBe(EMPTY_BRANCH);
    buildIndex(CONVO, []);
    expect(sumBranch(CONVO, null)).toBe(EMPTY_BRANCH);
  });

  it('upserts incrementally and overwrites by messageId', () => {
    buildIndex(CONVO, [msg('u1', Constants.NO_PARENT, true, 10)]);
    upsertEntries(CONVO, [msg('a1', 'u1', false, 20), null, undefined]);
    expect(sumBranch(CONVO, 'a1').output).toBe(20);

    upsertEntries(CONVO, [msg('a1', 'u1', false, 35)]);
    expect(sumBranch(CONVO, 'a1').output).toBe(35);
  });

  it('migrates the index to a new conversation id', () => {
    buildIndex(Constants.NEW_CONVO, [msg('u1', Constants.NO_PARENT, true, 10)]);
    migrateIndex(Constants.NEW_CONVO, 'convo-2');

    expect(hasIndex(Constants.NEW_CONVO)).toBe(false);
    expect(sumBranch('convo-2', 'u1').input).toBe(10);
  });
});

describe('findBranchSnapshotAnchor', () => {
  afterEach(() => clearIndex(CONVO));

  it('returns the deepest stored anchor on the viewed branch', () => {
    buildIndex(CONVO, [
      msg('u1', Constants.NO_PARENT, true, 10),
      msg('a1', 'u1', false, 20),
      msg('u2', 'a1', true, 30),
      msg('a2', 'u2', false, 40),
      msg('a2-alt', 'u2', false, 50),
    ]);
    /** Both a1 and a2 stored; walking from a2 must return the nearer one (a2). */
    const anchors = new Map([
      ['a1', 1],
      ['a2', 1],
    ]);
    expect(findBranchSnapshotAnchor(CONVO, 'a2', anchors)).toBe('a2');
    /** From the sibling branch tail, the only on-branch anchor is a1. */
    expect(findBranchSnapshotAnchor(CONVO, 'a2-alt', anchors)).toBe('a1');
  });

  it('returns null when no stored anchor sits on the branch', () => {
    buildIndex(CONVO, [msg('u1', Constants.NO_PARENT, true, 10), msg('a1', 'u1', false, 20)]);
    expect(findBranchSnapshotAnchor(CONVO, 'a1', new Map([['other', 1]]))).toBeNull();
    expect(findBranchSnapshotAnchor(CONVO, 'a1', new Map())).toBeNull();
    expect(findBranchSnapshotAnchor('unknown', 'a1', new Map([['a1', 1]]))).toBeNull();
  });
});

describe('estimateTokens', () => {
  it('estimates chars/4 scaled by calibration ratio', () => {
    expect(estimateTokens(400)).toBe(100);
    expect(estimateTokens(400, 1.1)).toBe(110);
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens(100, 0)).toBe(25);
  });
});

describe('normalizeUsageUnits', () => {
  it('keeps cache additive for Anthropic even when cache <= input', () => {
    /** Magnitude heuristic would wrongly treat this as inclusive and drop
     *  cache from input; the provider says additive (input is uncached-only) */
    expect(
      normalizeUsageUnits({
        input_tokens: 900,
        output_tokens: 100,
        provider: Providers.ANTHROPIC,
        input_token_details: { cache_read: 100 },
      }),
    ).toEqual({ input: 900, output: 100, cacheWrite: 0, cacheRead: 100 });
  });

  it('keeps subset semantics for OpenAI regardless of magnitude', () => {
    expect(
      normalizeUsageUnits({
        input_tokens: 900,
        output_tokens: 100,
        provider: Providers.OPENAI,
        input_token_details: { cache_read: 100 },
      }),
    ).toEqual({ input: 800, output: 100, cacheWrite: 0, cacheRead: 100 });
  });

  it('falls back to a magnitude heuristic when provider is unknown', () => {
    /** cacheSum (12000) > input (1000) ⇒ additive */
    expect(
      normalizeUsageUnits({
        input_tokens: 1000,
        output_tokens: 500,
        input_token_details: { cache_creation: 2000, cache_read: 10000 },
      }),
    ).toEqual({ input: 1000, output: 500, cacheWrite: 2000, cacheRead: 10000 });
  });

  it('repairs under-reported completion tokens (Vertex thinking)', () => {
    /** total - input = 500 recovers the dropped thinking tokens */
    expect(
      normalizeUsageUnits({
        input_tokens: 1000,
        output_tokens: 200,
        total_tokens: 1500,
        provider: Providers.VERTEXAI,
      }).output,
    ).toBe(500);
  });

  it('does not mistake additive cache for missing completion tokens', () => {
    /** Anthropic total includes cache; without the cache adjustment the repair
     *  would falsely inflate completion */
    expect(
      normalizeUsageUnits({
        input_tokens: 1000,
        output_tokens: 200,
        total_tokens: 1700,
        provider: Providers.ANTHROPIC,
        input_token_details: { cache_creation: 300, cache_read: 200 },
      }).output,
    ).toBe(200);
  });
});

describe('formatCost', () => {
  it('formats across magnitude bands', () => {
    expect(formatCost(0)).toBe('$0.00');
    expect(formatCost(0.004)).toBe('<$0.01');
    expect(formatCost(0.0523)).toBe('$0.0523');
    expect(formatCost(1.234)).toBe('$1.23');
  });
});

describe('groupToolTokens', () => {
  it('classifies tools into system, mcp, skills, and subagent groups', () => {
    const groups = groupToolTokens(
      {
        execute_code: 500,
        web_search: 300,
        skill: 200,
        subagent: 150,
        'search_mcp_Google-Workspace': 400,
        fetch_mcp_Github: 250,
      },
      ['fetch_mcp_Github', 'web_search'],
    );

    expect(groups).toEqual({
      system: 500,
      mcp: 400,
      skills: 200,
      subagents: 150,
      systemDeferred: 300,
      mcpDeferred: 250,
    });
  });

  it('returns empty groups without counts and skips zero entries', () => {
    expect(groupToolTokens(undefined)).toBe(EMPTY_TOOL_GROUPS);
    expect(groupToolTokens({ execute_code: 0 })).toEqual(EMPTY_TOOL_GROUPS);
  });
});

describe('countTrailingOutputChars', () => {
  const text = (value: string) => ({ type: 'text', text: value });
  const think = (value: string) => ({ type: 'think', think: value });
  const tool = () => ({ type: 'tool_call', tool_call: { id: 'tc' } });

  it('counts the trailing run of text and think parts', () => {
    expect(countTrailingOutputChars([text('aaaa'), tool(), think('bb'), text('ccc')])).toBe(5);
  });

  it('returns 0 when the latest part is a tool call (no in-flight output)', () => {
    /** Once a tool call is emitted, its preceding text is folded into the next
     *  snapshot's messageTokens — counting it here would double-count. */
    expect(countTrailingOutputChars([text('aaaa'), tool(), text('ccc'), tool()])).toBe(0);
  });

  it('stops at the previous tool boundary', () => {
    expect(countTrailingOutputChars([text('aaaa'), tool(), text('ccc')])).toBe(3);
  });

  it('handles empty and non-output content', () => {
    expect(countTrailingOutputChars(undefined)).toBe(0);
    expect(countTrailingOutputChars([])).toBe(0);
    expect(countTrailingOutputChars([tool()])).toBe(0);
  });
});

describe('per-message usage index (branch + total)', () => {
  afterEach(() => {
    clearIndex(CONVO);
  });

  it('reads metadata.usage onto entries and sums it along the branch', () => {
    buildIndex(CONVO, [
      msg('u1', Constants.NO_PARENT, true, 10),
      responseMsg('a1', 'u1', 50, USAGE_A),
      msg('u2', 'a1', true, 30),
      responseMsg('a2', 'u2', 80, USAGE_B),
    ]);

    const { usage } = sumBranch(CONVO, 'a2');
    expect(usage).toEqual({
      input: 300,
      output: 130,
      cacheWrite: 0,
      cacheRead: 0,
      cost: 0.03,
      costKnown: true,
    });
  });

  it('reads persisted display units (incl. cache) directly', () => {
    /** The backend already normalized per-event; the client reads as-is */
    buildIndex(CONVO, [
      msg('u1', Constants.NO_PARENT, true, 10),
      responseMsg('a1', 'u1', 100, {
        input: 600,
        output: 100,
        cacheWrite: 0,
        cacheRead: 400,
        cost: 0.03,
      }),
    ]);

    const { usage } = sumBranch(CONVO, 'a1');
    expect(usage).toEqual({
      input: 600,
      output: 100,
      cacheWrite: 0,
      cacheRead: 400,
      cost: 0.03,
      costKnown: true,
    });
  });

  it('marks cost unknown when persisted usage omits cost (contextCost off)', () => {
    buildIndex(CONVO, [
      msg('u1', Constants.NO_PARENT, true, 10),
      responseMsg('a1', 'u1', 50, { input: 100, output: 50, cacheWrite: 0, cacheRead: 0 }),
    ]);
    const { usage } = sumBranch(CONVO, 'a1');
    expect(usage.costKnown).toBe(false);
    expect(usage.cost).toBe(0);
    expect(usage.input).toBe(100);
  });

  it('messages without metadata.usage contribute zero (backward compat)', () => {
    buildIndex(CONVO, [msg('u1', Constants.NO_PARENT, true, 10), msg('a1', 'u1', false, 50)]);
    expect(sumBranch(CONVO, 'a1').usage).toEqual(EMPTY_USAGE);
    expect(sumTotalUsage(CONVO)).toEqual(EMPTY_USAGE);
  });

  it('preserves a prior entry usage when a rebuilt message lacks metadata.usage', () => {
    /** Live finalize flushes usage into the index before persisted metadata
     *  reaches the cache; a mid-session rebuild from a cache message without
     *  metadata.usage must not wipe it (regenerate keeps the sibling's cost). */
    buildIndex(CONVO, [msg('u1', Constants.NO_PARENT, true, 10), msg('a1', 'u1', false, 50)]);
    setEntryUsage(CONVO, 'a1', {
      input: 100,
      output: 50,
      cacheWrite: 0,
      cacheRead: 0,
      cost: 0.01,
      costKnown: true,
    });
    /** Rebuild from the same cache (still no metadata.usage on a1) */
    buildIndex(CONVO, [msg('u1', Constants.NO_PARENT, true, 10), msg('a1', 'u1', false, 50)]);
    expect(sumBranch(CONVO, 'a1').usage.cost).toBeCloseTo(0.01);
    expect(sumBranch(CONVO, 'a1').usage.input).toBe(100);
  });

  it('scopes branch usage to the active thread while total spans all branches', () => {
    /** Regenerate: a1 and a1-alt are sibling responses under the same user msg */
    buildIndex(CONVO, [
      msg('u1', Constants.NO_PARENT, true, 10),
      responseMsg('a1', 'u1', 50, USAGE_A),
      responseMsg('a1-alt', 'u1', 80, USAGE_B),
    ]);

    /** Viewing branch B (the regenerated response) */
    expect(sumBranch(CONVO, 'a1-alt').usage.cost).toBeCloseTo(0.02);
    /** Viewing branch A (the original) */
    expect(sumBranch(CONVO, 'a1').usage.cost).toBeCloseTo(0.01);
    /** Total spans both abandoned + active branches */
    const total = sumTotalUsage(CONVO);
    expect(total.cost).toBeCloseTo(0.03);
    expect(total.input).toBe(300);
    expect(total.output).toBe(130);
  });

  it('is idempotent across rebuilds', () => {
    const messages = [
      msg('u1', Constants.NO_PARENT, true, 10),
      responseMsg('a1', 'u1', 50, USAGE_A),
      responseMsg('a1-alt', 'u1', 80, USAGE_B),
    ];
    buildIndex(CONVO, messages);
    const first = sumTotalUsage(CONVO);
    buildIndex(CONVO, messages);
    const second = sumTotalUsage(CONVO);
    expect(second).toEqual(first);
  });

  it('flushes a live response usage via setEntryUsage (no metadata yet)', () => {
    buildIndex(CONVO, [msg('u1', Constants.NO_PARENT, true, 10), msg('a1', 'u1', false, 50)]);
    /** Live response entry has no metadata.usage until persisted; finalize flushes it */
    expect(sumBranch(CONVO, 'a1').usage).toEqual(EMPTY_USAGE);
    setEntryUsage(CONVO, 'a1', {
      input: 100,
      output: 50,
      cacheWrite: 0,
      cacheRead: 0,
      cost: 0.01,
      costKnown: true,
    });
    expect(sumBranch(CONVO, 'a1').usage.cost).toBeCloseTo(0.01);
    expect(sumBranch(CONVO, 'a1').usage.input).toBe(100);
  });

  it('mergeUsage sums two usage records and ORs costKnown', () => {
    const a = { input: 1, output: 2, cacheWrite: 3, cacheRead: 4, cost: 0.5, costKnown: false };
    const b = { input: 10, output: 20, cacheWrite: 30, cacheRead: 40, cost: 1.5, costKnown: true };
    expect(mergeUsage(a, b)).toEqual({
      input: 11,
      output: 22,
      cacheWrite: 33,
      cacheRead: 44,
      cost: 2,
      costKnown: true,
    });
  });

  it('EMPTY_BRANCH carries an empty usage record', () => {
    expect(sumBranch('missing-convo', 'x')).toBe(EMPTY_BRANCH);
    expect(EMPTY_BRANCH.usage).toEqual(EMPTY_USAGE);
  });
});
