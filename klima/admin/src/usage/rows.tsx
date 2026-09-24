import type { TUsageMonthlyRow } from 'librechat-data-provider';

import { Empty, Money } from '../ui';
import { monthLabel } from './rollup';

const headerCell = 'px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500';
const bodyCell = 'px-3 py-2 align-top text-sm text-slate-700';

const count = new Intl.NumberFormat('en-US');

interface RowsTableProps {
  rows: TUsageMonthlyRow[];
  emptyLabel: string;
}

/** The raw `{ user, model, month }` buckets, the one view the row cap can truncate. */
export const RowsTable = ({ rows, emptyLabel }: RowsTableProps) => {
  if (rows.length === 0) {
    return <Empty>{emptyLabel}</Empty>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <caption className="sr-only">
          One row per user, model and month, biggest spend first.
        </caption>
        <thead className="bg-slate-50">
          <tr>
            <th scope="col" className={headerCell}>
              User
            </th>
            <th scope="col" className={headerCell}>
              Model
            </th>
            <th scope="col" className={headerCell}>
              Month
            </th>
            <th scope="col" className={headerCell}>
              Spend
            </th>
            <th scope="col" className={headerCell}>
              Transactions
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.userId}:${row.model}:${row.month}`}
              className="odd:bg-white even:bg-slate-50"
            >
              <th scope="row" className={`${bodyCell} font-medium text-slate-900`}>
                <span className="block">{row.name || row.email || row.userId}</span>
                <span className="block text-xs font-normal text-slate-500">
                  {row.email || row.userId}
                </span>
              </th>
              <td className={bodyCell}>{row.model}</td>
              <td className={bodyCell}>{monthLabel(row.month)}</td>
              <td className={bodyCell}>
                <Money credits={row.credits} />
              </td>
              <td className={bodyCell}>{count.format(row.transactions)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
