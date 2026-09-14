import { Constants, ContentTypes, DEFAULT_RETAINED_ANSWER_TOKENS } from 'librechat-data-provider';
import {
  applyRetainedAnswers,
  buildRetainedAnswersContext,
  collectRetainedAnswers,
  orderConversationBranch,
  reachesBranchRoot,
  renderRetainedAnswers,
  resolveRetainedAnswersConfig,
  RETAINED_ANSWER_ROW_FIELDS,
} from './answers';

const mockWarn = jest.fn();
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    warn: (...args: unknown[]) => mockWarn(...args),
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

const ASK = 'ask_user_question';
const NO_PARENT: string = Constants.NO_PARENT;

const countChars = (text: string): number => text.length;

function askPart(args: unknown, output: unknown, id = 'tc-1') {
  return {
    type: ContentTypes.TOOL_CALL,
    tool_call: {
      id,
      name: ASK,
      args: typeof args === 'string' ? args : JSON.stringify(args),
      output,
      progress: 1,
      inputValidationError: undefined as true | undefined,
    },
  };
}

const batchRequest = {
  questions: [
    { id: 'environment', question: 'Which environment should I deploy to?' },
    { id: 'window', question: 'Which time window?', header: 'Window' },
  ],
};

describe('collectRetainedAnswers', () => {
  test('maps a batched answer set onto its questions in question order', () => {
    const sets = collectRetainedAnswers([
      {
        content: [
          { type: ContentTypes.TEXT, text: 'Let me check.' },
          askPart(
            batchRequest,
            JSON.stringify({ answers: { window: 'last 7 days', environment: 'staging' } }),
          ),
        ],
      },
    ]);

    expect(sets).toEqual([
      {
        toolCallId: 'tc-1',
        answers: [
          { question: 'Which environment should I deploy to?', answer: 'staging' },
          { question: 'Which time window?', answer: 'last 7 days' },
        ],
      },
    ]);
  });

  test('keeps a question whose answer is missing out of the set without dropping the rest', () => {
    const sets = collectRetainedAnswers([
      { content: [askPart(batchRequest, JSON.stringify({ answers: { window: 'last 7 days' } }))] },
    ]);
    expect(sets[0].answers).toEqual([{ question: 'Which time window?', answer: 'last 7 days' }]);
  });

  test('quotes a legacy single-question answer exactly as typed, JSON-looking or not', () => {
    const legacy = { question: 'What should I name the file?' };
    const sets = collectRetainedAnswers([
      { content: [askPart(legacy, 'notes.md', 'tc-a')] },
      { content: [askPart(legacy, '{"answer":"yes","reason":"it is late"}', 'tc-b')] },
      { content: [askPart(legacy, '{"answers":{"x":"y"}}', 'tc-c')] },
    ]);
    expect(sets.map((set) => set.answers[0].answer)).toEqual([
      'notes.md',
      '{"answer":"yes","reason":"it is late"}',
      '{"answers":{"x":"y"}}',
    ]);
  });

  test('reads a pause record whose stored args are the bare question string', () => {
    const sets = collectRetainedAnswers([
      { content: [askPart('"What should I name the file?"', 'notes.md', 'tc-s')] },
    ]);
    expect(sets).toEqual([
      {
        toolCallId: 'tc-s',
        answers: [{ question: 'What should I name the file?', answer: 'notes.md' }],
      },
    ]);
  });

  test('skips a call whose input failed validation, whose output is the error', () => {
    const failed = askPart(
      { question: 'Deploy where?' },
      'Option labels must be 280 characters or fewer.',
      'tc-f',
    );
    failed.tool_call.inputValidationError = true;
    expect(collectRetainedAnswers([{ content: [failed] }])).toEqual([]);
  });

  test('ignores other tools, unanswered asks, and malformed stamps', () => {
    const sets = collectRetainedAnswers([
      {
        content: [
          {
            type: ContentTypes.TOOL_CALL,
            tool_call: { id: 'x', name: 'lookup', args: '{}', output: 'ok' },
          },
          askPart(batchRequest, ''),
          askPart(batchRequest, undefined, 'tc-2'),
          askPart('not json', JSON.stringify({ answers: { environment: 'staging' } }), 'tc-3'),
          askPart(batchRequest, 'plain text for a two-question batch', 'tc-4'),
          {
            type: ContentTypes.TOOL_CALL,
            tool_call: { id: 'tc-5', name: ASK, args: '{}', output: 'x' },
          },
        ],
      },
      { content: 'not an array' },
      null as never,
    ]);
    expect(sets).toEqual([]);
  });

  test('keeps every answered call, even when a provider reuses a tool-call id across rows', () => {
    const sets = collectRetainedAnswers([
      {
        content: [
          askPart(batchRequest, JSON.stringify({ answers: { environment: 'staging' } }), 'call_0'),
        ],
      },
      { content: [askPart({ question: 'Other?' }, 'later', 'call_1')] },
      { content: [askPart({ question: 'Ship it?' }, 'yes', 'call_0')] },
    ]);
    expect(sets.map((set) => set.answers[0].answer)).toEqual(['staging', 'later', 'yes']);
  });
});

