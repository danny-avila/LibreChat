import { memo, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Spinner, useToastContext } from '@librechat/client';
import type {
  BUFilter,
  AnalyticsPeriod,
  AdminUsageRow,
  AdminBudgetRow,
  ModelUsageRow,
} from 'librechat-data-provider';
import {
  useAdminUsageQuery,
  useAdminBudgetsQuery,
  useAdminModelUsageQuery,
  useAdminKpisQuery,
  useResetMonthBudgetsMutation,
} from '~/data-provider';
import { NotificationSeverity } from '~/common';
import EditBudgetModal from './EditBudgetModal';
import PeriodSelector from './PeriodSelector';
import { useLocalize } from '~/hooks';
import { formatUSD, creditsToUsdInput, budgetColor } from './credits';

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

/** Current month as YYYY-MM (UTC), for export filenames. */
function currentMonthYYYYMM(): string {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${now.getUTCFullYear()}-${month}`;
}

/** Wraps a CSV field in quotes (doubling inner quotes) when it contains a comma, quote, or newline. */
function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Builds a UTF-8 (BOM) CSV of the given user rows. Numbers are raw; USD is 2 decimals, no symbol. */
function buildUsersCsv(rows: AdminUsageRow[]): string {
  const header = ['User', 'Email', 'BU', 'Tokens', 'USD consumed', 'Messages'];
  const lines = [header.join(',')];
  for (const row of rows) {
    const cells = [
      row.name ?? '',
      row.email ?? '',
      row.bu ?? 'Other',
      String(row.totalTokens),
      creditsToUsdInput(row.totalCredits),
      String(row.messageCount),
    ];
    lines.push(cells.map(csvEscape).join(','));
  }
  return '\uFEFF' + lines.join('\r\n');
}

/** Triggers a client-side download of CSV content with no dependency. */
function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

type TabKey = 'analytics' | 'thresholds';

/** Default selected period: the current month (label resolved at display time). */
const CURRENT_MONTH_PERIOD: AnalyticsPeriod = {
  key: 'current-month',
  label: '',
  start: null,
  end: null,
};

/** KPI sublabel reflecting the selected period: localized for current-month/overall, else the month label. */
function getSubLabel(period: AnalyticsPeriod, localize: ReturnType<typeof useLocalize>): string {
  if (period.key === 'current-month') {
    return localize('com_usage_kpi_sublabel_current_month');
  }
  if (period.key === 'overall') {
    return localize('com_usage_kpi_sublabel_all_time');
  }
  return period.label;
}

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
  const { bar } = budgetColor(ratio);
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-surface-tertiary">
        <div className={`h-full ${bar}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="w-10 text-right text-xs tabular-nums text-text-secondary">{percent}%</span>
    </div>
  );
}

/** Categorical palette for the Model Mix donut — fixed shades readable in dark mode. */
const MODEL_PALETTE = ['#E5384A', '#3B82F6', '#EC4899', '#10B981', '#F59E0B', '#8B5CF6'];
const MODEL_OTHER_COLOR = '#9CA3AF';
const DONUT_TOP_N = 6;

interface DonutSegment {
  label: string;
  share: number;
  color: string;
  offset: number;
}

/** Builds donut segments: top N models by spend + an aggregated "Other" slice. */
function buildDonutSegments(rows: ModelUsageRow[], otherLabel: string): DonutSegment[] {
  const total = rows.reduce((sum, row) => sum + row.totalCredits, 0);
  if (total <= 0) {
    return [];
  }
  const slices = rows.slice(0, DONUT_TOP_N).map((row, index) => ({
    label: row.model,
    credits: row.totalCredits,
    color: MODEL_PALETTE[index % MODEL_PALETTE.length],
  }));
  const restCredits = rows.slice(DONUT_TOP_N).reduce((sum, row) => sum + row.totalCredits, 0);
  if (restCredits > 0) {
    slices.push({ label: otherLabel, credits: restCredits, color: MODEL_OTHER_COLOR });
  }
  const segments: DonutSegment[] = [];
  let offset = 0;
  for (const slice of slices) {
    const share = slice.credits / total;
    segments.push({ label: slice.label, share, color: slice.color, offset });
    offset += share;
  }
  return segments;
}

