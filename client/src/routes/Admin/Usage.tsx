/* eslint-disable i18next/no-literal-string */
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import type {
  AdminOrgUsageRange,
  AdminTransactionItem,
  AdminTransactionsParams,
  AdminUsageBucket,
} from 'librechat-data-provider';
import {
  useAdminOrgUsage,
  useAdminTransactions,
  useAdminUsageOverview,
} from '~/data-provider/Admin';

/* ---------- helpers ---------- */

function formatNumber(n: number | string | undefined | null): string {
  if (n == null) return '—';
  if (typeof n === 'string') return n;
  return new Intl.NumberFormat().format(n);
}

function formatTimestamp(d: Date | null | undefined): string {
  if (!d) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDateTime(input: string | undefined | null): string {
  if (!input) return '—';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortDate(input: string | undefined | null): string {
  if (!input) return '—';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/* ---------- KPI card ---------- */

type KpiCardProps = {
  title: string;
  value: number | string;
  subtitle?: string;
  loading?: boolean;
};

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

/* ---------- Org usage trend ---------- */

type TrendBarsProps = {
  byDay: AdminUsageBucket[];
  loading: boolean;
};

function TrendBars({ byDay, loading }: TrendBarsProps) {
  const max = useMemo(
    () => byDay.reduce((acc, b) => Math.max(acc, b.totalTokens || 0), 0),
    [byDay],
  );

  if (loading) {
    return (
      <div className="space-y-1.5" aria-busy="true">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-5 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
        ))}
      </div>
    );
  }

  if (byDay.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
        No usage data in this range.
      </div>
    );
  }

  return (
    <ul className="space-y-1" aria-label="Daily token usage">
      {byDay.map((row) => {
        const total = row.totalTokens || 0;
        const promptPct = max > 0 ? Math.max(0, ((row.prompt || 0) / max) * 100) : 0;
        const completionPct = max > 0 ? Math.max(0, ((row.completion || 0) / max) * 100) : 0;
        const title = `${row.date}: prompt ${formatNumber(row.prompt)}, completion ${formatNumber(
          row.completion,
        )}, total ${formatNumber(total)}`;
        return (
          <li key={row.date} className="flex items-center gap-3 text-xs" title={title}>
            <span className="w-14 shrink-0 tabular-nums text-gray-500 dark:text-gray-400">
              {formatShortDate(row.date)}
            </span>
            <div className="relative flex h-4 flex-1 overflow-hidden rounded bg-gray-100 dark:bg-gray-800">
              <div
                className="h-full bg-blue-500/80 dark:bg-blue-500/70"
                style={{ width: `${promptPct}%` }}
                aria-hidden="true"
              />
              <div
                className="h-full bg-emerald-500/80 dark:bg-emerald-500/70"
                style={{ width: `${completionPct}%` }}
                aria-hidden="true"
              />
            </div>
            <span className="w-24 shrink-0 text-right font-medium tabular-nums text-gray-700 dark:text-gray-200">
              {formatNumber(total)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- transactions table ---------- */

type TxFilters = {
  userId: string;
  from: string;
  to: string;
  tokenType: string;
  model: string;
  page: number;
  limit: number;
};

const DEFAULT_FILTERS: TxFilters = {
  userId: '',
  from: '',
  to: '',
  tokenType: '',
  model: '',
  page: 1,
  limit: 50,
};

const TOKEN_TYPES = [
  { value: '', label: 'All token types' },
  { value: 'prompt', label: 'Prompt' },
  { value: 'completion', label: 'Completion' },
  { value: 'credits', label: 'Credits' },
];

const LIMITS = [25, 50, 100, 200];

function paramsFromSearch(searchParams: URLSearchParams): TxFilters {
  const limitRaw = Number(searchParams.get('limit'));
  const pageRaw = Number(searchParams.get('page'));
  return {
    userId: searchParams.get('userId') ?? '',
    from: searchParams.get('from') ?? '',
    to: searchParams.get('to') ?? '',
    tokenType: searchParams.get('tokenType') ?? '',
    model: searchParams.get('model') ?? '',
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
    limit: LIMITS.includes(limitRaw) ? limitRaw : 50,
  };
}

function searchFromParams(filters: TxFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.userId) params.set('userId', filters.userId);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.tokenType) params.set('tokenType', filters.tokenType);
  if (filters.model) params.set('model', filters.model);
  if (filters.page !== 1) params.set('page', String(filters.page));
  if (filters.limit !== 50) params.set('limit', String(filters.limit));
  return params;
}

function TransactionsSection() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => paramsFromSearch(searchParams), [searchParams]);

  // local input mirror for debounced fields
  const [userIdInput, setUserIdInput] = useState(filters.userId);
  const [modelInput, setModelInput] = useState(filters.model);

  // keep local mirrors in sync if URL changes externally
  useEffect(() => {
    setUserIdInput(filters.userId);
  }, [filters.userId]);
  useEffect(() => {
    setModelInput(filters.model);
  }, [filters.model]);

  const debouncedUserId = useDebouncedValue(userIdInput, 300);
  const debouncedModel = useDebouncedValue(modelInput, 300);

  // push debounced values into URL when they change
  useEffect(() => {
    if (debouncedUserId === filters.userId && debouncedModel === filters.model) return;
    const next = searchFromParams({
      ...filters,
      userId: debouncedUserId,
      model: debouncedModel,
      page: 1,
    });
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedUserId, debouncedModel]);

  const updateFilters = (patch: Partial<TxFilters>) => {
    const next = searchFromParams({ ...filters, ...patch });
    setSearchParams(next, { replace: false });
  };

  const queryParams: AdminTransactionsParams = {
    userId: filters.userId || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    tokenType: filters.tokenType || undefined,
    model: filters.model || undefined,
    page: filters.page,
    limit: filters.limit,
  };

  const { data, isLoading, isFetching, isError, error, refetch } =
    useAdminTransactions(queryParams);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / filters.limit));

  const columns = useMemo<ColumnDef<AdminTransactionItem>[]>(
    () => [
      {
        id: 'createdAt',
        header: 'Created',
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular-nums text-gray-700 dark:text-gray-200">
            {formatDateTime(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: 'user',
        header: 'User',
        cell: ({ row }) => {
          const userId = row.original.user;
          if (!userId) {
            return <span className="text-gray-400">—</span>;
          }
          return (
            <Link
              to={`/admin/users/${userId}`}
              className="font-mono text-xs text-blue-600 hover:underline dark:text-blue-400"
              title={userId}
            >
              {userId.slice(0, 8)}…
            </Link>
          );
        },
      },
      {
        id: 'model',
        header: 'Model',
        cell: ({ row }) => (
          <span className="text-gray-700 dark:text-gray-200">{row.original.model ?? '—'}</span>
        ),
      },
      {
        id: 'tokenType',
        header: 'Token type',
        cell: ({ row }) => {
          const t = row.original.tokenType;
          if (!t) return <span className="text-gray-400">—</span>;
          return (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">
              {t}
            </span>
          );
        },
      },
      {
        id: 'rawAmount',
        header: 'Tokens',
        cell: ({ row }) => (
          <span className="tabular-nums text-gray-700 dark:text-gray-200">
            {row.original.rawAmount != null ? formatNumber(row.original.rawAmount) : '—'}
          </span>
        ),
      },
      {
        id: 'context',
        header: 'Context',
        cell: ({ row }) => (
          <span className="text-gray-500 dark:text-gray-400">{row.original.context ?? '—'}</span>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const hasFilters = !!(
    filters.userId ||
    filters.from ||
    filters.to ||
    filters.tokenType ||
    filters.model
  );

  return (
    <section
      className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"
      aria-label="Transactions"
    >
      <header className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">Transactions</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Token-credit ledger entries</p>
        </div>
        <div className="flex items-center gap-2">
          {isFetching ? (
            <RefreshCw className="h-4 w-4 animate-spin text-gray-400" aria-hidden="true" />
          ) : null}
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {formatNumber(total)} total
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800 sm:grid-cols-2 lg:grid-cols-6">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
          <span>User ID</span>
          <input
            type="text"
            placeholder="ObjectId"
            value={userIdInput}
            onChange={(e) => setUserIdInput(e.target.value)}
            className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
          <span>From</span>
          <input
            type="date"
            value={filters.from}
            onChange={(e) => updateFilters({ from: e.target.value, page: 1 })}
            className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
          <span>To</span>
          <input
            type="date"
            value={filters.to}
            onChange={(e) => updateFilters({ to: e.target.value, page: 1 })}
            className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
          <span>Token type</span>
          <select
            value={filters.tokenType}
            onChange={(e) => updateFilters({ tokenType: e.target.value, page: 1 })}
            className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
          >
            {TOKEN_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
          <span>Model</span>
          <input
            type="text"
            placeholder="e.g. gpt-4o"
            value={modelInput}
            onChange={(e) => setModelInput(e.target.value)}
            className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
          <span>Per page</span>
          <select
            value={filters.limit}
            onChange={(e) => updateFilters({ limit: Number(e.target.value), page: 1 })}
            className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
          >
            {LIMITS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isError ? (
        <div
          className="m-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
          role="alert"
        >
          <div className="font-semibold">Failed to load transactions</div>
          <div className="mt-1 text-xs">
            {(error as Error | undefined)?.message ?? 'An unexpected error occurred.'}
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-2 inline-flex h-8 items-center rounded-md border border-red-300 bg-white px-3 text-xs font-medium text-red-800 hover:bg-red-50 dark:border-red-800 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900"
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr
                key={headerGroup.id}
                className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:bg-gray-900/50 dark:text-gray-400"
              >
                {headerGroup.headers.map((header) => (
                  <th key={header.id} scope="col" className="px-4 py-2 font-medium">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                  {columns.map((c, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-3 w-24 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
                    </td>
                  ))}
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  {hasFilters
                    ? 'No transactions match the current filters.'
                    : 'No transactions yet.'}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/40"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-2 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <footer className="flex items-center justify-between border-t border-gray-200 px-4 py-3 dark:border-gray-800">
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Page {filters.page} of {totalPages}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => updateFilters({ page: Math.max(1, filters.page - 1) })}
            disabled={filters.page <= 1 || isLoading}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Prev
          </button>
          <button
            type="button"
            onClick={() => updateFilters({ page: Math.min(totalPages, filters.page + 1) })}
            disabled={filters.page >= totalPages || isLoading}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            aria-label="Next page"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </footer>
    </section>
  );
}

/* ---------- Page ---------- */

export default function UsagePage() {
  const [range, setRange] = useState<AdminOrgUsageRange>('30d');

  const overviewQuery = useAdminUsageOverview();
  const orgUsageQuery = useAdminOrgUsage(range);

  const overview = overviewQuery.data;
  const orgUsage = orgUsageQuery.data;

  const lastRefreshed = overviewQuery.dataUpdatedAt ? new Date(overviewQuery.dataUpdatedAt) : null;

  const refreshAll = () => {
    void overviewQuery.refetch();
    void orgUsageQuery.refetch();
  };

  const isAnyFetching = overviewQuery.isFetching || orgUsageQuery.isFetching;

  const kpiCards: KpiCardProps[] = [
    {
      title: 'Total users',
      value: formatNumber(overview?.totalUsers),
      loading: overviewQuery.isLoading,
    },
    {
      title: 'Active (30d)',
      value: formatNumber(overview?.activeUsers30d),
      subtitle: 'Users with activity in last 30d',
      loading: overviewQuery.isLoading,
    },
    {
      title: 'Active Pro',
      value: formatNumber(overview?.activeProUsers),
      loading: overviewQuery.isLoading,
    },
    {
      title: 'Messages (30d)',
      value: formatNumber(overview?.messages30d),
      loading: overviewQuery.isLoading,
    },
    {
      title: 'Tokens (30d)',
      value: formatNumber(overview?.tokens30d),
      loading: overviewQuery.isLoading,
    },
  ];

  const byModel = orgUsage?.byModel ?? [];
  const byDay = orgUsage?.byDay ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">Usage</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Org-wide usage trends and the transaction ledger.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Last refreshed: <span className="tabular-nums">{formatTimestamp(lastRefreshed)}</span>
          </span>
          <button
            type="button"
            onClick={refreshAll}
            disabled={isAnyFetching}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
            aria-label="Refresh usage"
          >
            <RefreshCw
              className={`h-4 w-4 ${isAnyFetching ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI strip */}
      {overviewQuery.isError ? (
        <div
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
          role="alert"
        >
          <div className="font-semibold">Failed to load usage overview</div>
          <div className="mt-1 text-xs">
            {(overviewQuery.error as Error | undefined)?.message ?? 'An unexpected error occurred.'}
          </div>
          <button
            type="button"
            onClick={() => void overviewQuery.refetch()}
            className="mt-3 inline-flex h-8 items-center rounded-md border border-red-300 bg-white px-3 text-xs font-medium text-red-800 hover:bg-red-50 dark:border-red-800 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {kpiCards.map((c) => (
            <KpiCard key={c.title} {...c} />
          ))}
        </div>
      )}

      {/* Org-wide trend */}
      <section
        className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
        aria-label="Org-wide usage trend"
      >
        <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">
              Org-wide usage trend
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Daily token totals (
              <span className="inline-block h-2 w-2 rounded-sm bg-blue-500 align-middle" /> prompt
              <span className="mx-1">·</span>
              <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500 align-middle" />{' '}
              completion)
            </p>
          </div>
          <div
            className="inline-flex rounded-md border border-gray-200 bg-white p-0.5 dark:border-gray-700 dark:bg-gray-950"
            role="tablist"
            aria-label="Usage range"
          >
            {(['30d', '90d'] as const).map((r) => {
              const isActive = range === r;
              return (
                <button
                  key={r}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setRange(r)}
                  className={[
                    'h-7 rounded px-3 text-xs font-medium transition-colors',
                    isActive
                      ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                      : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800',
                  ].join(' ')}
                >
                  {r}
                </button>
              );
            })}
          </div>
        </header>

        {orgUsageQuery.isError ? (
          <div
            className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
            role="alert"
          >
            <div className="font-semibold">Failed to load usage trend</div>
            <div className="mt-1 text-xs">
              {(orgUsageQuery.error as Error | undefined)?.message ??
                'An unexpected error occurred.'}
            </div>
            <button
              type="button"
              onClick={() => void orgUsageQuery.refetch()}
              className="mt-2 inline-flex h-8 items-center rounded-md border border-red-300 bg-white px-3 text-xs font-medium text-red-800 hover:bg-red-50 dark:border-red-800 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900"
            >
              Retry
            </button>
          </div>
        ) : (
          <TrendBars byDay={byDay} loading={orgUsageQuery.isLoading} />
        )}

        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-50">
            Tokens by model
          </h3>
          <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:bg-gray-900/50 dark:text-gray-400">
                  <th scope="col" className="px-4 py-2 font-medium">
                    Model
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Prompt
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Completion
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {orgUsageQuery.isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                      {Array.from({ length: 4 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-3 w-20 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : byModel.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400"
                    >
                      No model usage in this range.
                    </td>
                  </tr>
                ) : (
                  byModel
                    .slice()
                    .sort((a, b) => (b.totalTokens || 0) - (a.totalTokens || 0))
                    .map((m) => (
                      <tr
                        key={m.model}
                        className="border-b border-gray-100 last:border-b-0 dark:border-gray-800"
                      >
                        <td className="px-4 py-2 font-medium text-gray-900 dark:text-gray-100">
                          {m.model}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-700 dark:text-gray-200">
                          {formatNumber(m.prompt)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-700 dark:text-gray-200">
                          {formatNumber(m.completion)}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold tabular-nums text-gray-900 dark:text-gray-50">
                          {formatNumber(m.totalTokens)}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Transactions */}
      <TransactionsSection />
    </div>
  );
}
