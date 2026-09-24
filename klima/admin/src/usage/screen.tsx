import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { USAGE_MAX_USERS } from 'librechat-data-provider';
import type { TUsageResponse, TUsageUserTotal } from 'librechat-data-provider';
import type { UsageFocus, UsageRange } from './types';
import type { ApiClient, RemoteState } from '../api';
import type { AdminUser } from '../session';

import { buttonSecondary, Empty, ErrorNote, InfoNote, Loading, WarningNote } from '../ui';
import { toModelSlices, toMonthSlices, toRoleSlices, spenderLabel } from './rollup';
import { CREDIT_CONVERSION_NOTE, formatCredits, formatDollars } from '../credits';
import { currentMonthRange, RangeControl } from './range';
import { SpendersTable } from './spenders';
import { BarList, Card } from './bars';
import { usagePath } from './paths';
import { RowsTable } from './rows';

interface UsageScreenProps {
  client: ApiClient;
  admin: AdminUser;
}

const SPEND_DISCLAIMER =
  'These figures are money spent on model calls. Balance grants and auto-refills are ledger entries of their own and are never counted here, so this is spend, not credits issued.';

const count = new Intl.NumberFormat('en-US');

const Metric = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div>
    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className="text-lg font-semibold text-slate-900">{value}</dd>
    {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
  </div>
);

