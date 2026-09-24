import { useCallback, useEffect, useRef, useState } from 'react';

import type { AdminConfigListResponse, PrincipalKind, PrincipalRef } from './types';
import type { ApiClient, RemoteState } from '../api';
import type { AdminUser } from '../session';

import { buttonSecondary, SuccessNote } from '../ui';
import { useUserSearch } from '../users/search';
import { PrincipalPicker } from './picker';
import { useDirectory } from './directory';
import { configListPath } from './paths';
import { OverridesTable } from './list';
import { ConfigEditor } from './editor';

interface ConfigScreenProps {
  client: ApiClient;
  admin: AdminUser;
}

export const ConfigScreen = ({ client, admin }: ConfigScreenProps) => {
  const [list, setList] = useState<RemoteState<AdminConfigListResponse>>({ status: 'loading' });
  const [kind, setKind] = useState<PrincipalKind>('role');
  const [selected, setSelected] = useState<PrincipalRef | null>(null);
  const [deletedMessage, setDeletedMessage] = useState('');

  const directory = useDirectory(client);
  const search = useUserSearch(client);
  const listRequestId = useRef(0);

  const loadList = useCallback(async (): Promise<void> => {
    const id = listRequestId.current + 1;
    listRequestId.current = id;
    setList({ status: 'loading' });

    const result = await client.get<AdminConfigListResponse>(configListPath());
    if (id !== listRequestId.current) {
      return;
    }
    setList(
      result.ok
        ? { status: 'ready', data: result.data }
        : { status: 'failed', error: result.error },
    );
  }, [client]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const handleSelect = (principal: PrincipalRef): void => {
    setDeletedMessage('');
    setKind(principal.kind);
    setSelected(principal);
  };

  const handleKindChange = (next: PrincipalKind): void => {
    setDeletedMessage('');
    setKind(next);
    setSelected(null);
    if (next === 'user') {
      search.clear();
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <header className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Config overrides</h1>
            <p className="text-sm text-slate-600">
              Per-role, per-group and per-user budgets, model lists, rate limits and interface
              flags. Changes take effect without a redeploy.
            </p>
          </div>
          <p className="text-sm text-slate-600">
            Signed in as <span className="font-medium text-slate-900">{admin.email}</span> (
            {admin.role})
          </p>
        </div>
        <p className="mt-3 rounded bg-slate-100 p-2 text-sm text-slate-700">
          A person can be covered by a role, a group and a user override at once. They are merged in
          priority order and the <span className="font-medium">highest priority wins</span> every
          field it sets; anything nobody sets falls back to librechat.yaml.
        </p>
      </header>

      {deletedMessage ? <SuccessNote>{deletedMessage}</SuccessNote> : null}

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
          <h2 className="text-base font-semibold text-slate-900">Existing overrides</h2>
          <button type="button" className={buttonSecondary} onClick={() => void loadList()}>
            Refresh
          </button>
        </div>
        <OverridesTable
          state={list}
          directory={directory}
          selected={selected}
          onSelect={handleSelect}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <PrincipalPicker
          directory={directory}
          search={search}
          kind={kind}
          selected={selected}
          onKindChange={handleKindChange}
          onSelect={handleSelect}
        />

        {selected ? (
          <ConfigEditor
            client={client}
            principal={selected}
            onChanged={() => void loadList()}
            onDeleted={(message) => {
              setDeletedMessage(message);
              setSelected(null);
              void loadList();
            }}
            onClose={() => setSelected(null)}
          />
        ) : (
          <aside className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
            Pick a principal on the left, or edit one of the overrides above, to see its budget and
            its raw sections.
          </aside>
        )}
      </div>
    </div>
  );
};
