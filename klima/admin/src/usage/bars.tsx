import type { ReactNode } from 'react';
import type { UsageSlice } from './types';

import { formatCredits, formatDollars } from '../credits';
import { Empty } from '../ui';

const percentOf = (value: number, max: number): number => {
  if (max <= 0) {
    return 0;
  }
  return Math.max(Math.round((value / max) * 100), value > 0 ? 2 : 0);
};

const share = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 1,
});

interface BarListProps {
  slices: UsageSlice[];
  total: number;
  emptyLabel: string;
  /** Rendered instead of the raw label, for rows that need a drill-in control. */
  renderLabel?: (slice: UsageSlice) => ReactNode;
}

/**
 * A bar is a div sized by share of the largest slice — a charting dependency would be a
 * much larger surface than the one thing this screen needs from it.
 */
export const BarList = ({ slices, total, emptyLabel, renderLabel }: BarListProps) => {
  if (slices.length === 0) {
    return <Empty>{emptyLabel}</Empty>;
  }

  const max = slices.reduce((highest, slice) => Math.max(highest, slice.credits), 0);

  return (
    <ul className="space-y-3">
      {slices.map((slice) => (
        <li key={slice.key}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-medium text-slate-900">
              {renderLabel ? renderLabel(slice) : slice.label}
            </span>
            <span className="text-sm text-slate-900">
              {formatDollars(slice.credits)}
              <span className="ml-2 text-xs text-slate-500">
                {total > 0 ? share.format(slice.credits / total) : '—'}
              </span>
            </span>
          </div>
          <div
            className="mt-1 h-2 w-full overflow-hidden rounded bg-slate-100"
            role="img"
            aria-label={`${slice.label}: ${formatDollars(slice.credits)} (${formatCredits(
              slice.credits,
            )})`}
          >
            <div
              className="h-full rounded bg-blue-600"
              style={{ width: `${percentOf(slice.credits, max)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {formatCredits(slice.credits)}
            {slice.secondary ? ` · ${slice.secondary}` : ''}
          </p>
        </li>
      ))}
    </ul>
  );
};

export const Card = ({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) => (
  <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
    <h2 className="text-base font-semibold text-slate-900">{title}</h2>
    {hint ? <p className="mb-3 mt-1 text-sm text-slate-600">{hint}</p> : <div className="mb-3" />}
    {children}
  </section>
);
