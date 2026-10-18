/**
 * Server functions for user management.
 *
 * Reads people through the admin API (/api/admin/users): list and search. The server has no
 * create or delete route, so the panel offers neither.
 */

import { z } from 'zod';
import type { AdminUserSearchResult } from 'librechat-data-provider';
import type { TUser } from 'librechat-data-provider';
import { apiFetch, extractApiError } from './utils/api';
import { createServerFn } from '~/admin/api/utils/fn';
import { queryOptions } from '~/admin/query';

// ── Server functions ─────────────────────────────────────────────────

export const getUsersFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ users: TUser[] }> => {
    const response = await apiFetch('/api/admin/users');
    if (!response.ok) {
      throw new Error(`Failed to fetch users: ${response.status}`);
    }
    const json = (await response.json()) as { users: TUser[] };
    return { users: json.users ?? [] };
  },
);

export const usersQueryOptions = queryOptions({
  queryKey: ['users'],
  queryFn: () => getUsersFn().then((r) => r.users),
  staleTime: 30_000,
});

export const searchUsersFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ query: z.string() }))
  .handler(async ({ data }): Promise<{ users: AdminUserSearchResult[] }> => {
    const response = await apiFetch(`/api/admin/users/search?q=${encodeURIComponent(data.query)}`);
    if (!response.ok) {
      await extractApiError(response, 'Failed to search users');
    }
    const json = (await response.json()) as { users: AdminUserSearchResult[] };
    return { users: json.users ?? [] };
  });
