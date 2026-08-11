import {
  createPartialTextCursor,
  consumeCumulativeTextSnapshot,
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
