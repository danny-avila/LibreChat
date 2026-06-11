import { Constants } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import {
  buildIndex,
  upsertEntries,
  migrateIndex,
  clearIndex,
  hasIndex,
  sumBranch,
  estimateTokens,
  calcUsageCost,
  costFromUnits,
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

describe('estimateTokens', () => {
  it('estimates chars/4 scaled by calibration ratio', () => {
    expect(estimateTokens(400)).toBe(100);
    expect(estimateTokens(400, 1.1)).toBe(110);
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens(100, 0)).toBe(25);
  });
});

describe('calcUsageCost', () => {
  const rates = { prompt: 3, completion: 15, cacheWrite: 3.75, cacheRead: 0.3 };

  it('prices additive cache usage (Anthropic pattern)', () => {
    const cost = calcUsageCost(
      {
        input_tokens: 1000,
        output_tokens: 500,
        input_token_details: { cache_creation: 2000, cache_read: 10000 },
      },
      rates,
    );
    expect(cost).toBeCloseTo((1000 * 3 + 2000 * 3.75 + 10000 * 0.3 + 500 * 15) / 1e6);
  });

  it('prices inclusive cache usage (OpenAI pattern)', () => {
    const cost = calcUsageCost(
      {
        input_tokens: 10000,
        output_tokens: 500,
        input_token_details: { cache_read: 4000 },
      },
      rates,
    );
    expect(cost).toBeCloseTo((6000 * 3 + 4000 * 0.3 + 500 * 15) / 1e6);
  });

  it('returns 0 without rates', () => {
    expect(calcUsageCost({ input_tokens: 100, output_tokens: 100 })).toBe(0);
    expect(calcUsageCost({ input_tokens: 100 }, { context: 1000 })).toBe(0);
  });

  it('prices summed normalized units identically to per-event costs', () => {
    const anthropicEvent = {
      input_tokens: 1000,
      output_tokens: 500,
      input_token_details: { cache_creation: 2000, cache_read: 10000 },
    };
    const openAIEvent = {
      input_tokens: 10000,
      output_tokens: 500,
      input_token_details: { cache_read: 4000 },
    };
    const perEvent = calcUsageCost(anthropicEvent, rates) + calcUsageCost(openAIEvent, rates);

    const a = normalizeUsageUnits(anthropicEvent);
    const b = normalizeUsageUnits(openAIEvent);
    const summed = costFromUnits(
      {
        input: a.input + b.input,
        output: a.output + b.output,
        cacheWrite: a.cacheWrite + b.cacheWrite,
        cacheRead: a.cacheRead + b.cacheRead,
      },
      rates,
    );
    expect(summed).toBeCloseTo(perEvent);
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