describe('orderConversationBranch', () => {
  const rows = [
    { messageId: 'root', parentMessageId: NO_PARENT },
    { messageId: 'a1', parentMessageId: 'root' },
    { messageId: 'u2', parentMessageId: 'a1' },
    { messageId: 'a2', parentMessageId: 'u2' },
    { messageId: 'u2-alt', parentMessageId: 'a1' },
    { messageId: 'a2-alt', parentMessageId: 'u2-alt' },
  ];

  test('walks parents from the leaf and returns only that branch, oldest first', () => {
    expect(orderConversationBranch(rows, 'a2').map((row) => row.messageId)).toEqual([
      'root',
      'a1',
      'u2',
      'a2',
    ]);
    expect(orderConversationBranch(rows, 'a2-alt').map((row) => row.messageId)).toEqual([
      'root',
      'a1',
      'u2-alt',
      'a2-alt',
    ]);
  });

  test('returns nothing for no parent, an unknown parent, and stops on a cycle', () => {
    expect(orderConversationBranch(rows, NO_PARENT)).toEqual([]);
    expect(orderConversationBranch(rows, null)).toEqual([]);
    expect(orderConversationBranch(rows, 'missing')).toEqual([]);
    const cyclic = [
      { messageId: 'x', parentMessageId: 'y' },
      { messageId: 'y', parentMessageId: 'x' },
    ];
    expect(orderConversationBranch(cyclic, 'x').map((row) => row.messageId)).toEqual(['y', 'x']);
  });

  test('keeps the first row seen for an id, so the caller decides which rows win', () => {
    const memory = { messageId: 'u2', parentMessageId: 'a1', content: 'memory' };
    const loaded = { messageId: 'u2', parentMessageId: 'a1', content: 'loaded' };
    const branch: Array<{ messageId: string; parentMessageId: string; content?: string }> = [
      memory,
      ...rows,
      loaded,
    ];
    expect(orderConversationBranch(branch, 'u2').map((row) => row.content)).toEqual([
      undefined,
      undefined,
      'memory',
    ]);
  });

  test('reachesBranchRoot tells a whole branch from one cut short of its root', () => {
    expect(reachesBranchRoot([])).toBe(false);
    expect(reachesBranchRoot([{ messageId: 'r', parentMessageId: NO_PARENT }])).toBe(true);
    expect(reachesBranchRoot([{ messageId: 'r', parentMessageId: null }])).toBe(true);
    expect(reachesBranchRoot([{ messageId: 'r', parentMessageId: '' }])).toBe(true);
    expect(reachesBranchRoot([{ messageId: 'a2', parentMessageId: 'u2' }])).toBe(false);
  });
});

