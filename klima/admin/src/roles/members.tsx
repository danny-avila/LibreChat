import { useCallback, useEffect, useRef, useState } from 'react';

import type { AdminRoleMembersResponse, AdminRoleSuccessResponse, AddMemberBody } from './types';
import type { ApiClient, ApiError, RemoteState } from '../api';
import type { SelectedUser } from '../users/types';

import {
  buttonSecondary,
  ErrorNote,
  SuccessNote,
  WarningNote,
  InfoNote,
  Pagination,
  Loading,
  Empty,
} from '../ui';
import { roleMembersListPath, roleMembersPath, roleMemberPath, MEMBERS_PAGE_LIMIT } from './paths';
import { SearchPanel, useUserSearch } from '../users/search';
import { acceptsManualMembers, OPENID_SYNC_WARNING } from './system';

interface RoleMembersProps {
  client: ApiClient;
  roleName: string;
  onTotalChange: (total: number) => void;
}

/** What each refusal from the two member routes means to the admin reading it. */
const REFUSALS: Record<number, string> = {
  400: 'The API answers 400 for a malformed user id, for a user who does not hold this role, and when the write would leave the deployment with no admin at all.',
  403: 'The API refuses direct membership writes on system roles other than ADMIN.',
  404: 'Either the role or the user is gone. Reload this screen.',
};

const bodyCell = 'px-3 py-2 align-top text-sm text-slate-700';
const headerCell = 'px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500';

export const RoleMembers = ({ client, roleName, onTotalChange }: RoleMembersProps) => {
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState<RemoteState<AdminRoleMembersResponse>>({ status: 'loading' });
  const [pendingId, setPendingId] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [message, setMessage] = useState('');

  const search = useUserSearch(client);
  const requestId = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const id = requestId.current + 1;
    requestId.current = id;
    setState({ status: 'loading' });

    const result = await client.get<AdminRoleMembersResponse>(
      roleMembersListPath(roleName, MEMBERS_PAGE_LIMIT, offset),
    );
    if (id !== requestId.current) {
      return;
    }
    if (!result.ok) {
      setState({ status: 'failed', error: result.error });
      return;
    }
    setState({ status: 'ready', data: result.data });
    onTotalChange(result.data.total);
  }, [client, offset, onTotalChange, roleName]);

  useEffect(() => {
    setOffset(0);
  }, [roleName]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async (user: SelectedUser): Promise<void> => {
    setPendingId(user.id);
    setError(null);
    setMessage('');

    const result = await client.post<AdminRoleSuccessResponse, AddMemberBody>(
      roleMembersPath(roleName),
      { userId: user.id },
    );
    setPendingId('');

    if (!result.ok) {
      setError(result.error);
      return;
    }

    search.clear();
    setMessage(
      `${user.name || user.email || user.id} now holds ${roleName}. A user holds exactly one role, so this replaced the one they had.`,
    );
    void load();
  };

  const remove = async (userId: string, label: string): Promise<void> => {
    setPendingId(userId);
    setError(null);
    setMessage('');

    const result = await client.remove<AdminRoleSuccessResponse>(roleMemberPath(roleName, userId));
    setPendingId('');

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setMessage(`${label} was moved back to the USER role.`);
    void load();
  };

  const canAdd = acceptsManualMembers(roleName);

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
          <h3 className="text-base font-semibold text-slate-900">
            Members{state.status === 'ready' ? ` (${state.data.total})` : ''}
          </h3>
          <button type="button" className={buttonSecondary} onClick={() => void load()}>
            Refresh
          </button>
        </div>

        {state.status === 'loading' ? <Loading label="Loading members…" /> : null}
        {state.status === 'failed' ? (
          <div className="p-3">
            <ErrorNote error={state.error} label="Could not load the members." />
          </div>
        ) : null}

        {state.status === 'ready' && state.data.members.length === 0 ? (
          <div className="px-3">
            <Empty>Nobody holds this role yet.</Empty>
          </div>
        ) : null}

        {state.status === 'ready' && state.data.members.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <caption className="px-3 py-2 text-left text-sm text-slate-600">
                Everyone whose `role` field is {roleName}. Removing someone moves them to USER.
              </caption>
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className={headerCell}>
                    Name
                  </th>
                  <th scope="col" className={headerCell}>
                    Email
                  </th>
                  <th scope="col" className={headerCell}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.data.members.map((member) => {
                  const label = member.name || member.email || member.userId;
                  return (
                    <tr key={member.userId} className="odd:bg-white even:bg-slate-50">
                      <th scope="row" className={`${bodyCell} font-medium text-slate-900`}>
                        {member.name || '—'}
                      </th>
                      <td className={bodyCell}>{member.email || '—'}</td>
                      <td className={bodyCell}>
                        <button
                          type="button"
                          className={buttonSecondary}
                          disabled={pendingId === member.userId}
                          aria-label={`Remove ${label} from ${roleName}`}
                          onClick={() => void remove(member.userId, label)}
                        >
                          {pendingId === member.userId ? 'Removing…' : 'Remove'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {state.status === 'ready' ? (
          <Pagination
            total={state.data.total}
            limit={state.data.limit}
            offset={state.data.offset}
            label="Members pages"
            onOffsetChange={setOffset}
          />
        ) : null}
      </div>

      <WarningNote>{OPENID_SYNC_WARNING}</WarningNote>

      {canAdd ? (
        <SearchPanel
          search={search}
          title="Add a member"
          description={`Search reaches every user. Adding one sets their role to ${roleName}, replacing whatever role they hold today.`}
          inputId="role-member-search"
          actionLabel={pendingId ? 'Adding…' : 'Add to role'}
          onSelect={(user) => void add(user)}
        />
      ) : (
        <InfoNote>
          The API answers 403 to a membership write on this system role, so the add and remove
          controls are not offered here. Move people into USER by removing them from whichever role
          they hold.
        </InfoNote>
      )}

      {message ? <SuccessNote>{message}</SuccessNote> : null}
      {error ? (
        <div className="space-y-2">
          <ErrorNote error={error} label="The membership change was refused." />
          {REFUSALS[error.status] ? (
            <p className="text-sm text-slate-700">{REFUSALS[error.status]}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};
