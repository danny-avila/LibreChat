import { z } from 'zod';
import { PrincipalType } from 'librechat-data-provider';
import { SystemCapabilities } from 'librechat-data-provider';
import type {
  AdminConfigListResponse,
  AdminConfigResponse,
  AdminUserListItem,
} from 'librechat-data-provider';
import type * as t from '~/admin/types';
import {
  collectOverridePaths,
  scopeOverrideEntries,
  stripSecretPreviewValues,
} from '~/admin/utils';
import { normalizeAppServiceKeys } from '../config/normalize';
import { DEFAULT_SCOPE_PRIORITY } from '~/admin/constants';
import { BASE_CONFIG_PRINCIPAL_ID } from '../constants';
import { requireAnyCapability } from '../capabilities';
import { createServerFn } from '~/admin/api/utils/fn';
import { getSchemaPathSet } from '../config/schema';
import { queryOptions } from '~/admin/query';
import { apiFetch } from '../utils/api';
import { deepGet } from './paths';

/** The admin list endpoints return at most this many items per page. */
const DIRECTORY_PAGE_SIZE = 200;
/** Pages read per directory lookup before unresolved principals fall back to their ids. */
const DIRECTORY_MAX_PAGES = 10;

interface DirectoryGroup {
  _id: string;
  name: string;
  memberIds?: string[];
}

interface DirectoryPage<T> {
  items: T[];
  total: number;
}

function principalKey(principalType: PrincipalType, principalId: string): string {
  return `${principalType}:${principalId}`;
}

/**
 * What a stored profile overrides: its leaf paths (secret previews and
 * permission fields left out) and the entries it stores in lists merged by entry.
 */
function profileOverrides(
  config: t.ScopeConfigDoc,
): Pick<t.ConfigScope, 'overridePaths' | 'overrideEntries'> {
  const overrides = (config.overrides ?? {}) as t.ConfigRecord;
  const visible = stripSecretPreviewValues(overrides, '', getSchemaPathSet()) as t.ConfigRecord;
  const normalized = normalizeAppServiceKeys(visible);
  return {
    overridePaths: collectOverridePaths(normalized),
    overrideEntries: scopeOverrideEntries(normalized),
  };
}

function apiConfigToScope(
  config: t.ScopeConfigDoc,
  directory?: ReadonlyMap<string, t.PrincipalDetails>,
): t.ConfigScope {
  const details = directory?.get(principalKey(config.principalType, config.principalId));
  return {
    _id: config._id,
    principalType: config.principalType,
    principalId: config.principalId,
    name: details?.name || config.principalId,
    ...(details?.email && { email: details.email }),
    ...(details?.memberCount != null && { memberCount: details.memberCount }),
    priority: config.priority,
    isActive: config.isActive,
    ...profileOverrides(config),
    tombstones: config.tombstones ?? [],
  };
}

/**
 * Pages through an admin list endpoint until every wanted id is found, the
 * list ends, or `DIRECTORY_MAX_PAGES` were read. A failed page (e.g. 403
 * without read access) ends the lookup with what was found so far.
 */
async function lookupPaged<B, T>(
  path: string,
  wanted: ReadonlySet<string>,
  readPage: (body: B) => DirectoryPage<T>,
  idOf: (item: T) => string,
): Promise<Map<string, T>> {
  const found = new Map<string, T>();
  for (let page = 0; page < DIRECTORY_MAX_PAGES && found.size < wanted.size; page++) {
    const offset = page * DIRECTORY_PAGE_SIZE;
    const response = await apiFetch(`${path}?limit=${DIRECTORY_PAGE_SIZE}&offset=${offset}`).catch(
      () => null,
    );
    if (!response?.ok) break;
    const { items, total } = readPage((await response.json()) as B);
    for (const item of items) {
      const id = idOf(item);
      if (wanted.has(id)) found.set(id, item);
    }
    if (items.length === 0 || offset + items.length >= total) break;
  }
  return found;
}

async function lookupGroups(ids: ReadonlySet<string>): Promise<Map<string, DirectoryGroup>> {
  if (ids.size === 0) return new Map();
  return lookupPaged(
    '/api/admin/groups',
    ids,
    (body: { groups?: DirectoryGroup[]; total?: number }) => ({
      items: body.groups ?? [],
      total: body.total ?? 0,
    }),
    (group) => group._id,
  );
}

async function lookupUsers(ids: ReadonlySet<string>): Promise<Map<string, AdminUserListItem>> {
  if (ids.size === 0) return new Map();
  return lookupPaged(
    '/api/admin/users',
    ids,
    (body: { users?: AdminUserListItem[]; total?: number }) => ({
      items: body.users ?? [],
      total: body.total ?? 0,
    }),
    (user) => user.id,
  );
}

