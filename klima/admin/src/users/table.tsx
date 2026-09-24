import type { TAdminBalanceListResponse, TAdminBalanceListItem } from 'librechat-data-provider';
import type { SelectedUser } from './types';
import type { RemoteState } from '../api';

import { buttonSecondary, ErrorNote, Loading, Empty, Money, Pagination } from '../ui';
import { formatTimestamp } from '../format';
import { formatDollars } from '../credits';

interface BalancesTableProps {
  state: RemoteState<TAdminBalanceListResponse>;
  selectedId?: string;
  onSelect: (user: SelectedUser) => void;
  onOffsetChange: (offset: number) => void;
}

const headerCell = 'px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500';
const bodyCell = 'px-3 py-2 align-top text-sm text-slate-700';

const describeRefill = (row: TAdminBalanceListItem): string => {
  if (!row.autoRefillEnabled) {
    return 'Off';
  }
  return `${formatDollars(row.refillAmount)} every ${row.refillIntervalValue} ${row.refillIntervalUnit}`;
};

const toSelectedUser = (row: TAdminBalanceListItem): SelectedUser => ({
  id: row.userId,
  name: row.name,
  email: row.email,
  role: row.role,
});

export const BalancesTable = ({
  state,
  selectedId,
  onSelect,
  onOffsetChange,
}: BalancesTableProps) => {
  if (state.status === 'loading') {
    return <Loading label="Loading balances…" />;
  }

  if (state.status === 'failed') {
    return <ErrorNote error={state.error} label="Could not load balances." />;
  }

  const { balances, total, limit, offset } = state.data;

  if (balances.length === 0) {
    return (
      <div>
        <Empty>
          No balance records on this page. Users appear here once they have a balance; search above
          to find anyone else.
        </Empty>
        <Pagination
          total={total}
          limit={limit}
          offset={offset}
          label="Balances pages"
          onOffsetChange={onOffsetChange}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <caption className="px-3 py-2 text-left text-sm text-slate-600">
            Every user with a balance record, richest first.
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
                Role
              </th>
              <th scope="col" className={headerCell}>
                Credits
              </th>
              <th scope="col" className={headerCell}>
                Auto-refill
              </th>
              <th scope="col" className={headerCell}>
                Last refill
              </th>
              <th scope="col" className={headerCell}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {balances.map((row) => (
              <tr
                key={row.userId}
                className={
                  row.userId === selectedId ? 'bg-blue-50' : 'odd:bg-white even:bg-slate-50'
                }
              >
                <th scope="row" className={`${bodyCell} font-medium text-slate-900`}>
                  {row.name || '—'}
                </th>
                <td className={bodyCell}>{row.email || '—'}</td>
                <td className={bodyCell}>{row.role || '—'}</td>
                <td className={bodyCell}>
                  <Money credits={row.tokenCredits} />
                </td>
                <td className={bodyCell}>{describeRefill(row)}</td>
                <td className={bodyCell}>{formatTimestamp(row.lastRefill)}</td>
                <td className={bodyCell}>
                  <button
                    type="button"
                    className={buttonSecondary}
                    aria-label={`Manage ${row.name || row.email || row.userId}`}
                    aria-pressed={row.userId === selectedId}
                    onClick={() => onSelect(toSelectedUser(row))}
                  >
                    Manage
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        total={total}
        limit={limit}
        offset={offset}
        label="Balances pages"
        onOffsetChange={onOffsetChange}
      />
    </div>
  );
};