describe('renderRetainedAnswers', () => {
  const sets = [
    { toolCallId: 'tc-1', answers: [{ question: 'First?', answer: 'one' }] },
    {
      toolCallId: 'tc-2',
      answers: [
        { question: 'Second?', answer: 'two' },
        { question: 'Third?', answer: 'three' },
      ],
    },
    { toolCallId: 'tc-3', answers: [{ question: 'Fourth?', answer: 'four' }] },
  ];

  test('renders every answer oldest first under the header when the budget allows', async () => {
    const text = await renderRetainedAnswers(sets, 10_000, countChars);
    expect(text).toContain(
      '# Answers the user gave to questions asked earlier in this conversation',
    );
    expect(text).toContain('Q: First?\nA: one');
    expect(text).toContain('Q: Second?\nA: two\n\nQ: Third?\nA: three');
    expect(text?.indexOf('First?')).toBeLessThan(text?.indexOf('Fourth?') ?? -1);
    expect(text).not.toContain('omitted');
  });

  test('drops the oldest sets first once the budget is exceeded and says how many answers went', async () => {
    const newest = (await renderRetainedAnswers([sets[2]], 10_000, countChars)) as string;
    const text = (await renderRetainedAnswers(sets, newest.length + 5, countChars)) as string;
    expect(text).toContain('Q: Fourth?\nA: four');
    expect(text).not.toContain('Second?');
    expect(text).toContain('(3 earlier answers omitted');
  });

  test('budgets the separators and the note, so many tiny sets still fit the ceiling', async () => {
    const tiny = Array.from({ length: 60 }, (_, index) => ({
      toolCallId: `tc-${index}`,
      answers: [{ question: 'Q?', answer: 'y' }],
    }));
    const newest = (await renderRetainedAnswers([tiny[59]], 10_000, countChars)) as string;
    const maxTokens = newest.length + 120;
    const text = (await renderRetainedAnswers(tiny, maxTokens, countChars)) as string;
    expect(text.length).toBeLessThanOrEqual(maxTokens);
    expect(text).toContain('earlier answers omitted');
    expect(text.endsWith('Q: Q?\nA: y')).toBe(true);
  });

  test('does not reserve the omission note when every set fits without it', async () => {
    const full = (await renderRetainedAnswers(sets, 10_000, countChars)) as string;
    expect(full).not.toContain('omitted');
    const exact = (await renderRetainedAnswers(sets, full.length, countChars)) as string;
    expect(exact).toBe(full);
    const short = (await renderRetainedAnswers(sets, full.length - 1, countChars)) as string;
    expect(short).toContain('omitted');
    expect(short).not.toContain('First?');
  });

  test('always keeps the newest set even when it alone exceeds the budget', async () => {
    const text = (await renderRetainedAnswers(sets, 1, countChars)) as string;
    expect(text).toContain('Q: Fourth?\nA: four');
    expect(text).not.toContain('First?');
  });

  test('returns undefined for no sets', async () => {
    expect(await renderRetainedAnswers([], 100, countChars)).toBeUndefined();
  });
});

describe('resolveRetainedAnswersConfig', () => {
  test('is on with the default budget when nothing is configured', () => {
    expect(resolveRetainedAnswersConfig(undefined)).toEqual({
      enabled: true,
      maxTokens: DEFAULT_RETAINED_ANSWER_TOKENS,
    });
    expect(resolveRetainedAnswersConfig({})).toEqual({
      enabled: true,
      maxTokens: DEFAULT_RETAINED_ANSWER_TOKENS,
    });
  });

  test('honors an explicit off switch and a positive integer budget', () => {
    expect(resolveRetainedAnswersConfig({ retainedAnswers: { enabled: false } }).enabled).toBe(
      false,
    );
    expect(resolveRetainedAnswersConfig({ retainedAnswers: { maxTokens: 512.9 } }).maxTokens).toBe(
      512,
    );
  });

  test('falls back to the default for a budget that reaches runtime unvalidated', () => {
    for (const maxTokens of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '2048', null]) {
      expect(
        resolveRetainedAnswersConfig({ retainedAnswers: { maxTokens: maxTokens as never } })
          .maxTokens,
      ).toBe(DEFAULT_RETAINED_ANSWER_TOKENS);
    }
  });
});

