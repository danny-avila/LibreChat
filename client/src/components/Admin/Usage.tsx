import { memo, useMemo, useState } from 'react';
import { Spinner, useToastContext } from '@librechat/client';
import type { AdminBudgetRow } from 'librechat-data-provider';
import {
  useAdminUsageQuery,
  useAdminBudgetsQuery,
  useResetMonthBudgetsMutation,
} from '~/data-provider';
import { NotificationSeverity } from '~/common';
import EditBudgetModal from './EditBudgetModal';
import { useLocalize } from '~/hooks';
import { formatUSD } from './credits';

function formatTokens(value: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value);
}

/** Whole days from now until the 1st of next month (UTC). */
function daysUntilNextMonth(): number {
  const now = new Date();
  const firstOfNextMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((firstOfNextMonth - now.getTime()) / msPerDay);
}

type TabKey = 'analytics' | 'thresholds';

type BUFilter = 'all' | 'POP' | 'BETC' | 'Other';

function matchesBuFilter(bu: string | null, filter: BUFilter): boolean {
  if (filter === 'all') {
    return true;
  }
  if (filter === 'Other') {
    return bu === null;
  }
  return bu === filter;
}

const BU_FILTERS = [
  { key: 'all', labelKey: 'com_usage_filter_all' },
  { key: 'POP', labelKey: 'com_usage_filter_bu_pop' },
  { key: 'BETC', labelKey: 'com_usage_filter_bu_betc' },
  { key: 'Other', labelKey: 'com_usage_filter_bu_other' },
] as const;

const USER_SEGMENTS = [
  { key: 'power', labelKey: 'com_usage_segment_power', rangeKey: 'com_usage_segment_power_range' },
  {
    key: 'regular',
    labelKey: 'com_usage_segment_regular',
    rangeKey: 'com_usage_segment_regular_range',
  },
  {
    key: 'occasional',
    labelKey: 'com_usage_segment_occasional',
    rangeKey: 'com_usage_segment_occasional_range',
  },
  { key: 'light', labelKey: 'com_usage_segment_light', rangeKey: 'com_usage_segment_light_range' },
] as const;

function BuBadge({ bu }: { bu: string | null }) {
  const localize = useLocalize();
  const config =
    bu === 'POP'
      ? { className: 'bg-blue-500/15 text-blue-300', label: localize('com_usage_filter_bu_pop') }
      : bu === 'BETC'
        ? { className: 'bg-pink-500/15 text-pink-300', label: localize('com_usage_filter_bu_betc') }
        : { className: 'bg-gray-500/15 text-gray-300', label: localize('com_usage_filter_bu_other') };
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}

function KpiCard({
  label,
  value,
  sublabel,
  muted,
}: {
  label: string;
  value: string;
  sublabel?: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-lg bg-surface-secondary p-4">
      <p className="text-sm text-text-secondary">{label}</p>
      <p className="text-2xl font-semibold text-text-primary">{value}</p>
      {sublabel && (
        <p className={`text-xs text-text-tertiary${muted ? ' opacity-70' : ''}`}>{sublabel}</p>
      )}
    </div>
  );
}

