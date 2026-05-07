/* eslint-disable i18next/no-literal-string */
import { RefreshCw } from 'lucide-react';
import { useAdminOverview } from '~/data-provider/Admin';

type KpiCardProps = {
  title: string;
  value: number | string;
  subtitle?: string;
  loading?: boolean;
};

function formatNumber(n: number | string | undefined | null): string {
  if (n == null) return '—';
  if (typeof n === 'string') return n;
  return new Intl.NumberFormat().format(n);
}

function KpiCard({ title, value, subtitle, loading }: KpiCardProps) {
  return (
    <div
      className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
      role="region"
      aria-label={title}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {title}
      </div>
      {loading ? (
        <div className="mt-2 h-8 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      ) : (
        <div className="mt-2 text-3xl font-semibold tabular-nums text-gray-900 dark:text-gray-50">
          {value}
        </div>
      )}
      {subtitle ? (
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{subtitle}</div>
      ) : null}
    </div>
  );
}

function formatTimestamp(d: Date | null | undefined): string {
  if (!d) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function OverviewPage() {
  const { data, isLoading, isError, isFetching, refetch, dataUpdatedAt, error } =
    useAdminOverview();

  const lastRefreshed = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  const cards: KpiCardProps[] = [
    {
      title: 'Total users',
      value: formatNumber(data?.users.total),
      loading: isLoading,
    },
    {
      title: 'New users (7d)',
      value: formatNumber(data?.users.newLast7d),
      loading: isLoading,
    },
    {
      title: 'New users (30d)',
      value: formatNumber(data?.users.newLast30d),
      loading: isLoading,
    },
    {
      title: 'Active Pro',
      value: formatNumber(data?.subscriptions.activePro),
      loading: isLoading,
    },
    {
      title: 'Manually overridden',
      value: formatNumber(data?.subscriptions.manuallyOverridden),
      subtitle: 'Pro state set by admin override',
      loading: isLoading,
    },
    {
      title: 'Messages (30d)',
      value: formatNumber(data?.messages.total30d),
      subtitle: data ? `All-time: ${formatNumber(data.messages.totalAll)}` : undefined,
      loading: isLoading,
    },
    {
      title: 'Tokens (30d)',
      value: formatNumber(data?.tokens.total30d),
      loading: isLoading,
    },
    {
      title: 'Audit failures (30d)',
      value: formatNumber(data?.audit.failures30d),
      subtitle: data ? `${formatNumber(data.audit.total30d)} total events` : undefined,
      loading: isLoading,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">Overview</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Org-wide health and growth at a glance.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Last refreshed: <span className="tabular-nums">{formatTimestamp(lastRefreshed)}</span>
          </span>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
            aria-label="Refresh overview"
          >
            <RefreshCw
              className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            Refresh
          </button>
        </div>
      </div>

      {isError ? (
        <div
          className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
          role="alert"
        >
          <div className="font-semibold">Failed to load overview</div>
          <div className="mt-1 text-xs">
            {(error as Error | undefined)?.message ?? 'An unexpected error occurred.'}
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 inline-flex h-8 items-center rounded-md border border-red-300 bg-white px-3 text-xs font-medium text-red-800 hover:bg-red-50 dark:border-red-800 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900"
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <KpiCard key={c.title} {...c} />
        ))}
      </div>
    </div>
  );
}
