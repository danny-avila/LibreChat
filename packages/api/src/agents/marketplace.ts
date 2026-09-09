import type { AgentSortOption } from 'librechat-data-provider';

/**
 * The marketplace list's sort modes, in the order the picker offers them. The
 * allowlist lives here rather than in the route handler so the query contract has one
 * definition beside `AgentSortOption` and the data-schemas implementation it drives.
 */
export const AGENT_SORT_OPTIONS: readonly AgentSortOption[] = [
  'newest',
  'oldest',
  'popular',
  'author',
];

const SORT_OPTIONS = new Set<string>(AGENT_SORT_OPTIONS);

const isAgentSortOption = (value: string): value is AgentSortOption => SORT_OPTIONS.has(value);

/** Raw `?sort=` / `?mine=` values as Express hands them over. */
export interface MarketplaceListQuery {
  sort?: string | string[];
  mine?: string | string[];
}

export interface MarketplaceListSelection {
  /** The requested mode, or `'newest'` for a missing, repeated or unknown one. */
  sort: AgentSortOption;
  /** True only for `?mine=1`; the caller narrows the author filter itself. */
  mineOnly: boolean;
}

/**
 * Normalizes the marketplace list query. An unknown sort mode is not an error: the
 * marketplace is a browsing surface, and a stale link or a client from another version
 * should still list agents, so it falls back to the default order instead of 400-ing.
 */
export function resolveMarketplaceListQuery(query: MarketplaceListQuery): MarketplaceListSelection {
  const { sort, mine } = query;
  return {
    sort: typeof sort === 'string' && isAgentSortOption(sort) ? sort : 'newest',
    mineOnly: mine === '1',
  };
}
