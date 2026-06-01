import { memo, useMemo, useState } from 'react';
import { Spinner } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { useAdminUsageQuery } from '~/data-provider';

function formatTokens(value: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value);
}

function formatUSD(valueInCredits: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valueInCredits / 1_000_000);
}

type TabKey = 'analytics' | 'thresholds';

type BUFilter = 'all' | 'POP' | 'BETC' | 'Other';

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

function Usage() {
  const localize = useLocalize();
  const { data, isLoading, isError } = useAdminUsageQuery();
  const [activeTab, setActiveTab] = useState<TabKey>('analytics');
  const [activeBU, setActiveBU] = useState<BUFilter>('all');

  const rows = data?.rows ?? [];
  const { filteredRows, totals, segments } = useMemo(() => {
    const filtered = rows.filter((row) => {
      if (activeBU === 'all') {
        return true;
      }
      if (activeBU === 'Other') {
        return row.bu === null;
      }
      return row.bu === activeBU;
    });
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

      {activeTab === 'analytics' && (
        <>
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

      {activeTab === 'thresholds' && (
        <div className="rounded-lg border border-border-light p-12 text-center">
          <p className="text-sm text-text-secondary">
            {localize('com_usage_thresholds_placeholder')}
          </p>
          <p className="mt-2 text-xs text-text-tertiary">
            {localize('com_usage_thresholds_coming_soon')}
          </p>
        </div>
      )}
    </div>
  );
}

export default memo(Usage);