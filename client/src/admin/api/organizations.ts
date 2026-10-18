import { z } from 'zod';
import type {
  TAdminAccountResponse,
  TAdminAccountsResponse,
  TAdminOrganization,
  TAdminOrganizationResponse,
  TAdminOrganizationsQuery,
  TAdminOrganizationsResponse,
} from 'librechat-data-provider';
import { queryOptions } from '~/admin/query';
import { platformFetch } from './utils/api';
import { createServerFn } from './utils/fn';

/** Thrown for a failed operator action, carrying the server's stable code for localized copy. */
export class AdminRequestError extends Error {
  readonly code?: string;
  readonly status: number;

  constructor(status: number, code: string | undefined, message: string) {
    super(message);
    this.name = 'AdminRequestError';
    this.status = status;
    this.code = code;
  }
}

async function failed(response: Response, fallback: string): Promise<never> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    error_code?: string;
    code?: string;
  };
  throw new AdminRequestError(
    response.status,
    body.error_code ?? body.code,
    body.error ?? `${fallback}: ${response.status}`,
  );
}

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

const tenantId = z.string().regex(/^[-a-zA-Z0-9_.]{1,128}$/);

export const listOrganizationsFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      search: z.string().max(100).optional(),
      status: z.string().max(32).optional(),
      limit: z.number().int().min(1).max(100).optional(),
      after: z.string().max(64).optional(),
    }),
  )
  .handler(async ({ data }): Promise<TAdminOrganizationsResponse> => {
    const response = await platformFetch(
      `/api/admin/organizations${queryString(data as Record<string, string | number | undefined>)}`,
    );
    if (!response.ok) {
      await failed(response, 'Failed to list organizations');
    }
    return (await response.json()) as TAdminOrganizationsResponse;
  });

export const organizationsQueryOptions = (query: TAdminOrganizationsQuery) =>
  queryOptions({
    queryKey: ['adminOrganizations', query],
    queryFn: () => listOrganizationsFn({ data: query }),
    staleTime: 15_000,
  });

export const getOrganizationFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ id: tenantId }))
  .handler(async ({ data }): Promise<TAdminOrganizationResponse> => {
    const response = await platformFetch(`/api/admin/organizations/${encodeURIComponent(data.id)}`);
    if (!response.ok) {
      await failed(response, 'Failed to load organization');
    }
    return (await response.json()) as TAdminOrganizationResponse;
  });

export const organizationQueryOptions = (id: string | undefined) =>
  queryOptions({
    queryKey: ['adminOrganization', id],
    queryFn: () => getOrganizationFn({ data: { id: id ?? '' } }),
    enabled: !!id,
    staleTime: 15_000,
  });

async function organizationAction(
  id: string,
  path: string,
  init: RequestInit,
  fallback: string,
): Promise<{ organization: TAdminOrganization }> {
  const response = await platformFetch(
    `/api/admin/organizations/${encodeURIComponent(id)}${path}`,
    init,
  );
  if (!response.ok) {
    await failed(response, fallback);
  }
  return (await response.json()) as { organization: TAdminOrganization };
}

export const renameOrganizationFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: tenantId, name: z.string().max(200) }))
  .handler(async ({ data }) =>
    organizationAction(
      data.id,
      '',
      { method: 'PATCH', body: JSON.stringify({ name: data.name }) },
      'Failed to rename organization',
    ),
  );

export const suspendOrganizationFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: tenantId }))
  .handler(async ({ data }) =>
    organizationAction(data.id, '/suspend', { method: 'POST' }, 'Failed to suspend organization'),
  );

export const reactivateOrganizationFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: tenantId }))
  .handler(async ({ data }) =>
    organizationAction(
      data.id,
      '/reactivate',
      { method: 'POST' },
      'Failed to reactivate organization',
    ),
  );

export const deleteOrganizationFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: tenantId, confirmName: z.string().max(200) }))
  .handler(async ({ data }): Promise<{ id: string; status: string }> => {
    const response = await platformFetch(
      `/api/admin/organizations/${encodeURIComponent(data.id)}`,
      {
        method: 'DELETE',
        body: JSON.stringify({ confirmName: data.confirmName }),
      },
    );
    if (!response.ok) {
      await failed(response, 'Failed to delete organization');
    }
    return (await response.json()) as { id: string; status: string };
  });

export const listAccountsFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      search: z.string().max(100).optional(),
      limit: z.number().int().min(1).max(100).optional(),
      after: z.string().max(64).optional(),
    }),
  )
  .handler(async ({ data }): Promise<TAdminAccountsResponse> => {
    const response = await platformFetch(`/api/admin/accounts${queryString(data)}`);
    if (!response.ok) {
      await failed(response, 'Failed to list accounts');
    }
    return (await response.json()) as TAdminAccountsResponse;
  });

export const accountsQueryOptions = (query: { search?: string; after?: string; limit?: number }) =>
  queryOptions({
    queryKey: ['adminAccounts', query],
    queryFn: () => listAccountsFn({ data: query }),
    staleTime: 15_000,
  });

export const getAccountFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ id: z.string().regex(/^[a-f0-9]{24}$/i) }))
  .handler(async ({ data }): Promise<TAdminAccountResponse> => {
    const response = await platformFetch(`/api/admin/accounts/${encodeURIComponent(data.id)}`);
    if (!response.ok) {
      await failed(response, 'Failed to load account');
    }
    return (await response.json()) as TAdminAccountResponse;
  });

export const accountQueryOptions = (id: string | undefined) =>
  queryOptions({
    queryKey: ['adminAccount', id],
    queryFn: () => getAccountFn({ data: { id: id ?? '' } }),
    enabled: !!id,
    staleTime: 15_000,
  });