/** Number of users with a role, or undefined when its members can't be read. */
async function countRoleMembers(roleName: string): Promise<number | undefined> {
  const response = await apiFetch(
    `/api/admin/roles/${encodeURIComponent(roleName)}/members?limit=1`,
  ).catch(() => null);
  if (!response?.ok) return undefined;
  const { total } = (await response.json()) as { total?: number };
  return total;
}

/**
 * Names, emails and member counts for the principals of the given profiles,
 * keyed by `principalType:principalId`. Users and groups are read in pages from
 * the admin directory; role members are counted per role profile.
 */
export async function resolvePrincipals(
  configs: t.ScopeConfigDoc[],
): Promise<Map<string, t.PrincipalDetails>> {
  const idsOf = (type: PrincipalType) =>
    new Set(configs.filter((c) => c.principalType === type).map((c) => c.principalId));
  const roleNames = [...idsOf(PrincipalType.ROLE)];
  const [groups, users, roleCounts] = await Promise.all([
    lookupGroups(idsOf(PrincipalType.GROUP)),
    lookupUsers(idsOf(PrincipalType.USER)),
    Promise.all(roleNames.map(countRoleMembers)),
  ]);

  const directory = new Map<string, t.PrincipalDetails>();
  for (const [id, group] of groups) {
    directory.set(principalKey(PrincipalType.GROUP, id), {
      name: group.name,
      memberCount: group.memberIds?.length ?? 0,
    });
  }
  for (const [id, user] of users) {
    directory.set(principalKey(PrincipalType.USER, id), {
      name: user.name || user.username || user.email,
      email: user.email || undefined,
    });
  }
  roleNames.forEach((name, i) => {
    directory.set(principalKey(PrincipalType.ROLE, name), { name, memberCount: roleCounts[i] });
  });
  return directory;
}

/**
 * Every profile (config document other than Base), with its principal's name,
 * the user's email, member counts, and the paths it overrides or hides.
 */
export const getAvailableScopesFn = createServerFn({ method: 'GET' }).handler(async () => {
  const configRes = await apiFetch('/api/admin/config');
  if (!configRes.ok) {
    throw new Error(`Failed to fetch scopes: ${configRes.status}`);
  }
  const { configs } = (await configRes.json()) as { configs: t.ScopeConfigDoc[] };
  const profiles = configs.filter((c) => c.principalId !== BASE_CONFIG_PRINCIPAL_ID);
  const directory = await resolvePrincipals(profiles);
  const scopes: t.ConfigScope[] = profiles.map((c) => apiConfigToScope(c, directory));
  return { scopes };
});

/**
 * Shared queryOptions so every consumer deduplicates and caches the scopes list.
 * One retry: a failing profile list shows its error in about a second, like the base and schema queries.
 */
export const availableScopesOptions = queryOptions({
  queryKey: ['availableScopes'],
  queryFn: () => getAvailableScopesFn().then((r) => r.scopes),
  staleTime: 30_000,
  retry: 1,
});

/** Thrown before writing to a profile that no longer exists, so a save never recreates it (PR-3). */
export const MISSING_SCOPE_MESSAGE =
  'This profile no longer exists (it may have been deleted), so nothing was saved. Switch to Base or another profile.';

/**
 * Fetch all profile values for a specific field across all scopes.
 * Fetches all configs and extracts the field value from each config's overrides.
 */
export const getFieldProfileValuesFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ fieldPath: z.string() }))
  .handler(async ({ data }: { data: { fieldPath: string } }) => {
    const response = await apiFetch('/api/admin/config');
    if (!response.ok) {
      throw new Error(`Failed to fetch configs: ${response.status}`);
    }
    const { configs } = (await response.json()) as AdminConfigListResponse;

    const values: t.FieldProfileValue[] = [];
    for (const config of configs) {
      if (config.principalId === BASE_CONFIG_PRINCIPAL_ID) continue;
      const value = deepGet(config.overrides, data.fieldPath);
      if (value !== undefined) {
        values.push({
          scope: apiConfigToScope(config),
          value: value as NonNullable<unknown>,
        });
      }
    }
    return { fieldPath: data.fieldPath, values };
  });

/** Shared queryOptions for fetching a single field's profile values. */
export const fieldProfileValuesOptions = (fieldPath: string) =>
  queryOptions<t.FieldProfileValue[]>({
    queryKey: ['fieldProfileValues', fieldPath],
    queryFn: () => getFieldProfileValuesFn({ data: { fieldPath } }).then((r) => r.values),
  });

