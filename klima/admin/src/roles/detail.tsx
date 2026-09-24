import { useCallback, useEffect, useState } from 'react';

import type { AdminRoleResponse, AdminRoleDetail } from './types';
import type { ApiClient, RemoteState } from '../api';

import { buttonSecondary, ErrorNote, Loading } from '../ui';
import { PermissionsEditor } from './permissions';
import { RoleDetailsForm } from './details';
import { DeleteRoleForm } from './danger';
import { isSystemRole } from './system';
import { RoleMembers } from './members';
import { rolePath } from './paths';

interface RoleDetailProps {
  client: ApiClient;
  roleName: string;
  onRenamed: (name: string, message: string) => void;
  onMessage: (message: string) => void;
  onChanged: () => void;
  onDeleted: (message: string) => void;
  onClose: () => void;
}

export const RoleDetail = ({
  client,
  roleName,
  onRenamed,
  onMessage,
  onChanged,
  onDeleted,
  onClose,
}: RoleDetailProps) => {
  const [state, setState] = useState<RemoteState<AdminRoleDetail>>({ status: 'loading' });
  const [memberTotal, setMemberTotal] = useState<number | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setState({ status: 'loading' });
    const result = await client.get<AdminRoleResponse>(rolePath(roleName));
    setState(
      result.ok
        ? { status: 'ready', data: result.data.role }
        : { status: 'failed', error: result.error },
    );
  }, [client, roleName]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === 'loading') {
    return (
      <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <Loading label={`Loading ${roleName}…`} />
      </aside>
    );
  }

  if (state.status === 'failed') {
    return (
      <aside className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <ErrorNote error={state.error} label={`Could not load ${roleName}.`} />
        <button type="button" className={buttonSecondary} onClick={() => void load()}>
          Try again
        </button>
      </aside>
    );
  }

  const role = state.data;

  return (
    <aside className="space-y-4" aria-label={`Details for the ${role.name} role`}>
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{role.name}</h2>
            <p className="text-sm text-slate-600">{role.description || 'No description'}</p>
            <p className="mt-1 text-xs text-slate-500">
              {isSystemRole(role.name) ? 'System role' : 'Custom role'}
              {memberTotal === null ? '' : ` · ${memberTotal} member(s)`}
            </p>
          </div>
          <button type="button" className={buttonSecondary} onClick={onClose}>
            Close
          </button>
        </div>
      </section>

      <RoleDetailsForm
        client={client}
        role={role}
        onUpdated={(updated, message) => {
          if (updated.name !== role.name) {
            onRenamed(updated.name, message);
            return;
          }
          setState({ status: 'ready', data: updated });
          onMessage(message);
          onChanged();
        }}
      />

      <PermissionsEditor
        client={client}
        role={role}
        onSaved={(updated) => setState({ status: 'ready', data: updated })}
      />

      <RoleMembers client={client} roleName={role.name} onTotalChange={setMemberTotal} />

      <DeleteRoleForm client={client} role={role} memberTotal={memberTotal} onDeleted={onDeleted} />
    </aside>
  );
};
