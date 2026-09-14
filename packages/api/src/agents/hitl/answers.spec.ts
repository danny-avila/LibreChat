import { Constants, ContentTypes, DEFAULT_RETAINED_ANSWER_TOKENS } from 'librechat-data-provider';
import {
  buildRetainedAnswersContext,
  collectRetainedAnswers,
  orderConversationBranch,
  renderRetainedAnswers,
  resolveRetainedAnswersConfig,
} from './answers';

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

  test('reads the legacy single question with a bare answer, a wrapped answer, and JSON-looking text verbatim', () => {
    const legacy = { question: 'What should I name the file?' };
    const sets = collectRetainedAnswers([
      { content: [askPart(legacy, 'notes.md', 'tc-a')] },
      { content: [askPart(legacy, JSON.stringify({ answer: 'report.md' }), 'tc-b')] },
      { content: [askPart(legacy, '{"name":"config.json"}', 'tc-c')] },
    ]);
    expect(sets.map((set) => set.answers[0].answer)).toEqual([
      'notes.md',
      'report.md',
      '{"name":"config.json"}',
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
    expect(text).toContain('# Answers the user gave to your questions');
    expect(text).toContain('Q: First?\nA: one');
    expect(text).toContain('Q: Second?\nA: two\n\nQ: Third?\nA: three');
    expect(text?.indexOf('First?')).toBeLessThan(text?.indexOf('Fourth?') ?? -1);
    expect(text).not.toContain('omitted');
  });

  test('drops the oldest sets first once the budget is exceeded and says how many answers went', async () => {
    const header = (await renderRetainedAnswers([sets[2]], 10_000, countChars)) as string;
    const text = (await renderRetainedAnswers(sets, header.length + 5, countChars)) as string;
    expect(text).toContain('Q: Fourth?\nA: four');
    expect(text).not.toContain('Second?');
    expect(text).toContain('(3 earlier answers omitted');
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
    {
      messageId: 'u1',
      parentMessageId: NO_PARENT,
      content: [{ type: 'text', text: 'deploy' }],
    },
    { messageId: 'a1', parentMessageId: 'u1', content: [answered] },
    { messageId: 'u2', parentMessageId: 'a1', content: [{ type: 'text', text: 'go on' }] },
    { messageId: 'a2', parentMessageId: 'u2', content: [summary, { type: 'text', text: 'done' }] },
    { messageId: 'u3', parentMessageId: 'a2', content: [{ type: 'text', text: 'next' }] },
  ];

  test('carries an answer given before a checkpoint summary', async () => {
    const text = await buildRetainedAnswersContext({
      messages: rows,
      parentMessageId: 'u3',
      config: undefined,
      countTokens: countChars,
    });
    expect(text).toContain('Q: Which environment should I deploy to?\nA: staging');
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

  test('appends the answers seeded on a resumed turn after the persisted ones', async () => {
    const seeded = askPart({ question: 'Which window?' }, 'last 7 days', 'tc-seed');
    const text = (await buildRetainedAnswersContext({
      messages: rows,
      parentMessageId: 'u3',
      seedContent: [{ type: 'text', text: 'Checking.' }, seeded],
      config: undefined,
      countTokens: countChars,
    })) as string;
    expect(text.indexOf('A: staging')).toBeLessThan(
      text.indexOf('Q: Which window?\nA: last 7 days'),
    );
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
});
