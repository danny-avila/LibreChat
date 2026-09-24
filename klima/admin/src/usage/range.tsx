import { useState } from 'react';
import { USAGE_MAX_RANGE_DAYS } from 'librechat-data-provider';

import type { UsageRange } from './types';

import { buttonPrimary, buttonSecondary, inputField, WarningNote } from '../ui';

const DAY_MS = 24 * 60 * 60 * 1000;

const dayKeys = (timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

export const browserTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

/** Today in `timeZone` as the `YYYY-MM-DD` key the API and `<input type="date">` both speak. */
export const todayKey = (timeZone: string): string => {
  try {
    return dayKeys(timeZone).format(new Date());
  } catch {
    return dayKeys('UTC').format(new Date());
  }
};

export const currentMonthRange = (): UsageRange => {
  const timeZone = browserTimeZone();
  const today = todayKey(timeZone);
  return { from: `${today.slice(0, 7)}-01`, to: today, timeZone };
};

/** Pure key arithmetic: both keys are calendar days, so no zone is involved in the span. */
export const spannedDays = (from: string, to: string): number => {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return 0;
  }
  return Math.round((end - start) / DAY_MS) + 1;
};

interface RangeControlProps {
  range: UsageRange;
  busy: boolean;
  onApply: (range: UsageRange) => void;
}

const fieldLabel = 'mb-1 block text-sm font-medium text-slate-700';

export const RangeControl = ({ range, busy, onApply }: RangeControlProps) => {
  const [draft, setDraft] = useState<UsageRange>(range);

  const span = spannedDays(draft.from, draft.to);
  const inverted = span <= 0;
  const tooWide = span > USAGE_MAX_RANGE_DAYS;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-1 text-base font-semibold text-slate-900">Range</h2>
      <p className="mb-3 text-sm text-slate-600">
        Spend is bucketed by calendar day and month in the time zone you pick here. The default is
        the current calendar month.
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          onApply(draft);
        }}
      >
        <div>
          <label className={fieldLabel} htmlFor="admin-usage-from">
            From
          </label>
          <input
            id="admin-usage-from"
            className={inputField}
            type="date"
            value={draft.from}
            onChange={(event) => setDraft({ ...draft, from: event.target.value })}
          />
        </div>
        <div>
          <label className={fieldLabel} htmlFor="admin-usage-to">
            To
          </label>
          <input
            id="admin-usage-to"
            className={inputField}
            type="date"
            value={draft.to}
            onChange={(event) => setDraft({ ...draft, to: event.target.value })}
          />
        </div>
        <div className="min-w-[14rem] flex-1">
          <label className={fieldLabel} htmlFor="admin-usage-timezone">
            Time zone (IANA)
          </label>
          <input
            id="admin-usage-timezone"
            className={inputField}
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={draft.timeZone}
            onChange={(event) => setDraft({ ...draft, timeZone: event.target.value })}
          />
        </div>
        <button type="submit" className={buttonPrimary} disabled={busy || inverted}>
          {busy ? 'Loading…' : 'Apply'}
        </button>
        <button
          type="button"
          className={buttonSecondary}
          disabled={busy}
          onClick={() => {
            const reset = currentMonthRange();
            setDraft(reset);
            onApply(reset);
          }}
        >
          This month
        </button>
      </form>
      <p className="mt-2 text-xs text-slate-500">
        An unrecognized time zone falls back to UTC on the server. The response says which zone it
        actually used.
      </p>
      {inverted ? (
        <div className="mt-3">
          <WarningNote>The start date must fall on or before the end date.</WarningNote>
        </div>
      ) : null}
      {tooWide ? (
        <div className="mt-3">
          <WarningNote>
            That range spans {span} days. The server accepts at most {USAGE_MAX_RANGE_DAYS} and will
            reject it.
          </WarningNote>
        </div>
      ) : null}
    </section>
  );
};
