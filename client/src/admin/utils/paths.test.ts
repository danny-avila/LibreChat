import {
  createPathIndex,
  collectLeafPaths,
  isRowVisible,
  holdsFilterMatch,
  hasPathOrAncestor,
  pathIndexOverlaps,
} from './paths';

describe('collectLeafPaths', () => {
  it('treats arrays, primitives and null as leaves and ignores empty objects', () => {
    expect(
      collectLeafPaths({
        cache: true,
        balance: {},
        endpoints: { custom: [{ name: 'a' }], agents: { capabilities: ['x'] } },
        mcpSettings: null,
        nested: { empty: {}, value: 0 },
        skipped: undefined,
      }),
    ).toEqual([
      'cache',
      'endpoints.custom',
      'endpoints.agents.capabilities',
      'mcpSettings',
      'nested.value',
    ]);
  });

  it('returns the prefix itself for a primitive under a prefix', () => {
    expect(collectLeafPaths(true, 'interface.schedules')).toEqual(['interface.schedules']);
    expect(collectLeafPaths(undefined, 'x')).toEqual([]);
    expect(collectLeafPaths({ __proto__: { polluted: true } } as never)).toEqual([]);
  });
});

describe('createPathIndex', () => {
  const index = createPathIndex(['balance.startBalance', 'mcpServers.github.url', 'cache']);

  it('indexes every ancestor of a leaf', () => {
    expect([...index.ancestors].sort()).toEqual(['balance', 'mcpServers', 'mcpServers.github']);
  });

  it('answers exact, descendant and ancestor lookups', () => {
    expect(pathIndexOverlaps(index, 'balance.startBalance')).toBe(true);
    expect(pathIndexOverlaps(index, 'mcpServers.github')).toBe(true);
    expect(pathIndexOverlaps(index, 'cache.nested')).toBe(true);
    expect(pathIndexOverlaps(index, 'balance.enabled')).toBe(false);
  });
});

describe('isRowVisible / holdsFilterMatch', () => {
  const filter = createPathIndex(['balance.refillAmount', 'webSearch', 'mcpServers.github']);

  it('keeps matches, rows inside a matching group and groups holding a match', () => {
    expect(isRowVisible(filter, 'balance.refillAmount')).toBe(true);
    expect(isRowVisible(filter, 'balance')).toBe(true);
    expect(isRowVisible(filter, 'balance.startBalance')).toBe(false);
    expect(isRowVisible(filter, 'webSearch.serperApiKey')).toBe(true);
    expect(isRowVisible(filter, 'balanceX')).toBe(false);
    expect(isRowVisible(filter, 'mcpServers.docs')).toBe(false);
    expect(isRowVisible(null, 'anything')).toBe(true);
  });

  it('opens a group or card only for a match at or inside it, not one around it', () => {
    expect(holdsFilterMatch(filter, 'balance')).toBe(true);
    expect(holdsFilterMatch(filter, 'mcpServers.github')).toBe(true);
    expect(holdsFilterMatch(filter, 'webSearch.firecrawlOptions')).toBe(false);
    expect(holdsFilterMatch(null, 'balance')).toBe(false);
  });
});

describe('hasPathOrAncestor', () => {
  it('matches the path itself or any ancestor, never a sibling with a shared prefix', () => {
    const paths = new Set(['mcpServers.docs']);
    expect(hasPathOrAncestor(paths, 'mcpServers.docs')).toBe(true);
    expect(hasPathOrAncestor(paths, 'mcpServers.docs.url')).toBe(true);
    expect(hasPathOrAncestor(paths, 'mcpServers.docsearch')).toBe(false);
    expect(hasPathOrAncestor(paths, 'mcpServers')).toBe(false);
    expect(hasPathOrAncestor(new Set(), 'a')).toBe(false);
  });
});
