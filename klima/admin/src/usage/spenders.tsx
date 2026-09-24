import type { TUsageUserTotal } from 'librechat-data-provider';

import { buttonSecondary, Empty, Money } from '../ui';
import { spenderLabel } from './rollup';

const headerCell = 'px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500';
const bodyCell = 'px-3 py-2 align-top text-sm text-slate-700';

const count = new Intl.NumberFormat('en-US');

interface SpendersTableProps {
  spenders: TUsageUserTotal[];
  focusedId?: string;
  emptyLabel: string;
  onFocus: (spender: TUsageUserTotal) => void;
}

export const SpendersTable = ({ spenders, focusedId, emptyLabel, onFocus }: SpendersTableProps) => {
  if (spenders.length === 0) {
    return <Empty>{emptyLabel}</Empty>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <caption className="sr-only">
          Spend per user over the selected range, biggest first.
        </caption>
        <thead className="bg-slate-50">
          <tr>
            <th scope="col" className={headerCell}>
              User
            </th>
            <th scope="col" className={headerCell}>
              Role
            </th>
            <th scope="col" className={headerCell}>
              Spend
            </th>
            <th scope="col" className={headerCell}>
              Tokens
            </th>
            <th scope="col" className={headerCell}>
              Transactions
            </th>
            <th scope="col" className={headerCell}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {spenders.map((spender) => {
            const label = spenderLabel(spender);
            return (
              <tr
                key={spender.userId}
                className={
                  spender.userId === focusedId ? 'bg-blue-50' : 'odd:bg-white even:bg-slate-50'
                }
              >
                <th scope="row" className={`${bodyCell} font-medium text-slate-900`}>
                  <span className="block">{label}</span>
                  <span className="block text-xs font-normal text-slate-500">
                    {spender.email || spender.userId}
                  </span>
                </th>
                <td className={bodyCell}>{spender.role || '—'}</td>
                <td className={bodyCell}>
                  <Money credits={spender.credits} />
                </td>
                <td className={bodyCell}>{count.format(spender.tokens)}</td>
                <td className={bodyCell}>{count.format(spender.transactions)}</td>
                <td className={bodyCell}>
                  <button
                    type="button"
                    className={buttonSecondary}
                    aria-pressed={spender.userId === focusedId}
                    aria-label={`Show only ${label}`}
                    onClick={() => onFocus(spender)}
                  >
                    Drill in
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