function ModelDonut({ segments }: { segments: DonutSegment[] }) {
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg viewBox="0 0 160 160" className="h-40 w-40" role="img" aria-hidden="true">
      <g transform="rotate(-90 80 80)">
        {segments.map((seg) => {
          const length = seg.share * circumference;
          return (
            <circle
              key={seg.label}
              cx={80}
              cy={80}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={22}
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-(seg.offset * circumference)}
            />
          );
        })}
      </g>
    </svg>
  );
}

/** Model Mix section: spend-share donut (top 6 + Other) + full per-model table. */
function ModelMixSection({
  rows,
  isLoading,
  caption,
}: {
  rows: ModelUsageRow[];
  isLoading: boolean;
  caption: string;
}) {
  const localize = useLocalize();
  const totalCredits = rows.reduce((sum, row) => sum + row.totalCredits, 0);
  const segments = buildDonutSegments(rows, localize('com_usage_model_other'));

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">
          {localize('com_usage_model_title')}
        </h2>
        <p className="text-xs text-text-tertiary">{caption}</p>
      </div>

      {isLoading ? (
        <div className="flex w-full items-center justify-center py-12 text-text-secondary">
          <Spinner />
        </div>
      ) : rows.length === 0 || totalCredits <= 0 ? (
        <div className="rounded-lg border border-border-light p-8 text-center text-text-secondary">
          {localize('com_usage_model_empty')}
        </div>
      ) : (
        <div className="flex flex-col gap-6 md:flex-row">
          <div className="flex flex-col items-center gap-4 md:w-1/3">
            <ModelDonut segments={segments} />
            <ul className="w-full space-y-1.5">
              {segments.map((seg) => (
                <li key={seg.label} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: seg.color }}
                  />
                  <span className="flex-1 truncate text-text-primary" title={seg.label}>
                    {seg.label}
                  </span>
                  <span className="tabular-nums text-text-secondary">
                    {(seg.share * 100).toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex-1 overflow-hidden rounded-lg border border-border-light">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-surface-secondary text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-medium">{localize('com_usage_model_col_model')}</th>
                  <th className="px-4 py-3 text-right font-medium">
                    {localize('com_usage_col_messages')}
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    {localize('com_usage_model_col_total')}
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    {localize('com_usage_model_col_avg')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.model} className="border-t border-border-light text-text-primary">
                    <td className="px-4 py-3">{row.model}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatTokens(row.messageCount)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatUSD(row.totalCredits)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatUSD(row.avgCreditsPerMessage)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function Usage() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [activeTab, setActiveTab] = useState<TabKey>('analytics');
  const [activeBU, setActiveBU] = useState<BUFilter>('all');
  const [period, setPeriod] = useState<AnalyticsPeriod>(CURRENT_MONTH_PERIOD);

  const { data, isLoading, isError } = useAdminUsageQuery({ period, bu: activeBU });
  const { data: budgetData, isLoading: isBudgetLoading } = useAdminBudgetsQuery();
  const { data: modelData, isLoading: isModelLoading } = useAdminModelUsageQuery({
    period,
    bu: activeBU,
  });
  const { data: kpisData } = useAdminKpisQuery({ period, bu: activeBU });
  const resetMonthMutation = useResetMonthBudgetsMutation();
  const [editingRow, setEditingRow] = useState<AdminBudgetRow | null>(null);
  const [isUserDetailsOpen, setIsUserDetailsOpen] = useState(false);

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

  const periodSubLabel = getSubLabel(period, localize);
  const modelMixCaption =
    activeBU === 'all'
      ? `${localize('com_usage_model_caption')}, ${periodSubLabel}`
      : `${activeBU}, ${periodSubLabel}`;

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

  const handleExportCsv = () => {
    const filename = `vermeer-users-${activeBU.toLowerCase()}-${currentMonthYYYYMM()}.csv`;
    downloadCsv(filename, buildUsersCsv(filteredRows));
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
    <div className="flex h-full w-full flex-col gap-4 overflow-y-auto bg-surface-primary px-8 py-6 min-h-0 [&>*]:shrink-0">
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

      <div className="flex flex-wrap items-center gap-3">
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
        {activeTab === 'analytics' && <PeriodSelector value={period} onChange={setPeriod} />}
      </div>

      {activeTab === 'analytics' && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard
              label={localize('com_usage_kpi_users')}
              value={formatTokens(filteredRows.length)}
              sublabel={periodSubLabel}
            />
            <KpiCard
              label={localize('com_usage_kpi_tokens')}
              value={formatTokens(totals.tokens)}
              sublabel={periodSubLabel}
            />
            <KpiCard
              label={localize('com_usage_kpi_credits')}
              value={formatUSD(totals.credits)}
              sublabel={periodSubLabel}
            />
            <KpiCard
              label={localize('com_usage_kpi_messages')}
              value={formatTokens(totals.messages)}
              sublabel={periodSubLabel}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <KpiCard
              label={localize('com_usage_kpi_avg_cost_per_conversation')}
              value={kpisData ? formatUSD(kpisData.stats.avgCostPerConversation) : '—'}
              sublabel={periodSubLabel}
            />
            <KpiCard
              label={localize('com_usage_kpi_avg_conversations_per_user')}
              value={kpisData ? kpisData.stats.avgConversationsPerActiveUser.toFixed(1) : '—'}
              sublabel={periodSubLabel}
            />
            <KpiCard
              label={localize('com_usage_kpi_agents_created')}
              value={kpisData ? kpisData.stats.agentsCreated.toString() : '—'}
              sublabel={periodSubLabel}
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
          <ModelMixSection
            rows={modelData?.rows ?? []}
            isLoading={isModelLoading}
            caption={modelMixCaption}
          />

          <div className="overflow-hidden rounded-lg border border-border-light">
            <div
              role="button"
              tabIndex={0}
              aria-expanded={isUserDetailsOpen}
              onClick={() => setIsUserDetailsOpen((open) => !open)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setIsUserDetailsOpen((open) => !open);
                }
              }}
              className="flex cursor-pointer items-center gap-2 bg-surface-secondary px-4 py-3 text-sm font-medium text-text-primary"
            >
              <ChevronDown
                className={`h-4 w-4 shrink-0 transition-transform ${
                  isUserDetailsOpen ? '' : '-rotate-90'
                }`}
              />
              <span className="flex-1">
                {localize('com_usage_user_details', { count: filteredRows.length })}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleExportCsv();
                }}
                disabled={filteredRows.length === 0}
                className="rounded-md px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary disabled:opacity-50"
              >
                {localize('com_usage_export_csv')}
              </button>
            </div>
            {isUserDetailsOpen &&
              (filteredRows.length === 0 ? (
                <div className="border-t border-border-light p-8 text-center text-text-secondary">
                  {localize('com_usage_empty')}
                </div>
              ) : (
                <div className="overflow-x-auto border-t border-border-light">
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
                        <tr
                          key={row.user}
                          className="border-t border-border-light text-text-primary"
                        >
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
              ))}
          </div>
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
              <div className="rounded-lg border border-border-light p-8 text-center">
                <p className="text-text-secondary">{localize('com_budget_empty')}</p>
                <p className="mt-1 text-xs text-text-tertiary">
                  {localize(
                    (budgetData?.rows?.length ?? 0) === 0
                      ? 'com_budget_empty_tracking'
                      : 'com_budget_empty_filter',
                  )}
                </p>
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
