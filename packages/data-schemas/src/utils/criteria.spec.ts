import { buildFilter, matchAny, type FieldMap } from './criteria';

type SampleQuery = {
  actionId?: string | string[];
  agentId?: string | string[];
  user?: string;
};

const FIELDS: FieldMap<SampleQuery> = {
  actionId: 'action_id',
  agentId: 'agent_id',
  user: 'user',
};

describe('matchAny', () => {
  it('passes a scalar through unchanged', () => {
    expect(matchAny('abc')).toBe('abc');
  });

  it('translates a list into an $in expression', () => {
    expect(matchAny(['a', 'b'])).toEqual({ $in: ['a', 'b'] });
  });

  it('translates an empty list into an $in that matches nothing', () => {
    expect(matchAny([])).toEqual({ $in: [] });
  });
});

describe('buildFilter', () => {
  it('maps criteria onto their stored field names', () => {
    expect(buildFilter<SampleQuery, Record<string, unknown>>({ actionId: 'a1' }, FIELDS)).toEqual({
      action_id: 'a1',
    });
  });

  it('combines multiple criteria', () => {
    const filter = buildFilter<SampleQuery, Record<string, unknown>>(
      { agentId: 'agent-1', user: 'user-1' },
      FIELDS,
    );
    expect(filter).toEqual({ agent_id: 'agent-1', user: 'user-1' });
  });

  it('translates list criteria into $in', () => {
    const filter = buildFilter<SampleQuery, Record<string, unknown>>(
      { agentId: ['a', 'b'] },
      FIELDS,
    );
    expect(filter).toEqual({ agent_id: { $in: ['a', 'b'] } });
  });

  it('omits criteria the caller left undefined', () => {
    const filter = buildFilter<SampleQuery, Record<string, unknown>>(
      { actionId: 'a1', agentId: undefined },
      FIELDS,
    );
    expect(filter).toEqual({ action_id: 'a1' });
  });

  it('builds an empty filter from an empty query, so "list all" stays expressible', () => {
    expect(buildFilter<SampleQuery, Record<string, unknown>>({}, FIELDS)).toEqual({});
  });

  it('throws on an unrecognized criterion rather than silently widening the filter', () => {
    const query = { assistant_id: 'asst_1' } as unknown as SampleQuery;
    expect(() => buildFilter<SampleQuery, Record<string, unknown>>(query, FIELDS)).toThrow(
      "Unknown query criterion: 'assistant_id'",
    );
  });

  it('throws even when a recognized criterion is also present', () => {
    const query = { user: 'user-1', id: 'asst_1' } as unknown as SampleQuery;
    expect(() => buildFilter<SampleQuery, Record<string, unknown>>(query, FIELDS)).toThrow(
      "Unknown query criterion: 'id'",
    );
  });

  it('throws on an unrecognized criterion whose value is undefined', () => {
    /* A JS caller misspelling a criterion whose value is absent must not slip
       through the undefined-omission rule and produce a filter matching everything. */
    const query = { agent_id: undefined } as unknown as SampleQuery;
    expect(() => buildFilter<SampleQuery, Record<string, unknown>>(query, FIELDS)).toThrow(
      "Unknown query criterion: 'agent_id'",
    );
  });

  it('throws on a criterion that only resolves through the field map prototype', () => {
    const query = { toString: 'x' } as unknown as SampleQuery;
    expect(() => buildFilter<SampleQuery, Record<string, unknown>>(query, FIELDS)).toThrow(
      "Unknown query criterion: 'toString'",
    );
  });
});
