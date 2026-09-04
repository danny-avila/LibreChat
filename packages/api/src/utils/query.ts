import type { Request } from 'express';

type QueryValue = Request['query'][string];

export const DEFAULT_PAGE_LIMIT = 25;
export const MAX_PAGE_LIMIT = 100;

/** Express parses a repeated `?limit=a&limit=b` into an array, which `parseInt` reads as its first element's digits. */
export const queryString = (value: QueryValue): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return queryString(value[0]);
  }
  return undefined;
};

/**
 * Clamps a page size from user input. An unclamped limit reaches Mongo's `.limit()`,
 * where a negative value means "one batch" and `0` means "no limit at all".
 */
export const normalizeLimit = (
  value: QueryValue,
  { fallback = DEFAULT_PAGE_LIMIT, max = MAX_PAGE_LIMIT }: { fallback?: number; max?: number } = {},
): number => {
  const limit = parseInt(queryString(value) ?? '', 10);
  if (!Number.isFinite(limit)) {
    return fallback;
  }
  return Math.min(Math.max(limit, 1), max);
};
