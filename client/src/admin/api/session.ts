import type { TAdminSession } from 'librechat-data-provider';
import { platformFetch, extractApiError } from './utils/api';
import { queryOptions } from '~/admin/query';
import { createServerFn } from './utils/fn';

/**
 * Who is using the panel, or `null` for someone who cannot open it. Always asked at the platform,
 * so an organization chosen earlier and deleted since never locks the operator out.
 */
export const getAdminSessionFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<TAdminSession | null> => {
    const response = await platformFetch('/api/admin/session');
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      return null;
    }
    if (!response.ok) {
      await extractApiError(response, 'Failed to check admin access');
    }
    return (await response.json()) as TAdminSession;
  },
);

export const adminSessionQueryOptions = queryOptions({
  queryKey: ['adminSession'],
  queryFn: () => getAdminSessionFn(),
  staleTime: 60_000,
  retry: false,
});