/**
 * Create a profile for a role, group or user. The priority defaults to
 * `DEFAULT_SCOPE_PRIORITY` for the principal type. When the principal already
 * has a profile it is returned as is, so creating never replaces overrides.
 */
export const createScopeFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z
      .object({
        principalType: z.nativeEnum(PrincipalType),
        name: z.string().min(1),
        priority: z.number().int().min(0).optional(),
        principalId: z.string().optional(),
        email: z.string().optional(),
      })
      .refine((d) => d.principalType !== PrincipalType.USER || !!d.principalId, {
        message: 'principalId is required for USER scopes',
        path: ['principalId'],
      })
      .refine((d) => d.principalId !== BASE_CONFIG_PRINCIPAL_ID, {
        message: 'Cannot create a scope with the reserved base config ID',
        path: ['principalId'],
      }),
  )
  .handler(
    async ({
      data,
    }: {
      data: {
        principalType: PrincipalType;
        name: string;
        priority?: number;
        principalId?: string;
        email?: string;
      };
    }) => {
      await requireAnyCapability([
        SystemCapabilities.ASSIGN_CONFIGS,
        SystemCapabilities.MANAGE_CONFIGS,
      ]);
      const principalId =
        data.principalId ??
        (data.principalType === PrincipalType.ROLE
          ? data.name.toLowerCase().replace(/\s+/g, '_')
          : `grp_${data.name.toLowerCase().replace(/\s+/g, '_')}`);
      const url = `/api/admin/config/${data.principalType}/${encodeURIComponent(principalId)}`;
      const toScope = (config: t.ScopeConfigDoc): t.ConfigScope => ({
        ...apiConfigToScope(config),
        name: data.name,
        ...(data.email && { email: data.email }),
        ...(data.principalType === PrincipalType.GROUP && { memberCount: 0 }),
      });

      const existing = await apiFetch(url);
      if (existing.ok) {
        const { config } = (await existing.json()) as AdminConfigResponse;
        return { scope: toScope(config) };
      }
      if (data.principalType === PrincipalType.ROLE) {
        const role = await apiFetch(`/api/admin/roles/${encodeURIComponent(principalId)}`);
        if (role.status === 404) throw new Error(`There is no role named "${principalId}"`);
      }

      const priority =
        data.priority ?? DEFAULT_SCOPE_PRIORITY[data.principalType as t.ScopePrincipalType];
      const response = await apiFetch(url, {
        method: 'PUT',
        body: JSON.stringify({ overrides: {}, priority }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error ?? `Failed to create scope: ${response.status}`,
        );
      }

      const body = (await response.json()) as AdminConfigResponse | { message?: string };
      const config = 'config' in body ? body.config : undefined;
      if (!config?._id) {
        throw new Error(
          'Backend did not return a config document. The scope may not have been created.',
        );
      }
      return { scope: toScope(config) };
    },
  );

/**
 * Toggle a scope's isActive flag.
 */
export const toggleScopeActiveFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      principalType: z.nativeEnum(PrincipalType),
      principalId: z.string(),
      isActive: z.boolean(),
    }),
  )
  .handler(
    async ({
      data,
    }: {
      data: {
        principalType: PrincipalType;
        principalId: string;
        isActive: boolean;
      };
    }) => {
      await requireAnyCapability([
        SystemCapabilities.ASSIGN_CONFIGS,
        SystemCapabilities.MANAGE_CONFIGS,
      ]);
      const apiType = data.principalType;
      const response = await apiFetch(
        `/api/admin/config/${apiType}/${encodeURIComponent(data.principalId)}/active`,
        {
          method: 'PATCH',
          body: JSON.stringify({ isActive: data.isActive }),
        },
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error ?? `Failed to toggle scope: ${response.status}`,
        );
      }
      return { success: true };
    },
  );

/**
 * Delete a scope and all its config overrides.
 */
export const deleteScopeFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      principalType: z.nativeEnum(PrincipalType),
      principalId: z.string(),
    }),
  )
  .handler(
    async ({
      data,
    }: {
      data: {
        principalType: PrincipalType;
        principalId: string;
      };
    }) => {
      await requireAnyCapability([
        SystemCapabilities.ASSIGN_CONFIGS,
        SystemCapabilities.MANAGE_CONFIGS,
      ]);
      const apiType = data.principalType;
      const response = await apiFetch(
        `/api/admin/config/${apiType}/${encodeURIComponent(data.principalId)}`,
        { method: 'DELETE' },
      );

      if (!response.ok && response.status !== 404) {
        const err = await response.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error ?? `Failed to delete scope: ${response.status}`,
        );
      }
      return { success: true };
    },
  );
