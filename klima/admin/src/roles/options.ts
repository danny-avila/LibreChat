import { useCallback, useEffect, useRef, useState } from 'react';

import type { AdminRolesResponse } from './types';
import type { ApiClient, RemoteState } from '../api';

import { rolesListPath, ROLE_OPTIONS_LIMIT } from './paths';

export interface RoleOptions {
  state: RemoteState<AdminRolesResponse>;
  reload: () => void;
}

/** Every control that offers roles to pick from reads them through this one request. */
export const useRoleOptions = (client: ApiClient): RoleOptions => {
  const [state, setState] = useState<RemoteState<AdminRolesResponse>>({ status: 'loading' });
  const requestId = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const id = requestId.current + 1;
    requestId.current = id;
    setState({ status: 'loading' });

    const result = await client.get<AdminRolesResponse>(rolesListPath(ROLE_OPTIONS_LIMIT, 0));
    if (id !== requestId.current) {
      return;
    }
    setState(
      result.ok
        ? { status: 'ready', data: result.data }
        : { status: 'failed', error: result.error },
    );
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, reload: () => void load() };
};
