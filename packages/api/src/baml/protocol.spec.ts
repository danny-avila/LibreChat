import {
  createPartialTextCursor,
  consumeCumulativeTextSnapshot,
  toChunkCandidate,
  DIVERGENT_PARTIAL_MESSAGE,
  PARSE_ERROR_MESSAGE,
  type PartialTextEmission,
} from './protocol';

const textSnapshot = (reply: unknown): unknown => ({ reply, tools: [] });

const consume = (snapshots: readonly unknown[]): readonly PartialTextEmission[] => {
  let cursor = createPartialTextCursor();
  const emissions: PartialTextEmission[] = [];

  for (const snapshot of snapshots) {
    const step = consumeCumulativeTextSnapshot(cursor, snapshot);
    cursor = step.cursor;
    if (step.emission != null) {
      emissions.push(step.emission);
    }
  }

  return emissions;
};

const emittedKinds = (emissions: readonly PartialTextEmission[]): Set<string> =>
  new Set(emissions.map((emission) => emission.kind));

describe('BAML cumulative partial protocol', () => {
  it('emits only strict-prefix deltas and independently suppresses identical snapshots', () => {
    const emissions = consume([
      textSnapshot('H'),
      textSnapshot('Hel'),
      textSnapshot('Hel'),
      textSnapshot('Hello'),
    ]);

    expect(emissions).toStrictEqual([
      { kind: 'text', text: 'H' },
      { kind: 'text', text: 'el' },
      { kind: 'text', text: 'lo' },
    ]);
    expect(emittedKinds(emissions)).toStrictEqual(new Set(['text']));
  });

  it('emits one terminal parse_error for a divergent snapshot without appending it', () => {
    const emissions = consume([
      textSnapshot('Hello'),
      textSnapshot('Help'),
      textSnapshot('Hello again'),
      textSnapshot('Hello again'),
    ]);

    expect(emissions).toStrictEqual([
      { kind: 'text', text: 'Hello' },
      {
        kind: 'failure',
        failure: { code: 'parse_error', message: DIVERGENT_PARTIAL_MESSAGE },
      },
    ]);
    expect(emittedKinds(emissions)).toStrictEqual(new Set(['text', 'failure']));
  });

  it.each([
    ['a non-object snapshot', null],
    ['a non-string reply', { reply: ['not text'], tools: [] }],
    ['a non-array tools field', { reply: null, tools: {} }],
    ['a tool without a string name', { reply: null, tools: [{ name: 7, args: {} }] }],
    [
      'a tool with non-wire arguments',
      { reply: null, tools: [{ name: 'get_weather', args: { city: ['Paris'] } }] },
    ],
  ])('emits one terminal parse_error for %s', (_name, invalidSnapshot) => {
    const emissions = consume([
      textSnapshot('safe'),
      invalidSnapshot,
      textSnapshot('safe trailing content'),
    ]);

    expect(emissions).toStrictEqual([
      { kind: 'text', text: 'safe' },
      {
        kind: 'failure',
        failure: { code: 'parse_error', message: PARSE_ERROR_MESSAGE },
      },
    ]);
    expect(emittedKinds(emissions)).toStrictEqual(new Set(['text', 'failure']));
  });

  it('accepts a structurally valid tool partial without treating it as text', () => {
    const emissions = consume([
      {
        reply: null,
        tools: [{ name: 'get_weather', args: { city: 'Paris' } }],
      },
    ]);

    expect(emissions).toStrictEqual([]);
    expect(emittedKinds(emissions)).toStrictEqual(new Set());
  });
});

describe('BAML native stream candidate flattening (worker boundary)', () => {
  it('treats an unset reply or tools field as "not yet populated", not malformed', () => {
    expect(toChunkCandidate(undefined, undefined)).toStrictEqual({
      ok: true,
      value: { reply: null, tools: [] },
    });
    expect(toChunkCandidate('partial so far', undefined)).toStrictEqual({
      ok: true,
      value: { reply: 'partial so far', tools: [] },
    });
  });

  it('remaps a native tool selection to the wire shape without losing or renaming fields', () => {
    expect(toChunkCandidate(null, [{ tool: 'get_weather', city: 'Paris' }])).toStrictEqual({
      ok: true,
      value: { reply: null, tools: [{ name: 'get_weather', args: { city: 'Paris' } }] },
    });
  });

  it('stringifies a non-primitive tool argument and preserves an explicit null argument', () => {
    expect(
      toChunkCandidate(null, [{ tool: 'web_search', query: null, extra: [1, 2] }]),
    ).toStrictEqual({
      ok: true,
      value: {
        reply: null,
        tools: [{ name: 'web_search', args: { query: null, extra: '1,2' } }],
      },
    });
  });

  it.each([
    ['a number', 42],
    ['a boolean', true],
    ['an object', { text: 'hi' }],
    ['an array', ['hi']],
  ])(
    'does not coerce a wrong-typed reply (%s) into null — reports the snapshot invalid instead',
    (_name, badReply) => {
      expect(toChunkCandidate(badReply, [])).toStrictEqual({ ok: false });
    },
  );

  it('does not coerce a non-array, non-undefined tools field into an empty list', () => {
    expect(toChunkCandidate(null, 'not an array')).toStrictEqual({ ok: false });
  });

  it('does not silently drop an unmappable tool selection out of the array — invalidates the whole snapshot', () => {
    expect(
      toChunkCandidate(null, [
        { tool: 'get_weather', city: 'Paris' },
        { city: 'missing the tool discriminator' },
      ]),
    ).toStrictEqual({ ok: false });
    expect(toChunkCandidate(null, ['not a record'])).toStrictEqual({ ok: false });
  });
});