export const UsageScreen = ({ client, admin }: UsageScreenProps) => {
  const [range, setRange] = useState<UsageRange>(currentMonthRange);
  const [focus, setFocus] = useState<UsageFocus | null>(null);
  const [state, setState] = useState<RemoteState<TUsageResponse>>({ status: 'loading' });

  const requestId = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const id = requestId.current + 1;
    requestId.current = id;
    setState({ status: 'loading' });

    const result = await client.get<TUsageResponse>(usagePath(range, focus?.userId));
    if (id !== requestId.current) {
      return;
    }
    setState(
      result.ok
        ? { status: 'ready', data: result.data }
        : { status: 'failed', error: result.error },
    );
  }, [client, range, focus]);

  useEffect(() => {
    void load();
  }, [load]);

  const data = state.status === 'ready' ? state.data : null;
  const totals = data?.totals ?? null;

  const monthSlices = useMemo(() => (totals ? toMonthSlices(totals) : []), [totals]);
  const roleSlices = useMemo(() => (totals ? toRoleSlices(totals) : []), [totals]);
  const modelSlices = useMemo(() => (totals ? toModelSlices(totals) : []), [totals]);
  const spenders = totals?.byUser ?? [];

  const handleFocus = (spender: TUsageUserTotal): void => {
    if (focus?.userId === spender.userId) {
      setFocus(null);
      return;
    }
    setFocus({ userId: spender.userId, label: spenderLabel(spender) });
  };

  const empty = totals !== null && totals.transactions === 0;

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <header className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Cost dashboard</h1>
            <p className="text-sm text-slate-600">
              What the workspace spent on model calls, read straight from the transaction ledger.
            </p>
          </div>
          <p className="text-sm text-slate-600">
            Signed in as <span className="font-medium text-slate-900">{admin.email}</span> (
            {admin.role})
          </p>
        </div>
        <div className="mt-3">
          <InfoNote>
            {SPEND_DISCLAIMER} Amounts are stored in token credits and shown in dollars:{' '}
            {CREDIT_CONVERSION_NOTE}.
          </InfoNote>
        </div>
      </header>

      <RangeControl range={range} busy={state.status === 'loading'} onApply={setRange} />

      {focus ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
          <p className="text-sm text-blue-900">
            Showing only <span className="font-semibold">{focus.label}</span>. Every figure below is
            that user&rsquo;s spend.
          </p>
          <button type="button" className={buttonSecondary} onClick={() => setFocus(null)}>
            Show everyone
          </button>
        </div>
      ) : null}

      {state.status === 'loading' ? (
        <Card title="Total spend">
          <Loading label="Reading the transaction ledger…" />
        </Card>
      ) : null}

      {state.status === 'failed' ? (
        <div className="space-y-3">
          <ErrorNote error={state.error} label="Could not read usage." />
          <button type="button" className={buttonSecondary} onClick={() => void load()}>
            Try again
          </button>
        </div>
      ) : null}

      {data ? (
        <>
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Total spend</h2>
            <p className="mt-1 text-sm text-slate-600">
              {data.from.slice(0, 10)} to {data.to.slice(0, 10)} ({data.timeZone})
              {data.timeZone !== range.timeZone
                ? ` — the server did not recognize “${range.timeZone}” and fell back to ${data.timeZone}.`
                : ''}
            </p>
            <p className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">
              {formatDollars(data.totals.credits)}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric
                label="Token credits"
                value={formatCredits(data.totals.credits)}
                hint={CREDIT_CONVERSION_NOTE}
              />
              <Metric label="Tokens" value={count.format(data.totals.tokens)} />
              <Metric label="Transactions" value={count.format(data.totals.transactions)} />
              <Metric
                label="Months covered"
                value={count.format(data.totals.byMonth.length)}
                hint={data.timeZone}
              />
            </dl>
          </section>

          {empty ? (
            <Card title="No spend in this range">
              <Empty>
                Nothing was charged between {data.from.slice(0, 10)} and {data.to.slice(0, 10)} in{' '}
                {data.timeZone}
                {focus ? ` for ${focus.label}` : ''}. Widen the range or clear the user filter.
              </Empty>
            </Card>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card
                  title="By month"
                  hint="Calendar months in the selected time zone, oldest first."
                >
                  <BarList
                    slices={monthSlices}
                    total={data.totals.credits}
                    emptyLabel="No month in this range carries any spend."
                  />
                </Card>

                <Card
                  title="By role"
                  hint="Spend and distinct spenders per role — the number a tier budget is set against."
                >
                  <BarList
                    slices={roleSlices}
                    total={data.totals.credits}
                    emptyLabel="No role carries any spend in this range."
                  />
                </Card>
              </div>

              <Card title="By model" hint="Where the money actually goes.">
                <BarList
                  slices={modelSlices}
                  total={data.totals.credits}
                  emptyLabel="No model carries any spend in this range."
                />
              </Card>

              <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-3 py-2">
                  <h2 className="text-base font-semibold text-slate-900">Top spenders</h2>
                  <p className="text-sm text-slate-600">
                    Biggest spenders first, totalled over the whole range on the server. Drill in to
                    reload every panel for that one person.
                  </p>
                </div>
                {spenders.length >= USAGE_MAX_USERS ? (
                  <div className="p-3">
                    <InfoNote>
                      This list stops at the {count.format(USAGE_MAX_USERS)} highest spenders. Every
                      figure in it is that user&rsquo;s exact spend for the whole range — the cap
                      leaves people out, it never shrinks a number.
                    </InfoNote>
                  </div>
                ) : null}
                <SpendersTable
                  spenders={spenders}
                  focusedId={focus?.userId}
                  emptyLabel="No user spent anything in this range."
                  onFocus={handleFocus}
                />
              </section>

              <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-3 py-2">
                  <h2 className="text-base font-semibold text-slate-900">
                    User, model and month detail
                  </h2>
                  <p className="text-sm text-slate-600">
                    Every bucket behind the numbers above, biggest spend first.
                  </p>
                </div>
                {data.rowsCapped ? (
                  <div className="p-3">
                    <WarningNote>
                      More than {count.format(data.rowLimit)} user/model/month buckets matched, so
                      this table covers only the {count.format(data.rowLimit)} highest-spend ones.
                      The totals, the breakdowns and the spender list above still cover the whole
                      range.
                    </WarningNote>
                  </div>
                ) : null}
                <RowsTable
                  rows={data.rows}
                  emptyLabel="No user/model/month bucket carries any spend in this range."
                />
              </section>
            </>
          )}
        </>
      ) : null}
    </div>
  );
};
