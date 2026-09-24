import { useCallback, useEffect, useRef, useState } from 'react';

import type { AdminRolesResponse } from './types';
import type { ApiClient, RemoteState } from '../api';
import type { AdminUser } from '../session';

import { buttonSecondary, SuccessNote, WarningNote } from '../ui';
import { rolesListPath, ROLES_PAGE_LIMIT } from './paths';
import { OPENID_SYNC_WARNING } from './system';
import { CreateRoleForm } from './create';
import { RoleDetail } from './detail';
import { RolesTable } from './list';

interface RolesScreenProps {
  client: ApiClient;
  admin: AdminUser;
}

export const RolesScreen = ({ client, admin }: RolesScreenProps) => {
  const [offset, setOffset] = useState(0);
  const [list, setList] = useState<RemoteState<AdminRolesResponse>>({ status: 'loading' });
  const [selectedName, setSelectedName] = useState('');
  const [message, setMessage] = useState('');

  const listRequestId = useRef(0);

  const loadList = useCallback(async (): Promise<void> => {
    const id = listRequestId.current + 1;
    listRequestId.current = id;
    setList({ status: 'loading' });

    const result = await client.get<AdminRolesResponse>(rolesListPath(ROLES_PAGE_LIMIT, offset));
    if (id !== listRequestId.current) {
      return;
    }
    setList(
      result.ok
        ? { status: 'ready', data: result.data }
        : { status: 'failed', error: result.error },
    );
  }, [client, offset]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const handleDeleted = (deletedMessage: string): void => {
    setMessage(deletedMessage);
    setSelectedName('');
    void loadList();
  };

  const handleRenamed = (name: string, renameMessage: string): void => {
    setMessage(renameMessage);
    setSelectedName(name);
    void loadList();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <header className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Roles &amp; permissions</h1>
            <p className="text-sm text-slate-600">
              Create a role, grant it the features it needs, and decide who holds it. Every user
              holds exactly one role.
            </p>
          </div>
          <p className="text-sm text-slate-600">
            Signed in as <span className="font-medium text-slate-900">{admin.email}</span> (
            {admin.role})
          </p>
        </div>
        <div className="mt-3">
          <WarningNote>{OPENID_SYNC_WARNING}</WarningNote>
        </div>
      </header>

      {message ? <SuccessNote>{message}</SuccessNote> : null}

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
          <h2 className="text-base font-semibold text-slate-900">Roles</h2>
          <button type="button" className={buttonSecondary} onClick={() => void loadList()}>
            Refresh
          </button>
        </div>
        <RolesTable
          state={list}
          selectedName={selectedName || undefined}
          onSelect={(role) => {
            setMessage('');
            setSelectedName(role.name);
          }}
          onOffsetChange={setOffset}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <CreateRoleForm
          client={client}
          onCreated={(role, createdMessage) => {
            setMessage(createdMessage);
            setSelectedName(role.name);
            void loadList();
          }}
        />

        {selectedName ? (
          <RoleDetail
            key={selectedName}
            client={client}
            roleName={selectedName}
            onRenamed={handleRenamed}
            onMessage={setMessage}
            onChanged={() => void loadList()}
            onDeleted={handleDeleted}
            onClose={() => setSelectedName('')}
          />
        ) : (
          <aside className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
            Open a role above to edit its permissions and its members, or create one on the left.
          </aside>
        )}
      </div>
    </div>
  );
};
