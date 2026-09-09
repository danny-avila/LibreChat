import { AGENT_SORT_OPTIONS, resolveMarketplaceListQuery } from './marketplace';

describe('resolveMarketplaceListQuery', () => {
  test('keeps every offered sort mode', () => {
    for (const sort of AGENT_SORT_OPTIONS) {
      expect(resolveMarketplaceListQuery({ sort }).sort).toBe(sort);
    }
  });

  test('falls back to the default order instead of rejecting a browsing request', () => {
    for (const sort of ['', 'trending', 'AUTHOR', '$where', undefined]) {
      expect(resolveMarketplaceListQuery({ sort } as { sort?: string }).sort).toBe('newest');
    }
  });

  test('ignores a repeated sort parameter rather than passing an array on', () => {
    expect(resolveMarketplaceListQuery({ sort: ['popular', 'author'] }).sort).toBe('newest');
  });

  test('restricts to the caller only for mine=1', () => {
    expect(resolveMarketplaceListQuery({ mine: '1' }).mineOnly).toBe(true);
    for (const mine of ['0', 'true', '', ['1'], undefined]) {
      expect(resolveMarketplaceListQuery({ mine } as { mine?: string }).mineOnly).toBe(false);
    }
  });
});
