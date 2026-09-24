import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AdminGroupsResponse, AdminRolesResponse, PrincipalKind } from './types';
import type { ApiClient, RemoteState } from '../api';

export interface Directory {
  roles: RemoteState<AdminRolesResponse>;
  groups: RemoteState<AdminGroupsResponse>;
  reload: () => void;
  /** A readable name for a stored `principalId`, or null when the principal is unknown here. */
  labelFor: (kind: PrincipalKind, id: string) => string | null;
}

/** `parsePagination` caps `limit` at 200 (packages/api/src/admin/pagination.ts). */
const PAGE_LIMIT = 200;

/**
 * Roles and groups both back the principal picker and name the rows of the override list,
 * so they are fetched once per screen rather than once per consumer.
 */
export const useDirectory = (client: ApiClient): Directory => {
  const [roles, setRoles] = useState<RemoteState<AdminRolesResponse>>({ status: 'loading' });
  const [groups, setGroups] = useState<RemoteState<AdminGroupsResponse>>({ status: 'loading' });
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let active = true;
    setRoles({ status: 'loading' });
    setGroups({ status: 'loading' });

    void Promise.all([
      client.get<AdminRolesResponse>(`/api/admin/roles?limit=${PAGE_LIMIT}`),
      client.get<AdminGroupsResponse>(`/api/admin/groups?limit=${PAGE_LIMIT}`),
    ]).then(([roleResult, groupResult]) => {
      if (!active) {
        return;
      }
      setRoles(
        roleResult.ok
          ? { status: 'ready', data: roleResult.data }
          : { status: 'failed', error: roleResult.error },
      );
      setGroups(
        groupResult.ok
          ? { status: 'ready', data: groupResult.data }
          : { status: 'failed', error: groupResult.error },
      );
    });

    return () => {
      active = false;
    };
  }, [client, generation]);

  const groupNames = useMemo(() => {
    if (groups.status !== 'ready') {
      return new Map<string, string>();
    }
    return new Map(groups.data.groups.map((group) => [group._id, group.name]));
  }, [groups]);

  const roleNames = useMemo(() => {
    if (roles.status !== 'ready') {
      return new Set<string>();
    }
    return new Set(roles.data.roles.map((role) => role.name));
  }, [roles]);

  const labelFor = useCallback(
    (kind: PrincipalKind, id: string): string | null => {
      if (kind === 'role') {
        return roleNames.has(id) ? id : null;
      }
      if (kind === 'group') {
        return groupNames.get(id) ?? null;
      }
      return null;
    },
    [groupNames, roleNames],
  );

  const reload = useCallback((): void => setGeneration((value) => value + 1), []);

  return { roles, groups, reload, labelFor };
};