/** Spend-vs-budget progress bar: green <60%, amber 60–80%, red >80%. */
function BudgetProgress({ spent, budget }: { spent: number; budget: number }) {
  const ratio = budget > 0 ? spent / budget : spent > 0 ? 1 : 0;
  const percent = Math.min(100, Math.round(ratio * 100));
  const color = ratio > 0.8 ? 'bg-red-500' : ratio >= 0.6 ? 'bg-amber-500' : 'bg-green-500';
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-surface-tertiary">
        <div className={`h-full ${color}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="w-10 text-right text-xs tabular-nums text-text-secondary">{percent}%</span>
    </div>
  );
}

function Usage() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { data, isLoading, isError } = useAdminUsageQuery();
  const { data: budgetData, isLoading: isBudgetLoading } = useAdminBudgetsQuery();
  const resetMonthMutation = useResetMonthBudgetsMutation();
  const [activeTab, setActiveTab] = useState<TabKey>('analytics');
  const [activeBU, setActiveBU] = useState<BUFilter>('all');
  const [editingRow, setEditingRow] = useState<AdminBudgetRow | null>(null);

  const rows = data?.rows ?? [];
  const { filteredRows, totals, segments } = useMemo(() => {
    const filtered = rows.filter((row) => matchesBuFilter(row.bu, activeBU));
    const aggregated = filtered.reduce(
      (acc, row) => {
        acc.tokens += row.totalTokens;
        acc.credits += row.totalCredits;
        acc.messages += row.messageCount;
        if (row.messageCount > 100) {
          acc.segments.power += 1;
        } else if (row.messageCount >= 30) {
          acc.segments.regular += 1;
        } else if (row.messageCount >= 10) {
          acc.segments.occasional += 1;
        } else if (row.messageCount >= 1) {
          acc.segments.light += 1;
        }
        return acc;
      },
      {
        tokens: 0,
        credits: 0,
        messages: 0,
        segments: { power: 0, regular: 0, occasional: 0, light: 0 },
      },
    );
    return {
      filteredRows: filtered,
      totals: aggregated,
      segments: aggregated.segments,
    };
  }, [rows, activeBU]);

  const { filteredBudgetRows, budgetTotals } = useMemo(() => {
    const source = budgetData?.rows ?? [];
    const filtered = source.filter((row) => matchesBuFilter(row.bu, activeBU));
    const aggregated = filtered.reduce(
      (acc, row) => {
        acc.totalBudget += row.monthlyBudget;
        acc.totalSpent += row.currentMonthSpend;
        if (row.currentMonthSpend > 0.8 * row.monthlyBudget) {
          acc.usersOver80Percent += 1;
        }
        return acc;
      },
      { totalBudget: 0, totalSpent: 0, totalRemaining: 0, usersOver80Percent: 0 },
    );
    aggregated.totalRemaining = aggregated.totalBudget - aggregated.totalSpent;
    return { filteredBudgetRows: filtered, budgetTotals: aggregated };
  }, [budgetData?.rows, activeBU]);

  const handleResetMonth = () => {
    if (!window.confirm(localize('com_budget_reset_confirm'))) {
      return;
    }
    resetMonthMutation.mutate(undefined, {
      onSuccess: () =>
        showToast({
          message: localize('com_budget_reset_success'),
          severity: NotificationSeverity.SUCCESS,
        }),
      onError: () =>
        showToast({
          message: localize('com_budget_reset_error'),
          severity: NotificationSeverity.ERROR,
        }),
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center text-text-secondary">
        <Spinner />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full w-full items-center justify-center text-text-secondary">
        {localize('com_usage_error')}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-y-auto bg-surface-primary px-8 py-6">
      <header>
        <h1 className="text-2xl font-semibold text-text-primary">
          {localize('com_usage_title')}
        </h1>
        <p className="text-sm text-text-secondary">{localize('com_usage_subtitle')}</p>
      </header>

      <div className="flex gap-1 border-b border-border-light">
        <button
          type="button"
          onClick={() => setActiveTab('analytics')}
          className={`-mb-px border-b-2 px-4 py-2 text-sm transition-colors ${
            activeTab === 'analytics'
              ? 'border-text-primary font-medium text-text-primary'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          {localize('com_usage_tab_analytics')}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('thresholds')}
          className={`-mb-px border-b-2 px-4 py-2 text-sm transition-colors ${
            activeTab === 'thresholds'
              ? 'border-text-primary font-medium text-text-primary'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          {localize('com_usage_tab_thresholds')}
        </button>
      </div>

      <div className="flex gap-2">
        {BU_FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => setActiveBU(filter.key)}
            className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
              activeBU === filter.key
                ? 'bg-surface-tertiary text-text-primary'
                : 'text-text-secondary hover:bg-surface-secondary'
            }`}
          >
            {localize(filter.labelKey)}
          </button>
        ))}
      </div>

      {activeTab === 'analytics' && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard
              label={localize('com_usage_kpi_users')}
              value={formatTokens(filteredRows.length)}
              sublabel={localize('com_usage_kpi_this_month')}
            />
            <KpiCard
              label={localize('com_usage_kpi_tokens')}
              value={formatTokens(totals.tokens)}
              sublabel={localize('com_usage_kpi_this_month')}
            />
            <KpiCard
              label={localize('com_usage_kpi_credits')}
              value={formatUSD(totals.credits)}
              sublabel={localize('com_usage_kpi_this_month')}
            />
            <KpiCard
              label={localize('com_usage_kpi_messages')}
              value={formatTokens(totals.messages)}
              sublabel={localize('com_usage_kpi_this_month')}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {USER_SEGMENTS.map((segment) => (
              <KpiCard
                key={segment.key}
                label={localize(segment.labelKey)}
                value={formatTokens(segments[segment.key])}
                sublabel={localize(segment.rangeKey)}
                muted
              />
            ))}
          </div>
          {filteredRows.length === 0 ? (
            <div className="rounded-lg border border-border-light p-8 text-center text-text-secondary">
              {localize('com_usage_empty')}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border-light">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-surface-secondary text-text-secondary">
                  <tr>
                    <th className="px-4 py-3 font-medium">{localize('com_usage_col_user')}</th>
                    <th className="px-4 py-3 font-medium">{localize('com_usage_col_email')}</th>
                    <th className="px-4 py-3 font-medium">{localize('com_usage_col_bu')}</th>
                    <th className="px-4 py-3 text-right font-medium">
                      {localize('com_usage_col_tokens')}
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      {localize('com_usage_col_credits')}
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      {localize('com_usage_col_messages')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.user} className="border-t border-border-light text-text-primary">
                      <td className="px-4 py-3">{row.name ?? '—'}</td>
                      <td className="px-4 py-3 text-text-secondary">{row.email ?? '—'}</td>
                      <td className="px-4 py-3">
                        <BuBadge bu={row.bu} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatTokens(row.totalTokens)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatUSD(row.totalCredits)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.messageCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {activeTab === 'thresholds' &&
        (isBudgetLoading ? (
          <div className="flex w-full items-center justify-center py-12 text-text-secondary">
            <Spinner />
          </div>
        ) : (
          <>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleResetMonth}
                disabled={resetMonthMutation.isLoading}
                className="rounded-md bg-surface-tertiary px-3 py-1.5 text-xs text-text-primary transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {localize('com_budget_reset_button')}
              </button>
            </div>

            {budgetTotals.usersOver80Percent > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                {localize('com_budget_alert_over_threshold', {
                  count: budgetTotals.usersOver80Percent,
                })}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <KpiCard
                label={localize('com_budget_kpi_total')}
                value={formatUSD(budgetTotals.totalBudget)}
                sublabel={localize('com_usage_kpi_this_month')}
              />
              <KpiCard
                label={localize('com_budget_kpi_spent')}
                value={formatUSD(budgetTotals.totalSpent)}
                sublabel={localize('com_usage_kpi_this_month')}
              />
              <KpiCard
                label={localize('com_budget_kpi_remaining')}
                value={formatUSD(budgetTotals.totalRemaining)}
                sublabel={localize('com_usage_kpi_this_month')}
              />
              <KpiCard
                label={localize('com_budget_kpi_reset')}
                value={formatTokens(daysUntilNextMonth())}
                sublabel={localize('com_budget_kpi_reset_days')}
              />
            </div>

            {filteredBudgetRows.length === 0 ? (
              <div className="rounded-lg border border-border-light p-8 text-center text-text-secondary">
                {localize('com_budget_empty')}
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border-light">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="bg-surface-secondary text-text-secondary">
                    <tr>
                      <th className="px-4 py-3 font-medium">{localize('com_usage_col_user')}</th>
                      <th className="px-4 py-3 font-medium">{localize('com_usage_col_bu')}</th>
                      <th className="px-4 py-3 text-right font-medium">
                        {localize('com_budget_col_spent')}
                      </th>
                      <th className="px-4 py-3 text-right font-medium">
                        {localize('com_budget_col_threshold')}
                      </th>
                      <th className="px-4 py-3 font-medium">
                        {localize('com_budget_col_progress')}
                      </th>
                      <th className="px-4 py-3 text-right font-medium">
                        {localize('com_budget_col_action')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBudgetRows.map((row) => (
                      <tr key={row.user} className="border-t border-border-light text-text-primary">
                        <td className="px-4 py-3">
                          <div>{row.name ?? '—'}</div>
                          <div className="text-xs text-text-secondary">{row.email ?? '—'}</div>
                        </td>
                        <td className="px-4 py-3">
                          <BuBadge bu={row.bu} />
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatUSD(row.currentMonthSpend)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatUSD(row.monthlyBudget)}
                        </td>
                        <td className="px-4 py-3">
                          <BudgetProgress spent={row.currentMonthSpend} budget={row.monthlyBudget} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setEditingRow(row)}
                            className="rounded-md px-3 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
                          >
                            {localize('com_budget_action_edit')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ))}

      <EditBudgetModal row={editingRow} onClose={() => setEditingRow(null)} />
    </div>
  );
}

export default memo(Usage);