describe('buildRetainedAnswersContext', () => {
  const answered = askPart(batchRequest, JSON.stringify({ answers: { environment: 'staging' } }));
  const summary = {
    type: ContentTypes.SUMMARY,
    text: 'Earlier context, compacted.',
    tokenCount: 5,
  };
  const rows = [
    { messageId: 'u1', parentMessageId: NO_PARENT, content: [{ type: 'text', text: 'deploy' }] },
    { messageId: 'a1', parentMessageId: 'u1', content: [answered] },
    { messageId: 'u2', parentMessageId: 'a1', content: [{ type: 'text', text: 'go on' }] },
    { messageId: 'a2', parentMessageId: 'u2', content: [summary, { type: 'text', text: 'done' }] },
    { messageId: 'u3', parentMessageId: 'a2', content: [{ type: 'text', text: 'next' }] },
  ];
  const ANSWER_LINE = 'Q: Which environment should I deploy to?\nA: staging';

  beforeEach(() => {
    mockWarn.mockClear();
  });

  test('carries an answer given before a checkpoint summary', async () => {
    const text = await buildRetainedAnswersContext({
      messages: rows,
      parentMessageId: 'u3',
      config: undefined,
      countTokens: countChars,
    });
    expect(text).toContain(ANSWER_LINE);
  });

  test('reads only the branch that ends at the parent', async () => {
    const text = await buildRetainedAnswersContext({
      messages: [...rows, { messageId: 'u1-alt', parentMessageId: NO_PARENT, content: [] }],
      parentMessageId: 'u1-alt',
      config: undefined,
      countTokens: countChars,
    });
    expect(text).toBeUndefined();
  });

  test('yields nothing when disabled or when no answer exists', async () => {
    expect(
      await buildRetainedAnswersContext({
        messages: rows,
        parentMessageId: 'u3',
        config: { retainedAnswers: { enabled: false } },
        countTokens: countChars,
      }),
    ).toBeUndefined();
    expect(
      await buildRetainedAnswersContext({
        messages: rows,
        parentMessageId: 'u1',
        config: undefined,
        countTokens: countChars,
      }),
    ).toBeUndefined();
  });

  test('completes a branch cut short of its root through the injected query', async () => {
    const getMessages = jest.fn(async () => rows);
    const cut = [
      { ...rows[3], content: [{ type: 'text', text: 'Earlier context, compacted.' }] },
      rows[4],
    ];
    const text = await buildRetainedAnswersContext({
      messages: cut,
      parentMessageId: 'u3',
      getMessages,
      conversationId: 'convo-1',
      userId: 'user-1',
      config: undefined,
      countTokens: countChars,
    });
    expect(text).toContain(ANSWER_LINE);
    expect(getMessages).toHaveBeenCalledWith(
      { conversationId: 'convo-1', user: 'user-1' },
      RETAINED_ANSWER_ROW_FIELDS,
    );
    expect(RETAINED_ANSWER_ROW_FIELDS).toBe('messageId parentMessageId content');
  });

  test('completes the branch from the rows the turn already read instead of querying again', async () => {
    const getMessages = jest.fn(async () => rows);
    const cut = [
      { ...rows[3], content: [{ type: 'text', text: 'Earlier context, compacted.' }] },
      rows[4],
    ];
    const text = await buildRetainedAnswersContext({
      messages: cut,
      parentMessageId: 'u3',
      storedRows: rows,
      getMessages,
      conversationId: 'convo-1',
      userId: 'user-1',
      config: undefined,
      countTokens: countChars,
    });
    expect(text).toContain(ANSWER_LINE);
    expect(getMessages).not.toHaveBeenCalled();
  });

  test('completes a lone event message the same way', async () => {
    const getMessages = jest.fn(async () => rows);
    const text = await buildRetainedAnswersContext({
      messages: [rows[4]],
      parentMessageId: 'u3',
      getMessages,
      conversationId: 'convo-1',
      userId: 'user-1',
      config: undefined,
      countTokens: countChars,
    });
    expect(text).toContain(ANSWER_LINE);
    expect(getMessages).toHaveBeenCalledTimes(1);
  });

  test('never queries when the rows in memory reach the root or retention is off', async () => {
    const getMessages = jest.fn(async () => rows);
    const whole = await buildRetainedAnswersContext({
      messages: rows,
      parentMessageId: 'u3',
      getMessages,
      conversationId: 'convo-1',
      userId: 'user-1',
      config: undefined,
      countTokens: countChars,
    });
    expect(whole).toContain(ANSWER_LINE);
    await buildRetainedAnswersContext({
      messages: [rows[4]],
      parentMessageId: 'u3',
      getMessages,
      conversationId: 'convo-1',
      userId: 'user-1',
      config: { retainedAnswers: { enabled: false } },
      countTokens: countChars,
    });
    expect(getMessages).not.toHaveBeenCalled();
  });

  test('lets a stored row outrank the prompt-shaped copy in memory', async () => {
    const withAsk = {
      messageId: 'a2',
      parentMessageId: 'u2',
      content: [summary, askPart({ question: 'Ship it?' }, 'yes', 'tc-a2')],
    };
    const shaped = { ...withAsk, content: [{ type: 'text', text: 'Earlier context, compacted.' }] };
    const text = await buildRetainedAnswersContext({
      messages: [shaped, rows[4]],
      parentMessageId: 'u3',
      getMessages: async () => [rows[0], rows[1], rows[2], withAsk],
      conversationId: 'convo-1',
      userId: 'user-1',
      config: undefined,
      countTokens: countChars,
    });
    expect(text).toContain(ANSWER_LINE);
    expect(text).toContain('Q: Ship it?\nA: yes');
  });

  test('carries what is in memory and warns when the stored rows cannot be read', async () => {
    const inMemory = [
      { messageId: 'a9', parentMessageId: 'u9', content: [askPart({ question: 'Ok?' }, 'yes')] },
      { messageId: 'u10', parentMessageId: 'a9', content: [] },
    ];
    const text = await buildRetainedAnswersContext({
      messages: inMemory,
      parentMessageId: 'u10',
      getMessages: async () => {
        throw new Error('rows unavailable');
      },
      conversationId: 'convo-1',
      userId: 'user-1',
      config: undefined,
      countTokens: countChars,
    });
    expect(text).toContain('Q: Ok?\nA: yes');
    expect(mockWarn).toHaveBeenCalledTimes(1);
  });

  test('never rejects: a failing counter costs the turn its block, not the turn', async () => {
    const text = await buildRetainedAnswersContext({
      messages: rows,
      parentMessageId: 'u3',
      config: undefined,
      countTokens: () => {
        throw new Error('tokenizer down');
      },
    });
    expect(text).toBeUndefined();
    expect(mockWarn).toHaveBeenCalledTimes(1);
  });
});

