import { useCallback, useEffect, useRef, useState } from 'react';

import type { TAdminBalanceResponse, TAdminBalance } from 'librechat-data-provider';
import type { ApiClient, RemoteState } from '../api';
import type { SelectedUser } from './types';

import { buttonSecondary, ErrorNote, InfoNote, Loading, Money } from '../ui';
import { formatTimestamp } from '../format';
import { formatDollars } from '../credits';
import { OffboardForm } from './offboard';
import { TopUpForm } from './topup';
import { RoleForm } from './role';

interface UserDetailProps {
  client: ApiClient;
  user: SelectedUser;
  isSelf: boolean;
  onBalanceChanged: () => void;
  onRoleChanged: (role: string) => void;
  onDeleted: (message: string) => void;
  onClose: () => void;
}

/** A 404 from the balance endpoint is "no record yet", not a failure. */
type BalanceState = RemoteState<TAdminBalance> | { status: 'missing' };

const NOT_FOUND = 404;

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-4 border-b border-slate-100 py-2 last:border-b-0">
    <dt className="text-sm text-slate-500">{label}</dt>
    <dd className="text-sm font-medium text-slate-900">{value}</dd>
  </div>
);

const BalanceSummary = ({ balance }: { balance: TAdminBalance }) => (
  <dl>
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-2">
      <dt className="text-sm text-slate-500">Current balance</dt>
      <dd>
        <Money credits={balance.tokenCredits} />
      </dd>
    </div>
    <Row label="Auto-refill" value={balance.autoRefillEnabled ? 'On' : 'Off'} />
    <Row
      label="Refill amount"
      value={
        balance.autoRefillEnabled
          ? `${formatDollars(balance.refillAmount)} every ${balance.refillIntervalValue} ${balance.refillIntervalUnit}`
          : '—'
      }
    />
    <Row label="Last refill" value={formatTimestamp(balance.lastRefill)} />
  </dl>
);

export const UserDetail = ({
  client,
  user,
  isSelf,
  onBalanceChanged,
  onRoleChanged,
  onDeleted,
  onClose,
}: UserDetailProps) => {
  const [balance, setBalance] = useState<BalanceState>({ status: 'loading' });
  const requestId = useRef(0);

  const loadBalance = useCallback(async (): Promise<void> => {
    const id = requestId.current + 1;
    requestId.current = id;
    setBalance({ status: 'loading' });

    const result = await client.get<TAdminBalanceResponse>(
      `/api/admin/users/${encodeURIComponent(user.id)}/balance`,
    );
    if (id !== requestId.current) {
      return;
    }
    if (result.ok) {
      setBalance({ status: 'ready', data: result.data.balance });
      return;
    }
    if (result.error.status === NOT_FOUND) {
      setBalance({ status: 'missing' });
      return;
    }
    setBalance({ status: 'failed', error: result.error });
  }, [client, user.id]);

  useEffect(() => {
    void loadBalance();
  }, [loadBalance]);

  const handleApplied = (applied: TAdminBalance): void => {
    requestId.current += 1;
    setBalance({ status: 'ready', data: applied });
    onBalanceChanged();
  };

  return (
    <aside className="space-y-4" aria-label={`Details for ${user.name || user.email || user.id}`}>
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{user.name || '—'}</h2>
            <p className="text-sm text-slate-600">{user.email || 'No email on record'}</p>
            <p className="text-xs text-slate-500">
              {user.role ? `${user.role} · ` : ''}
              {user.id}
            </p>
          </div>
          <button type="button" className={buttonSecondary} onClick={onClose}>
            Close
          </button>
        </div>

        {balance.status === 'loading' ? <Loading label="Loading balance…" /> : null}
        {balance.status === 'failed' ? (
          <ErrorNote error={balance.error} label="Could not load this balance." />
        ) : null}
        {balance.status === 'missing' ? (
          <InfoNote>No balance record yet. The first top-up below creates one.</InfoNote>
        ) : null}
        {balance.status === 'ready' ? <BalanceSummary balance={balance.data} /> : null}

        <button
          type="button"
          className={`${buttonSecondary} mt-3`}
          onClick={() => void loadBalance()}
        >
          Refresh balance
        </button>
      </section>

      <RoleForm
        key={user.id}
        client={client}
        user={user}
        isSelf={isSelf}
        onChanged={onRoleChanged}
      />

      <TopUpForm client={client} user={user} onApplied={handleApplied} />
      <OffboardForm client={client} user={user} isSelf={isSelf} onDeleted={onDeleted} />
    </aside>
  );
};
