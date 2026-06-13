import { Constants, Providers } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import {
  buildIndex,
  upsertEntries,
  migrateIndex,
  clearIndex,
  hasIndex,
  sumBranch,
  findBranchSnapshotAnchor,
  estimateTokens,
  normalizeUsageUnits,
  formatCost,
  groupToolTokens,
  countTrailingOutputChars,
  EMPTY_BRANCH,
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

  it('skips trailing in-progress tool parts before collecting', () => {
    expect(countTrailingOutputChars([text('aaaa'), tool(), text('ccc'), tool()])).toBe(3);
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
