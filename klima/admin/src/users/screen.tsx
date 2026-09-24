import { useCallback, useEffect, useRef, useState } from 'react';

import type { TAdminBalanceListResponse } from 'librechat-data-provider';
import type { ApiClient, RemoteState } from '../api';
import type { AdminUser } from '../session';
import type { SelectedUser } from './types';

import { SearchPanel, useUserSearch } from './search';
import { CREDIT_CONVERSION_NOTE } from '../credits';
import { BalancesTable } from './table';
import { UserDetail } from './detail';
import { SuccessNote } from '../ui';

interface UsersScreenProps {
  client: ApiClient;
  admin: AdminUser;
}

/** The balances endpoint defaults to 50 and caps at 200 (`parsePagination`). */
const PAGE_LIMIT = 50;

/** Search results carry no role, so a hit already on the loaded balances page borrows its own. */
const roleFromList = (
  state: RemoteState<TAdminBalanceListResponse>,
  userId: string,
): string | undefined =>
  state.status === 'ready'
    ? state.data.balances.find((row) => row.userId === userId)?.role
    : undefined;

export const UsersScreen = ({ client, admin }: UsersScreenProps) => {
  const [offset, setOffset] = useState(0);
  const [list, setList] = useState<RemoteState<TAdminBalanceListResponse>>({ status: 'loading' });
  const [selected, setSelected] = useState<SelectedUser | null>(null);
  const [deletedMessage, setDeletedMessage] = useState('');

  const search = useUserSearch(client);
  const listRequestId = useRef(0);

  const loadList = useCallback(async (): Promise<void> => {
    const id = listRequestId.current + 1;
    listRequestId.current = id;
    setList({ status: 'loading' });

    const result = await client.get<TAdminBalanceListResponse>(
      `/api/admin/balances?limit=${PAGE_LIMIT}&offset=${offset}`,
    );
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

  const handleSelect = (user: SelectedUser): void => {
    setDeletedMessage('');
    setSelected(user.role ? user : { ...user, role: roleFromList(list, user.id) });
  };

  const handleRoleChanged = (role: string): void => {
    setSelected((previous) => (previous ? { ...previous, role } : previous));
    void loadList();
  };

  const handleDeleted = (message: string): void => {
    setDeletedMessage(message);
    setSelected(null);
    search.clear();
    void loadList();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <header className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Users &amp; balances</h1>
            <p className="text-sm text-slate-600">
              Top up a user who ran out of credits, change the role they hold, or offboard someone
              who has left.
            </p>
          </div>
          <p className="text-sm text-slate-600">
            Signed in as <span className="font-medium text-slate-900">{admin.email}</span> (
            {admin.role})
          </p>
        </div>
        <p className="mt-3 rounded bg-slate-100 p-2 text-sm text-slate-700">
          Balances are stored in token credits and shown in dollars: {CREDIT_CONVERSION_NOTE}.
        </p>
      </header>

      {deletedMessage ? <SuccessNote>{deletedMessage}</SuccessNote> : null}

      <SearchPanel
        search={search}
        title="Find a user"
        description="Search reaches every user, including those with no balance record yet."
        inputId="admin-user-search"
        actionLabel="Manage"
        onSelect={handleSelect}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <h2 className="border-b border-slate-200 px-3 py-2 text-base font-semibold text-slate-900">
            Balances
          </h2>
          <BalancesTable
            state={list}
            selectedId={selected?.id}
            onSelect={handleSelect}
            onOffsetChange={setOffset}
          />
        </section>

        {selected ? (
          <UserDetail
            client={client}
            user={selected}
            isSelf={selected.id === admin.id}
            onBalanceChanged={() => void loadList()}
            onRoleChanged={handleRoleChanged}
            onDeleted={handleDeleted}
            onClose={() => setSelected(null)}
          />
        ) : (
          <aside className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
            Pick a user from the table or the search results to see their balance and act on it.
          </aside>
        )}
      </div>
    </div>
  );
};
