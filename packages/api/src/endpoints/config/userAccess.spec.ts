import {
  filterEndpointCatalog,
  filterModelSpecsForUser,
  getUserEndpointAllowlist,
  isEndpointAllowedForUser,
} from './userAccess';

const rules = [
  { username: 'winston', allowedEndpoints: ['Cogsworth'] },
  { username: 'empty-user', allowedEndpoints: [] },
];

describe('user endpoint access policy', () => {
  it('leaves users without a matching rule unrestricted', () => {
    expect(getUserEndpointAllowlist({ username: 'lorah' }, rules)).toBeUndefined();
    expect(isEndpointAllowedForUser({ username: 'lorah' }, 'Abbenay', rules)).toBe(true);
    expect(isEndpointAllowedForUser(undefined, 'Abbenay', rules)).toBe(true);
  });

  it('matches usernames case-insensitively and normalizes endpoint names', () => {
    expect(getUserEndpointAllowlist({ username: 'WINSTON' }, rules)).toEqual(
      new Set(['cogsworth']),
    );
    expect(isEndpointAllowedForUser({ username: 'Winston' }, 'cogsworth', rules)).toBe(true);
    expect(isEndpointAllowedForUser({ username: 'winston' }, 'Abbenay', rules)).toBe(false);
  });

  it('supports an explicit empty allowlist', () => {
    expect(isEndpointAllowedForUser({ username: 'empty-user' }, 'Cogsworth', rules)).toBe(false);
  });

  it('filters endpoint/model catalogs using the same normalized allowlist', () => {
    expect(
      filterEndpointCatalog(
        { Cogsworth: ['cogsworth'], Abbenay: ['openrouter/model'] },
        getUserEndpointAllowlist({ username: 'winston' }, rules),
      ),
    ).toEqual({ Cogsworth: ['cogsworth'] });
    expect(filterEndpointCatalog({ Cogsworth: ['cogsworth'] }, undefined)).toEqual({
      Cogsworth: ['cogsworth'],
    });
  });

  it('filters model specs and added provider endpoints for a restricted user', () => {
    expect(
      filterModelSpecsForUser(
        {
          list: [
            { name: 'cogsworth', preset: { endpoint: 'Cogsworth' } },
            { name: 'abbenay', preset: { endpoint: 'Abbenay' } },
          ],
          addedEndpoints: ['Cogsworth', 'Abbenay'],
        },
        { username: 'winston' },
        rules,
      ),
    ).toEqual({
      list: [{ name: 'cogsworth', preset: { endpoint: 'Cogsworth' } }],
      addedEndpoints: ['Cogsworth'],
    });
  });
});
