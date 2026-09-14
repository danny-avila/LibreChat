import { Constants, ContentTypes, DEFAULT_RETAINED_ANSWER_TOKENS } from 'librechat-data-provider';
import {
  buildRetainedAnswersContext,
  collectRetainedAnswers,
  orderConversationBranch,
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

  test('a later stamp for the same tool call replaces the earlier one in place', () => {
    const sets = collectRetainedAnswers([
      { content: [askPart(batchRequest, JSON.stringify({ answers: { environment: 'staging' } }))] },
      { content: [askPart({ question: 'Other?' }, 'later', 'tc-9')] },
      {
        content: [
          askPart(batchRequest, JSON.stringify({ answers: { environment: 'production' } })),
        ],
      },
    ]);
    expect(sets.map((set) => set.answers[0].answer)).toEqual(['production', 'later']);
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

  test('keeps the first row seen for an id, so in-memory rows outrank loaded ones', () => {
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

  test('loads the rest of the branch on demand, only when retention is on', async () => {
    const loadMessages = jest.fn(async () => rows.slice(0, 4));
    const text = await buildRetainedAnswersContext({
      messages: [rows[4]],
      parentMessageId: 'u3',
      loadMessages,
      config: undefined,
      countTokens: countChars,
    });
    expect(text).toContain(ANSWER_LINE);
    expect(loadMessages).toHaveBeenCalledTimes(1);

    const untouched = jest.fn(async () => rows);
    await buildRetainedAnswersContext({
      messages: [rows[4]],
      parentMessageId: 'u3',
      loadMessages: untouched,
      config: { retainedAnswers: { enabled: false } },
      countTokens: countChars,
    });
    expect(untouched).not.toHaveBeenCalled();
    expect(RETAINED_ANSWER_ROW_FIELDS).toBe('messageId parentMessageId content');
  });

  test('carries what is in memory and warns when the stored rows cannot be read', async () => {
    const inMemory = [
      { messageId: 'u9', parentMessageId: NO_PARENT, content: [] },
      { messageId: 'a9', parentMessageId: 'u9', content: [askPart({ question: 'Ok?' }, 'yes')] },
      { messageId: 'u10', parentMessageId: 'a9', content: [] },
    ];
    const text = await buildRetainedAnswersContext({
      messages: inMemory,
      parentMessageId: 'u10',
      loadMessages: async () => {
        throw new Error('rows unavailable');
      },
      config: undefined,
      countTokens: countChars,
    });
    expect(text).toContain('Q: Ok?\nA: yes');
    expect(mockWarn).toHaveBeenCalledTimes(1);
  });
});
