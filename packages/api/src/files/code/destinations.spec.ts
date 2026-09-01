import {
  claimCodeDestination,
  reserveCodeDestination,
  createCodeDestinationSet,
  sortCodeFilesByDestinationPriority,
} from './destinations';

describe('claimCodeDestination', () => {
  it('returns the name untouched when nothing has claimed it', () => {
    const set = createCodeDestinationSet();
    expect(claimCodeDestination(set, 'image.png')).toBe('image.png');
  });

  it('disambiguates repeats with a counter, keeping the extension', () => {
    const set = createCodeDestinationSet();
    expect(claimCodeDestination(set, 'image.png')).toBe('image.png');
    expect(claimCodeDestination(set, 'image.png')).toBe('image-2.png');
    expect(claimCodeDestination(set, 'image.png')).toBe('image-3.png');
  });

  it('preserves directory structure when disambiguating', () => {
    const set = createCodeDestinationSet();
    claimCodeDestination(set, 'out/plots/fig.png');
    expect(claimCodeDestination(set, 'out/plots/fig.png')).toBe('out/plots/fig-2.png');
  });

  it('appends to names without an extension', () => {
    const set = createCodeDestinationSet();
    claimCodeDestination(set, 'README');
    expect(claimCodeDestination(set, 'README')).toBe('README-2');
  });

  it('treats a leading dot as part of the name, not an extension', () => {
    const set = createCodeDestinationSet();
    claimCodeDestination(set, '_.env');
    expect(claimCodeDestination(set, '_.env')).toBe('_-2.env');
  });

  it('skips a counter that a real filename already occupies', () => {
    const set = createCodeDestinationSet();
    expect(claimCodeDestination(set, 'image.png')).toBe('image.png');
    expect(claimCodeDestination(set, 'image-2.png')).toBe('image-2.png');
    expect(claimCodeDestination(set, 'image.png')).toBe('image-3.png');
  });

  it('rejects a destination that a claimed directory prefix would swallow', () => {
    const set = createCodeDestinationSet();
    claimCodeDestination(set, 'data/rows.csv');
    expect(claimCodeDestination(set, 'data')).toBe('data-2');
  });

  it('flattens a destination nested under a claimed file', () => {
    const set = createCodeDestinationSet();
    claimCodeDestination(set, 'data');
    expect(claimCodeDestination(set, 'data/rows.csv')).toBe('data__rows.csv');
  });

  it('still disambiguates once a nested destination has been flattened', () => {
    const set = createCodeDestinationSet();
    claimCodeDestination(set, 'data');
    claimCodeDestination(set, 'data__rows.csv');
    expect(claimCodeDestination(set, 'data/rows.csv')).toBe('data__rows-2.csv');
  });

  it('keeps a disambiguated leaf inside the per-segment byte budget', () => {
    const set = createCodeDestinationSet();
    const longName = `${'a'.repeat(251)}.png`;
    expect(Buffer.byteLength(longName, 'utf8')).toBe(255);
    claimCodeDestination(set, longName);
    const second = claimCodeDestination(set, longName);
    expect(second).not.toBe(longName);
    expect(Buffer.byteLength(second, 'utf8')).toBeLessThanOrEqual(255);
    expect(second.endsWith('-2.png')).toBe(true);
  });

  /**
   * The counter search only terminates while trimming a name to the byte cap
   * leaves the counter intact. An earlier cut-from-the-end trim handed back
   * the original name for every counter and hung the request thread, so this
   * asserts distinctness at the cap rather than trusting the composition.
   */
  it('keeps counters distinct at the byte cap across repeated collisions', () => {
    const set = createCodeDestinationSet();
    const longName = `${'a'.repeat(251)}.png`;
    const claimed = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const destination = claimCodeDestination(set, longName);
      expect(Buffer.byteLength(destination, 'utf8')).toBeLessThanOrEqual(255);
      expect(claimed.has(destination)).toBe(false);
      claimed.add(destination);
    }
    expect(claimed.size).toBe(12);
  });

  /**
   * A name that arrives over budget is passed through untouched — capping
   * every name would rewrite paths the caller never had a collision on. Only
   * the disambiguated forms are held to the cap, and they must stay distinct
   * even when the extension leaves no stem to trim.
   */
  it('keeps counters distinct when the extension consumes the whole budget', () => {
    const set = createCodeDestinationSet();
    const longExtension = `_.${'b'.repeat(260)}`;
    expect(claimCodeDestination(set, longExtension)).toBe(longExtension);

    const claimed = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const destination = claimCodeDestination(set, longExtension);
      expect(Buffer.byteLength(destination, 'utf8')).toBeLessThanOrEqual(255);
      expect(claimed.has(destination)).toBe(false);
      claimed.add(destination);
    }
    expect(claimed.size).toBe(5);
  });
});

