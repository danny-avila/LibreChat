import type { UsageRange } from './types';

const USAGE_ROOT = '/api/admin/usage';

/**
 * `from`/`to` go over as bare `YYYY-MM-DD` keys: the server resolves them against
 * `timeZone`, so the panel never reimplements zone arithmetic.
 */
export const usagePath = (range: UsageRange, userId?: string): string => {
  const params = new URLSearchParams({
    from: range.from,
    to: range.to,
    timeZone: range.timeZone,
  });
  if (userId) {
    params.set('userId', userId);
  }
  return `${USAGE_ROOT}?${params.toString()}`;
};
