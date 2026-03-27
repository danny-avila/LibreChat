export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;

export function parsePagination(query: { limit?: string; offset?: string }): {
  limit: number;
  offset: number;
} {
  return {
    limit: Math.min(Math.max(Number(query.limit) || DEFAULT_PAGE_LIMIT, 1), MAX_PAGE_LIMIT),
    offset: Math.max(Number(query.offset) || 0, 0),
  };
}
