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

  it('takes the first value when a param is repeated', () => {
    const { filters } = parseConversationListFilters({
      updatedAfter: ['2026-09-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z'],
    });

    expect(filters.updatedAfter?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });
});
