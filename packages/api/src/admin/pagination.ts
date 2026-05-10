export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;

export function parsePagination(query: { limit?: string; offset?: string }): {
  limit: number;
  offset: number;
} {
  const rawLimit = parseInt(query.limit ?? '', 10);
  const rawOffset = parseInt(query.offset ?? '', 10);
  return {
    limit: Math.min(
      Math.max(Number.isNaN(rawLimit) ? DEFAULT_PAGE_LIMIT : rawLimit, 1),
      MAX_PAGE_LIMIT,
    ),
    offset: Math.max(Number.isNaN(rawOffset) ? 0 : rawOffset, 0),
  };
}
