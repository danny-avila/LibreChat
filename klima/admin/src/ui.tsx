import type { ReactNode } from 'react';
import type { ApiError } from './api';

import { CREDIT_CONVERSION_NOTE, formatCredits, formatDollars } from './credits';
import { describeError } from './api';

export const buttonPrimary =
  'rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600';

export const buttonSecondary =
  'rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-slate-400';

export const buttonDanger =
  'rounded bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600';

export const inputField =
  'w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

export const Loading = ({ label }: { label: string }) => (
  <p className="py-4 text-sm text-slate-600" aria-live="polite">
    {label}
  </p>
);

export const Empty = ({ children }: { children: ReactNode }) => (
  <p className="py-4 text-sm text-slate-600">{children}</p>
);

export const ErrorNote = ({ error, label }: { error: ApiError; label: string }) => (
  <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
    <span className="font-semibold">{label}</span> {describeError(error)}
  </p>
);

export const SuccessNote = ({ children }: { children: ReactNode }) => (
  <p
    className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-900"
    role="status"
  >
    {children}
  </p>
);

export const WarningNote = ({ children }: { children: ReactNode }) => (
  <p
    className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
    role="status"
  >
    {children}
  </p>
);

export const InfoNote = ({ children }: { children: ReactNode }) => (
  <p className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900" role="status">
    {children}
  </p>
);

interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  label: string;
  onOffsetChange: (offset: number) => void;
}

/** Every admin list endpoint answers with the same `{ total, limit, offset }` envelope. */
export const Pagination = ({ total, limit, offset, label, onOffsetChange }: PaginationProps) => {
  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + limit, total);
  return (
    <nav
      className="flex items-center justify-between border-t border-slate-200 px-3 py-2"
      aria-label={label}
    >
      <p className="text-sm text-slate-600">
        Showing {first}–{last} of {total}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className={buttonSecondary}
          onClick={() => onOffsetChange(Math.max(offset - limit, 0))}
          disabled={offset === 0}
        >
          Previous
        </button>
        <button
          type="button"
          className={buttonSecondary}
          onClick={() => onOffsetChange(offset + limit)}
          disabled={last >= total}
        >
          Next
        </button>
      </div>
    </nav>
  );
};

/** Dollars lead, raw credits stay visible, because the API speaks only credits. */
export const Money = ({ credits }: { credits: number }) => (
  <span className="flex flex-col" title={`${formatCredits(credits)} — ${CREDIT_CONVERSION_NOTE}`}>
    <span className="font-medium text-slate-900">{formatDollars(credits)}</span>
    <span className="text-xs text-slate-500">{formatCredits(credits)}</span>
  </span>
);
