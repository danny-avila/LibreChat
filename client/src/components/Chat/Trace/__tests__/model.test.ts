import type { TTraceRecord } from 'librechat-data-provider';
import {
  turnKey,
  panWindow,
  zoomWindow,
  assignLanes,
  clampWindow,
  flattenRows,
  buildTraceModel,
  collapsibleKeys,
} from '../model';

const BASE = Date.UTC(2026, 8, 12, 11, 30, 0);
const at = (offsetMs: number) => new Date(BASE + offsetMs).toISOString();

function record(overrides: Partial<TTraceRecord> & Pick<TTraceRecord, 'id'>): TTraceRecord {
  return {
    traceId: 'trace-1',
    messageId: 'response-1',
    parentId: null,
    kind: 'span',
    name: overrides.id,
    startTime: at(0),
    endTime: at(1000),
    status: 'ok',
    ...overrides,
  };
}

const noFilter = { collapsed: new Set<string>(), query: '', window: null };
const rowKeys = (rows: ReturnType<typeof flattenRows>) => rows.map((row) => row.key);

describe('buildTraceModel', () => {
  it('nests records under their parents and orders turns and siblings by start', () => {
    const model = buildTraceModel([
      record({
        id: 'late-turn-root',
        messageId: 'response-2',
        startTime: at(5000),
        endTime: at(6000),
      }),
      record({ id: 'tool', parentId: 'root', kind: 'tool', startTime: at(600), endTime: at(900) }),
      record({
        id: 'llm',
        parentId: 'root',
        kind: 'generation',
        startTime: at(100),
        endTime: at(500),
      }),
      record({ id: 'root', kind: 'agent', startTime: at(0), endTime: at(1000) }),
    ]);

    expect(model.turns.map((turn) => turn.messageId)).toEqual(['response-1', 'response-2']);
    expect(model.nodes.get('root')?.childIds).toEqual(['llm', 'tool']);
    expect(model.nodes.get('tool')?.depth).toBe(1);
    expect(rowKeys(flattenRows(model, noFilter))).toEqual([
      turnKey('response-1'),
      'root',
      'llm',
      'tool',
      turnKey('response-2'),
      'late-turn-root',
    ]);
  });

  it('keeps records with a missing, cross-turn or cyclic parent as roots instead of dropping them', () => {
    const model = buildTraceModel([
      record({ id: 'orphan', parentId: 'not-loaded' }),
      record({ id: 'other-turn', messageId: 'response-2', parentId: 'orphan' }),
      record({ id: 'a', parentId: 'b', startTime: at(10) }),
      record({ id: 'b', parentId: 'a', startTime: at(20) }),
      record({ id: 'self', parentId: 'self', startTime: at(30) }),
    ]);

    const keys = rowKeys(flattenRows(model, noFilter));
    expect(new Set(keys)).toEqual(
      new Set([
        turnKey('response-1'),
        turnKey('response-2'),
        'orphan',
        'other-turn',
        'a',
        'b',
        'self',
      ]),
    );
    expect(keys).toHaveLength(7);
    expect(model.nodes.get('other-turn')?.parentId).toBeNull();
    expect(model.nodes.get('self')?.parentId).toBeNull();
    const cycle = [model.nodes.get('a'), model.nodes.get('b')];
    expect(cycle.filter((node) => node?.parentId == null)).toHaveLength(1);
  });

  it('keeps a running record as a start with no invented duration', () => {
    const model = buildTraceModel([
      record({ id: 'root', startTime: at(0), endTime: at(2000) }),
      record({
        id: 'running',
        parentId: 'root',
        status: 'running',
        startTime: at(3000),
        endTime: undefined,
      }),
    ]);

    expect(model.nodes.get('running')?.end).toBeUndefined();
    expect(model.end).toBe(BASE + 3000);
    expect(model.summary.running).toBe(1);
  });

  it('clamps first-token time inside the record and repairs an end before its start', () => {
    const model = buildTraceModel([
      record({
        id: 'llm',
        kind: 'generation',
        startTime: at(1000),
        endTime: at(3000),
        completionStartTime: at(5000),
      }),
      record({ id: 'backwards', startTime: at(1000), endTime: at(500) }),
      record({ id: 'invalid', startTime: 'not a date' }),
    ]);

    expect(model.nodes.get('llm')?.firstToken).toBe(BASE + 3000);
    expect(model.nodes.get('backwards')?.end).toBe(BASE + 1000);
    expect(model.nodes.has('invalid')).toBe(false);
  });

  it('summarizes generations, tools, tokens, cost and errors', () => {
    const model = buildTraceModel([
      record({ id: 'root', kind: 'agent', startTime: at(0), endTime: at(4000) }),
      record({
        id: 'llm-1',
        parentId: 'root',
        kind: 'generation',
        usage: { input: 100, output: 20, total: 120 },
        cost: 0.01,
      }),
      record({
        id: 'llm-2',
        parentId: 'root',
        kind: 'generation',
        usage: { input: 10, output: 5 },
        cost: 0.005,
      }),
      record({ id: 'tool', parentId: 'root', kind: 'tool', status: 'error' }),
    ]);

    expect(model.summary).toEqual({
      duration: 4000,
      turns: 1,
      generations: 2,
      toolCalls: 1,
      errors: 1,
      running: 0,
      inputTokens: 110,
      outputTokens: 25,
      totalTokens: 135,
      cost: expect.closeTo(0.015),
    });
    expect(model.turns[0].errorCount).toBe(1);
  });

  it('withholds the cost total when any model call with usage has no price', () => {
    const model = buildTraceModel([
      record({ id: 'priced', kind: 'generation', usage: { total: 100 }, cost: 0.02 }),
      record({ id: 'unpriced', kind: 'generation', usage: { total: 50 } }),
    ]);

    expect(model.summary.cost).toBeUndefined();
    expect(model.summary.totalTokens).toBe(150);
  });

  it('keeps the last copy of a record loaded twice', () => {
    const model = buildTraceModel([
      record({ id: 'root', status: 'running', endTime: undefined }),
      record({ id: 'root', status: 'ok' }),
    ]);

    expect(model.nodes.size).toBe(1);
    expect(model.nodes.get('root')?.record.status).toBe('ok');
  });
});

