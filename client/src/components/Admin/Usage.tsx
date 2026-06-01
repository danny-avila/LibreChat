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

function KpiCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="rounded-lg bg-surface-secondary p-4">
      <p className="text-sm text-text-secondary">{label}</p>
      <p className="text-2xl font-semibold text-text-primary">{value}</p>
      {sublabel && <p className="text-xs text-text-tertiary">{sublabel}</p>}
    </div>
  );
}

function Usage() {
  const localize = useLocalize();
  const { data, isLoading, isError } = useAdminUsageQuery();
  const [activeTab, setActiveTab] = useState<TabKey>('analytics');

  const rows = data?.rows ?? [];
  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => {
          acc.tokens += row.totalTokens;
          acc.credits += row.totalCredits;
          acc.messages += row.messageCount;
          return acc;
        },
        { tokens: 0, credits: 0, messages: 0 },
      ),
    [rows],
  );

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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard
              label={localize('com_usage_kpi_users')}
              value={formatTokens(rows.length)}
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
          {rows.length === 0 ? (
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
                  {rows.map((row) => (
                    <tr key={row.user} className="border-t border-border-light text-text-primary">
                      <td className="px-4 py-3">{row.name ?? '—'}</td>
                      <td className="px-4 py-3 text-text-secondary">{row.email ?? '—'}</td>
                      <td className="px-4 py-3 text-text-secondary">{row.bu ?? '—'}</td>
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