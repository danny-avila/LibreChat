import { useCallback, useRef, useState } from 'react';

import type { AdminUserSearchResponse, SelectedUser } from './types';
import type { ApiClient, RemoteState } from '../api';

import { buttonPrimary, buttonSecondary, inputField, ErrorNote, Loading, Empty } from '../ui';

export interface UserSearch {
  query: string;
  state: RemoteState<AdminUserSearchResponse> | null;
  setQuery: (query: string) => void;
  run: () => void;
  clear: () => void;
}

interface SearchPanelProps {
  search: UserSearch;
  title: string;
  description: string;
  inputId: string;
  actionLabel: string;
  onSelect: (user: SelectedUser) => void;
}

const MIN_SEARCH_LENGTH = 2;

/** Every screen that acts on a single user finds it through the same `users/search` endpoint. */
export const useUserSearch = (client: ApiClient): UserSearch => {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<RemoteState<AdminUserSearchResponse> | null>(null);
  const requestId = useRef(0);

  const run = useCallback(async (): Promise<void> => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_SEARCH_LENGTH) {
      setState({
        status: 'failed',
        error: { status: 0, message: 'Type at least two characters to search.' },
      });
      return;
    }

    const id = requestId.current + 1;
    requestId.current = id;
    setState({ status: 'loading' });

    const result = await client.get<AdminUserSearchResponse>(
      `/api/admin/users/search?q=${encodeURIComponent(trimmed)}`,
    );
    if (id !== requestId.current) {
      return;
    }
    setState(
      result.ok
        ? { status: 'ready', data: result.data }
        : { status: 'failed', error: result.error },
    );
  }, [client, query]);

  const clear = useCallback((): void => {
    requestId.current += 1;
    setQuery('');
    setState(null);
  }, []);

  return { query, state, setQuery, run: () => void run(), clear };
};

const Results = ({
  state,
  actionLabel,
  onSelect,
}: {
  state: RemoteState<AdminUserSearchResponse>;
  actionLabel: string;
  onSelect: (user: SelectedUser) => void;
}) => {
  if (state.status === 'loading') {
    return <Loading label="Searching users…" />;
  }

  if (state.status === 'failed') {
    return <ErrorNote error={state.error} label="Search failed." />;
  }

  if (state.data.users.length === 0) {
    return (
      <Empty>
        No user matches that search. The search matches the start of a name, email or username.
      </Empty>
    );
  }

  return (
    <div>
      <ul className="divide-y divide-slate-200 border-t border-slate-200">
        {state.data.users.map((user) => (
          <li key={user.id} className="flex items-center justify-between gap-4 py-2">
            <span className="text-sm">
              <span className="font-medium text-slate-900">{user.name || '—'}</span>
              <span className="ml-2 text-slate-600">{user.email}</span>
            </span>
            <button
              type="button"
              className={buttonSecondary}
              aria-label={`${actionLabel} ${user.name || user.email || user.id}`}
              onClick={() =>
                onSelect({ id: user.id, name: user.name, email: user.email, role: user.role })
              }
            >
              {actionLabel}
            </button>
          </li>
        ))}
      </ul>
      {state.data.capped ? (
        <p className="pt-2 text-xs text-slate-500">
          More users match than are shown. Narrow the search to see the rest.
        </p>
      ) : null}
    </div>
  );
};

export const SearchPanel = ({
  search,
  title,
  description,
  inputId,
  actionLabel,
  onSelect,
}: SearchPanelProps) => (
  <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
    <h2 className="mb-1 text-base font-semibold text-slate-900">{title}</h2>
    <p className="mb-3 text-sm text-slate-600">{description}</p>
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        search.run();
      }}
    >
      <div className="min-w-[16rem] flex-1">
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor={inputId}>
          Name, email or username
        </label>
        <input
          id={inputId}
          className={inputField}
          type="search"
          value={search.query}
          autoComplete="off"
          onChange={(event) => search.setQuery(event.target.value)}
        />
      </div>
      <button type="submit" className={buttonPrimary}>
        Search
      </button>
      <button
        type="button"
        className={buttonSecondary}
        onClick={search.clear}
        disabled={search.state === null && search.query === ''}
      >
        Clear
      </button>
    </form>
    {search.state === null ? null : (
      <div className="mt-3">
        <Results state={search.state} actionLabel={actionLabel} onSelect={onSelect} />
      </div>
    )}
  </section>
);