describe('flattenRows', () => {
  const model = buildTraceModel([
    record({ id: 'root', kind: 'agent', startTime: at(0), endTime: at(10_000) }),
    record({
      id: 'llm',
      parentId: 'root',
      kind: 'generation',
      model: 'gpt-5',
      startTime: at(0),
      endTime: at(2000),
    }),
    record({
      id: 'tool',
      parentId: 'root',
      kind: 'tool',
      name: 'web_search',
      startTime: at(5000),
      endTime: at(6000),
    }),
    record({
      id: 'nested',
      parentId: 'tool',
      name: 'fetch',
      startTime: at(5100),
      endTime: at(5900),
    }),
  ]);

  it('places each row among its visible siblings rather than the whole list', () => {
    const placements = flattenRows(model, noFilter).map(({ key, position, setSize }) => [
      key,
      position,
      setSize,
    ]);

    expect(placements).toEqual([
      [turnKey('response-1'), 1, 1],
      ['root', 1, 1],
      ['llm', 1, 2],
      ['tool', 2, 2],
      ['nested', 1, 1],
    ]);
    expect(
      flattenRows(model, { ...noFilter, query: 'fetch' }).find((row) => row.key === 'tool'),
    ).toMatchObject({ position: 1, setSize: 1 });
  });

  it('hides the descendants of a collapsed record and turn', () => {
    expect(rowKeys(flattenRows(model, { ...noFilter, collapsed: new Set(['tool']) }))).toEqual([
      turnKey('response-1'),
      'root',
      'llm',
      'tool',
    ]);
    expect(
      rowKeys(flattenRows(model, { ...noFilter, collapsed: new Set([turnKey('response-1')]) })),
    ).toEqual([turnKey('response-1')]);
  });

  it('keeps search matches and their ancestors, even inside collapsed parents', () => {
    const rows = flattenRows(model, {
      collapsed: new Set(['root', 'tool']),
      query: 'FETCH',
      window: null,
    });

    expect(rowKeys(rows)).toEqual([turnKey('response-1'), 'root', 'tool', 'nested']);
  });

  it('matches on model names', () => {
    expect(rowKeys(flattenRows(model, { ...noFilter, query: 'gpt-5' }))).toEqual([
      turnKey('response-1'),
      'root',
      'llm',
    ]);
  });

  it('focuses the ledger on records active at any point in the interval', () => {
    const rows = flattenRows(model, {
      ...noFilter,
      window: { start: BASE + 5500, end: BASE + 7000 },
    });

    expect(rowKeys(rows)).toEqual([turnKey('response-1'), 'root', 'tool', 'nested']);
  });

  it('drops turns with nothing left to show', () => {
    expect(flattenRows(model, { ...noFilter, query: 'no such record' })).toEqual([]);
  });

  it('offers every turn and parent as a collapsible key', () => {
    expect(new Set(collapsibleKeys(model))).toEqual(
      new Set([turnKey('response-1'), 'root', 'tool']),
    );
  });
});

describe('time windows', () => {
  const bounds = { start: BASE, end: BASE + 10_000 };

  it('clamps a window inside the trace and clears it when it covers everything', () => {
    expect(clampWindow({ start: BASE - 5000, end: BASE + 1000 }, bounds)).toEqual({
      start: BASE,
      end: BASE + 6000,
    });
    expect(clampWindow({ start: BASE - 1, end: BASE + 20_000 }, bounds)).toBeNull();
  });

  it('zooms around an anchor and pans within bounds', () => {
    const zoomed = zoomWindow(bounds, null, 0.5, BASE + 2000);
    expect(zoomed).toEqual({ start: BASE + 1000, end: BASE + 6000 });
    expect(zoomWindow(bounds, zoomed, 2, BASE + 2000)).toBeNull();
    expect(panWindow(bounds, { start: BASE + 9000, end: BASE + 10_000 }, 1)).toEqual({
      start: BASE + 9000,
      end: BASE + 10_000,
    });
    expect(panWindow(bounds, { start: BASE + 1000, end: BASE + 2000 }, -1)).toEqual({
      start: BASE + 900,
      end: BASE + 1900,
    });
  });
});

describe('assignLanes', () => {
  it('reuses a lane once its record ends and caps the lane count', () => {
    const model = buildTraceModel([
      record({ id: 'a', startTime: at(0), endTime: at(1000) }),
      record({ id: 'b', startTime: at(500), endTime: at(1500) }),
      record({ id: 'c', startTime: at(1000), endTime: at(2000) }),
      record({ id: 'd', startTime: at(1200), endTime: at(1300) }),
    ]);

    const lanes = assignLanes(model, 2);
    expect(lanes.get('a')).toBe(0);
    expect(lanes.get('b')).toBe(1);
    expect(lanes.get('c')).toBe(0);
    expect(lanes.get('d')).toBe(1);
  });
});