describe('reserveCodeDestination', () => {
  it('accepts a free name and refuses the repeat', () => {
    const set = createCodeDestinationSet();
    expect(reserveCodeDestination(set, 'image.png')).toBe(true);
    expect(reserveCodeDestination(set, 'image.png')).toBe(false);
  });

  it('refuses either direction of a directory-prefix conflict', () => {
    const nested = createCodeDestinationSet();
    reserveCodeDestination(nested, 'data/rows.csv');
    expect(reserveCodeDestination(nested, 'data')).toBe(false);

    const flat = createCodeDestinationSet();
    reserveCodeDestination(flat, 'data');
    expect(reserveCodeDestination(flat, 'data/rows.csv')).toBe(false);
  });

  it('leaves unrelated names alone', () => {
    const set = createCodeDestinationSet();
    reserveCodeDestination(set, 'data/rows.csv');
    expect(reserveCodeDestination(set, 'database.csv')).toBe(true);
    expect(reserveCodeDestination(set, 'data/other.csv')).toBe(true);
  });

  it('does not reserve a name it refused', () => {
    const set = createCodeDestinationSet();
    reserveCodeDestination(set, 'data');
    expect(reserveCodeDestination(set, 'data/rows.csv')).toBe(false);
    expect(claimCodeDestination(set, 'data/rows.csv')).toBe('data__rows.csv');
  });
});

describe('sortCodeFilesByDestinationPriority', () => {
  it('puts the newest record first so it keeps the bare name', () => {
    const older = { file_id: 'a', createdAt: new Date('2026-01-01T00:00:00Z') };
    const newer = { file_id: 'b', createdAt: new Date('2026-02-01T00:00:00Z') };
    expect(sortCodeFilesByDestinationPriority([older, newer])).toEqual([newer, older]);
  });

  it('accepts serialized dates and epoch millis', () => {
    const older = { file_id: 'a', createdAt: '2026-01-01T00:00:00.000Z' };
    const newer = { file_id: 'b', createdAt: Date.parse('2026-02-01T00:00:00.000Z') };
    expect(sortCodeFilesByDestinationPriority([older, newer])).toEqual([newer, older]);
  });

  it('breaks ties on file_id so the order is stable across turns', () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    const first = { file_id: 'aaa', createdAt };
    const second = { file_id: 'bbb', createdAt };
    expect(sortCodeFilesByDestinationPriority([second, first])).toEqual([first, second]);
    expect(sortCodeFilesByDestinationPriority([first, second])).toEqual([first, second]);
  });

  it('sorts records without a timestamp last rather than dropping them', () => {
    const dated = { file_id: 'a', createdAt: new Date('2026-01-01T00:00:00Z') };
    const undatedEarly = { file_id: 'b' };
    const unparsable = { file_id: 'c', createdAt: 'not-a-date' };
    expect(sortCodeFilesByDestinationPriority([undatedEarly, unparsable, dated])).toEqual([
      dated,
      undatedEarly,
      unparsable,
    ]);
  });

  it('preserves holes instead of throwing on them', () => {
    const dated = { file_id: 'a', createdAt: new Date('2026-01-01T00:00:00Z') };
    expect(sortCodeFilesByDestinationPriority([null, dated, undefined])).toEqual([
      dated,
      null,
      undefined,
    ]);
  });

  it('does not mutate its input', () => {
    const older = { file_id: 'a', createdAt: new Date('2026-01-01T00:00:00Z') };
    const newer = { file_id: 'b', createdAt: new Date('2026-02-01T00:00:00Z') };
    const input = [older, newer];
    sortCodeFilesByDestinationPriority(input);
    expect(input).toEqual([older, newer]);
  });
});