describe('applyRetainedAnswers', () => {
  const block = '# Answers\n\nQ: Deploy where?\nA: staging';
  const countTokens = (message: { content?: unknown }) =>
    JSON.stringify(message.content ?? '').length;

  function turn() {
    const orderedMessages = [
      { isCreatedByUser: true },
      { isCreatedByUser: false },
      { isCreatedByUser: true },
      { isCreatedByUser: false },
    ];
    const formattedMessages = [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: 'latest question' },
      { role: 'assistant', content: 'unfinished' },
    ];
    const indexTokenCountMap: Record<number, number | undefined> = { 0: 5, 1: 5, 2: 5000, 3: 5 };
    return { orderedMessages, formattedMessages, indexTokenCountMap };
  }

  test('quotes into the latest user-authored copy, measured against a fresh count', async () => {
    const { orderedMessages, formattedMessages, indexTokenCountMap } = turn();
    const build = jest.fn(async () => undefined);
    const added = await applyRetainedAnswers({
      block,
      orderedMessages,
      formattedMessages,
      indexTokenCountMap,
      countTokens,
      memoryCopy: { needed: true, build },
    });
    expect(formattedMessages[2].content).toBe(`${block}\n\nlatest question`);
    expect(formattedMessages[3].content).toBe('unfinished');
    const expected =
      countTokens({ content: `${block}\n\nlatest question` }) -
      countTokens({ content: 'latest question' });
    expect(added).toBe(expected);
    expect(added).toBeGreaterThan(block.length);
    expect(indexTokenCountMap[2]).toBe(5000 + added);
    expect(build).toHaveBeenCalledTimes(1);
  });

  test('builds the memory copy only when it is still needed', async () => {
    const { orderedMessages, formattedMessages, indexTokenCountMap } = turn();
    const build = jest.fn(async () => undefined);
    await applyRetainedAnswers({
      block,
      orderedMessages,
      formattedMessages,
      indexTokenCountMap,
      countTokens,
      memoryCopy: { needed: false, build },
    });
    expect(formattedMessages[2].content).toContain(block);
    expect(build).not.toHaveBeenCalled();
  });

  test('applies nothing without a block or without a user-authored row', async () => {
    const empty = turn();
    const build = jest.fn(async () => undefined);
    expect(
      await applyRetainedAnswers({
        block: undefined,
        ...empty,
        countTokens,
        memoryCopy: { needed: true, build },
      }),
    ).toBe(0);
    const assistantOnly = turn();
    assistantOnly.orderedMessages.forEach((message) => {
      message.isCreatedByUser = false;
    });
    expect(
      await applyRetainedAnswers({
        block,
        ...assistantOnly,
        countTokens,
        memoryCopy: { needed: true, build },
      }),
    ).toBe(0);
    expect(assistantOnly.formattedMessages[2].content).toBe('latest question');
    expect(build).not.toHaveBeenCalled();
  });
});
