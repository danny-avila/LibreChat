import { parseConversationListFilters } from './filters';

describe('parseConversationListFilters', () => {
  it('leaves every facet undefined when the query carries none', () => {
    const { filters, error } = parseConversationListFilters({});

    expect(error).toBeUndefined();
    expect(filters).toEqual({});
  });

  it('reads the date cutoffs as dates', () => {
    const { filters, error } = parseConversationListFilters({
      updatedAfter: '2026-09-01T00:00:00.000Z',
      createdAfter: '2026-08-01T00:00:00.000Z',
    });

    expect(error).toBeUndefined();
    expect(filters.updatedAfter?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(filters.createdAfter?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it('rejects a malformed date rather than dropping the filter', () => {
    /** Dropping it would answer with conversations the user asked to exclude. */
    const { filters, error } = parseConversationListFilters({ updatedAfter: 'last tuesday' });

    expect(error).toBe('updatedAfter must be an ISO 8601 date');
    expect(filters).toEqual({});
  });

  it('rejects dates JavaScript would silently normalize', () => {
    /** February 30th rolls over to March and a bare number becomes 2001, so both
     *  would apply a cutoff the caller never named. */
    expect(parseConversationListFilters({ updatedAfter: '2026-02-30' }).error).toBe(
      'updatedAfter must be an ISO 8601 date',
    );
    expect(parseConversationListFilters({ updatedAfter: '1' }).error).toBe(
      'updatedAfter must be an ISO 8601 date',
    );
    expect(parseConversationListFilters({ updatedAfter: '2026-13-01' }).error).toBe(
      'updatedAfter must be an ISO 8601 date',
    );
    expect(parseConversationListFilters({ createdAfter: '2026-09-01T25:00:00Z' }).error).toBe(
      'createdAfter must be an ISO 8601 date',
    );
  });

  it('accepts a date-only cutoff as UTC midnight and an offset-bearing one', () => {
    expect(
      parseConversationListFilters({
        updatedAfter: '2026-09-01',
      }).filters.updatedAfter?.toISOString(),
    ).toBe('2026-09-01T00:00:00.000Z');
    expect(
      parseConversationListFilters({
        updatedAfter: '2026-09-01T12:00:00+02:00',
      }).filters.updatedAfter?.toISOString(),
    ).toBe('2026-09-01T10:00:00.000Z');
  });

  it('reads a timestamp without an offset as UTC, not the server zone', () => {
    expect(
      parseConversationListFilters({
        updatedAfter: '2026-09-01T12:00:00',
      }).filters.updatedAfter?.toISOString(),
    ).toBe('2026-09-01T12:00:00.000Z');
    expect(
      parseConversationListFilters({
        createdAfter: '2026-09-01 08:30',
      }).filters.createdAfter?.toISOString(),
    ).toBe('2026-09-01T08:30:00.000Z');
  });

  it('accepts one endpoint or many, and de-duplicates them', () => {
    expect(parseConversationListFilters({ endpoints: 'openAI' }).filters.endpoints).toEqual([
      'openAI',
    ]);
    expect(
      parseConversationListFilters({ endpoints: ['openAI', 'agents', 'openAI'] }).filters.endpoints,
    ).toEqual(['openAI', 'agents']);
  });

  it('ignores blank endpoint entries', () => {
    const { filters } = parseConversationListFilters({ endpoints: ['', '  ', 'agents'] });

    expect(filters.endpoints).toEqual(['agents']);
  });

  it('treats an all-blank endpoint list as no filter at all', () => {
    const { filters, error } = parseConversationListFilters({ endpoints: ['', '   '] });

    expect(error).toBeUndefined();
    expect(filters.endpoints).toBeUndefined();
  });

  it('refuses an endpoint list long enough to be an unbounded query', () => {
    const endpoints = Array.from({ length: 51 }, (_, index) => `endpoint-${index}`);
    const { filters, error } = parseConversationListFilters({ endpoints });

    expect(error).toMatch(/at most 50/);
    expect(filters).toEqual({});
  });

  it('refuses an oversized endpoint name', () => {
    const { error } = parseConversationListFilters({ endpoints: 'e'.repeat(129) });

    expect(error).toMatch(/128 characters/);
  });

  it('refuses a non-string endpoint', () => {
    const { error } = parseConversationListFilters({ endpoints: [{ $ne: null }] });

    expect(error).toMatch(/endpoints must be/);
  });

  it('only treats hasFiles as a filter when it is on', () => {
    expect(parseConversationListFilters({ hasFiles: 'true' }).filters.hasFiles).toBe(true);
    expect(parseConversationListFilters({ hasFiles: 'false' }).filters.hasFiles).toBeUndefined();
    expect(parseConversationListFilters({}).filters.hasFiles).toBeUndefined();
  });

  it('only treats sharedOnly as a filter when it is on', () => {
    expect(parseConversationListFilters({ sharedOnly: 'true' }).filters.sharedOnly).toBe(true);
    expect(
      parseConversationListFilters({ sharedOnly: 'false' }).filters.sharedOnly,
    ).toBeUndefined();
    expect(parseConversationListFilters({}).filters.sharedOnly).toBeUndefined();
  });

  it('refuses a mistyped flag rather than reading it as absent', () => {
    /** `hasFiles=tru` arriving as "no filter" would widen the list past what the
     *  user asked to see, which is the one failure this parser exists to prevent. */
    expect(parseConversationListFilters({ hasFiles: 'tru' }).error).toBe(
      'hasFiles must be true or false',
    );
    expect(parseConversationListFilters({ sharedOnly: 'yes' }).error).toBe(
      'sharedOnly must be true or false',
    );
    expect(parseConversationListFilters({ sharedOnly: 'TRUE' }).error).toBe(
      'sharedOnly must be true or false',
    );
  });

  it('honors deployment-configured endpoint limits over the defaults', () => {
    const endpoints = Array.from({ length: 3 }, (_, index) => `endpoint-${index}`);
    const underCustom = parseConversationListFilters({ endpoints }, { maxEndpointFilters: 3 });
    const overCustom = parseConversationListFilters({ endpoints }, { maxEndpointFilters: 2 });

    expect(underCustom.error).toBeUndefined();
    expect(overCustom.error).toMatch(/at most 2/);
    expect(
      parseConversationListFilters(
        { endpoints: 'e'.repeat(9) },
        {
          maxEndpointNameLength: 8,
        },
      ).error,
    ).toMatch(/8 characters/);
  });

  it('keeps the default limit when the config is only partially set', () => {
    const endpoints = Array.from({ length: 51 }, (_, index) => `endpoint-${index}`);
    const { error } = parseConversationListFilters({ endpoints }, { maxEndpointNameLength: 256 });

    expect(error).toMatch(/at most 50/);
  });

  it('takes the first value when a param is repeated', () => {
    const { filters } = parseConversationListFilters({
      updatedAfter: ['2026-09-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z'],
    });

    expect(filters.updatedAfter?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });
});
