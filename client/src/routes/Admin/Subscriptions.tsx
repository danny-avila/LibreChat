/* eslint-disable i18next/no-literal-string */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  ExternalLink,
  MoreHorizontal,
  RefreshCw,
} from 'lucide-react';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
} from '@librechat/client';
import type t from 'librechat-data-provider';
import { useAdminSubscriptions } from '~/data-provider/Admin';
import { useDebounce } from '~/hooks';
import GrantProDialog from '~/components/Admin/Subscriptions/GrantProDialog';
import RevokeProDialog from '~/components/Admin/Subscriptions/RevokeProDialog';
import ClearOverrideDialog from '~/components/Admin/Subscriptions/ClearOverrideDialog';
import RefreshSubscriptionDialog from '~/components/Admin/Subscriptions/RefreshSubscriptionDialog';

/* ----------- constants ----------- */

const STORE_OPTIONS = [
  { value: '', label: 'All stores' },
  { value: 'app_store', label: 'App Store' },
  { value: 'play_store', label: 'Play Store' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'manual', label: 'Manual' },
];

const OVERRIDE_OPTIONS: Array<{ value: 'all' | 'true' | 'false'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'true', label: 'Override only' },
  { value: 'false', label: 'Natural only' },
];

const PAGE_SIZES = [25, 50, 100] as const;

const SORT_WHITELIST = ['-updatedAt', 'updatedAt', 'expiresAt', '-expiresAt'] as const;
type SortValue = (typeof SORT_WHITELIST)[number];

const DEFAULT_SORT: SortValue = '-updatedAt';
const DEFAULT_LIMIT = 50;

type DialogKind = 'grant' | 'revoke' | 'clear' | 'refresh' | null;

type DialogState = {
  kind: DialogKind;
  userId: string | null;
  email: string | null;
};

/* ----------- helpers ----------- */

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function asSortValue(input: string | null | undefined): SortValue {
  if (input && (SORT_WHITELIST as readonly string[]).includes(input)) {
    return input as SortValue;
  }
  return DEFAULT_SORT;
}

function asPageSize(input: string | null | undefined): number {
  const n = Number(input);
  return PAGE_SIZES.includes(n as (typeof PAGE_SIZES)[number]) ? n : DEFAULT_LIMIT;
}

function asPage(input: string | null | undefined): number {
  const n = Number(input);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function asOverride(input: string | null | undefined): 'all' | 'true' | 'false' {
  if (input === 'true' || input === 'false') return input;
  return 'all';
}

/* ----------- column helpers ----------- */

function ProBadge({ isPro }: { isPro: boolean }) {
  return (
    <span
      className={
        isPro
          ? 'inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
          : 'inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300'
      }
    >
      {isPro ? 'Pro' : 'Free'}
    </span>
  );
}

function OverrideBadge({ override }: { override: t.AdminManualOverride | null }) {
  if (!override?.enabled) {
    return <span className="text-xs text-gray-400 dark:text-gray-500">—</span>;
  }
  const label = override.mode ? `Override: ${override.mode}` : 'Override';
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
      {label}
    </span>
  );
}

/* ----------- page ----------- */

export default function SubscriptionsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Local search state for the q input — debounced before pushing to URL.
  const initialQ = searchParams.get('q') ?? '';
  const [searchInput, setSearchInput] = useState(initialQ);
  const debouncedSearch = useDebounce(searchInput, 300);

  // Plan filter is also a free-form input — debounce.
  const initialPlan = searchParams.get('plan') ?? '';
  const [planInput, setPlanInput] = useState(initialPlan);
  const debouncedPlan = useDebounce(planInput, 300);

  // Push debounced text inputs back into URL state. Skip the write when the
  // debounced value already matches the URL — otherwise the effect fires on
  // mount and on route-driven param changes, racing with other writers.
  useEffect(() => {
    const current = searchParams.get('q') ?? '';
    if (current === debouncedSearch) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (debouncedSearch) next.set('q', debouncedSearch);
        else next.delete('q');
        next.delete('page');
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    const current = searchParams.get('plan') ?? '';
    if (current === debouncedPlan) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (debouncedPlan) next.set('plan', debouncedPlan);
        else next.delete('plan');
        next.delete('page');
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedPlan]);

  // Sync the input boxes when URL changes externally (back/forward).
  useEffect(() => {
    setSearchInput(initialQ);
  }, [initialQ]);
  useEffect(() => {
    setPlanInput(initialPlan);
  }, [initialPlan]);

  const store = searchParams.get('store') ?? '';
  const overrideFilter = asOverride(searchParams.get('manuallyOverridden'));
  const sort = asSortValue(searchParams.get('sort'));
  const page = asPage(searchParams.get('page'));
  const limit = asPageSize(searchParams.get('limit'));

  const filters: t.AdminSubscriptionListParams = useMemo(() => {
    const f: t.AdminSubscriptionListParams = { sort, page, limit };
    if (debouncedSearch) f.q = debouncedSearch;
    if (debouncedPlan) f.plan = debouncedPlan;
    if (store) f.store = store;
    if (overrideFilter === 'true') f.manuallyOverridden = 'true';
    if (overrideFilter === 'false') f.manuallyOverridden = 'false';
    return f;
  }, [debouncedSearch, debouncedPlan, store, overrideFilter, sort, page, limit]);

  const { data, isLoading, isError, isFetching, error, refetch } = useAdminSubscriptions(filters);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = total > 0 ? Math.max(1, Math.ceil(total / limit)) : 1;

  /* ----------- url mutators ----------- */

  function updateParam(key: string, value: string | null) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value == null || value === '') next.delete(key);
        else next.set(key, value);
        if (key !== 'page') next.delete('page');
        return next;
      },
      { replace: true },
    );
  }

  function setPage(nextPage: number) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (nextPage <= 1) next.delete('page');
        else next.set('page', String(nextPage));
        return next;
      },
      { replace: true },
    );
  }

  function toggleSort(field: 'updatedAt' | 'expiresAt') {
    const current = sort;
    let nextSort: SortValue;
    if (field === 'updatedAt') {
      nextSort = current === '-updatedAt' ? 'updatedAt' : '-updatedAt';
    } else {
      nextSort = current === '-expiresAt' ? 'expiresAt' : '-expiresAt';
    }
    updateParam('sort', nextSort);
  }

  /* ----------- dialogs ----------- */

  const [dialog, setDialog] = useState<DialogState>({ kind: null, userId: null, email: null });

  function openDialog(kind: Exclude<DialogKind, null>, row: t.AdminSubscriptionListItem) {
    if (!row.userId) return;
    setDialog({ kind, userId: row.userId, email: row.email });
  }

  function closeDialog() {
    setDialog({ kind: null, userId: null, email: null });
  }

  /* ----------- columns ----------- */

  const columns = useMemo<ColumnDef<t.AdminSubscriptionListItem>[]>(
    () => [
      {
        id: 'email',
        header: 'Email',
        accessorKey: 'email',
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-900 dark:text-gray-50">
                {r.email ?? '—'}
              </span>
              {r.name ? (
                <span className="text-xs text-gray-500 dark:text-gray-400">{r.name}</span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'isPro',
        header: 'Pro',
        cell: ({ row }) => <ProBadge isPro={row.original.isPro} />,
      },
      {
        id: 'plan',
        header: 'Plan',
        cell: ({ row }) => (
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {row.original.currentPlan ?? '—'}
          </span>
        ),
      },
      {
        id: 'store',
        header: 'Store',
        cell: ({ row }) => (
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {row.original.store ?? '—'}
          </span>
        ),
      },
      {
        id: 'productId',
        header: 'Product ID',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-gray-700 dark:text-gray-300">
            {row.original.productId ?? '—'}
          </span>
        ),
      },
      {
        id: 'expiresAt',
        header: () => (
          <SortableHeader
            label="Expires"
            field="expiresAt"
            sort={sort}
            onSort={() => toggleSort('expiresAt')}
          />
        ),
        cell: ({ row }) => (
          <span className="text-xs tabular-nums text-gray-700 dark:text-gray-300">
            {formatDate(row.original.expiresAt)}
          </span>
        ),
      },
      {
        id: 'override',
        header: 'Override',
        cell: ({ row }) => <OverrideBadge override={row.original.manualOverride} />,
      },
      {
        id: 'lastSyncedAt',
        header: 'Last Synced',
        cell: ({ row }) => (
          <span className="text-xs tabular-nums text-gray-700 dark:text-gray-300">
            {formatDate(row.original.lastSyncedAt)}
          </span>
        ),
      },
      {
        id: 'updatedAt',
        header: () => (
          <SortableHeader
            label="Updated"
            field="updatedAt"
            sort={sort}
            onSort={() => toggleSort('updatedAt')}
          />
        ),
        cell: ({ row }) => (
          <span className="text-xs tabular-nums text-gray-700 dark:text-gray-300">
            {formatDate(row.original.updatedAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const r = row.original;
          const userId = r.userId;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                  aria-label="Row actions"
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  disabled={!userId}
                  onClick={() => userId && navigate(`/admin/users/${userId}`)}
                >
                  <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                  View user
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={!userId} onClick={() => openDialog('refresh', r)}>
                  Refresh
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!userId} onClick={() => openDialog('grant', r)}>
                  Grant Pro
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!userId}
                  variant="destructive"
                  onClick={() => openDialog('revoke', r)}
                >
                  Revoke Pro
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={!userId || !r.manualOverride?.enabled}
                  onClick={() => openDialog('clear', r)}
                >
                  Clear override
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sort, navigate],
  );

  // Translate sort string into TanStack Table SortingState for header UI.
  const sorting: SortingState = useMemo(() => {
    if (sort === 'updatedAt' || sort === '-updatedAt') {
      return [{ id: 'updatedAt', desc: sort.startsWith('-') }];
    }
    return [{ id: 'expiresAt', desc: sort.startsWith('-') }];
  }, [sort]);

  const table = useReactTable<t.AdminSubscriptionListItem>({
    data: items,
    columns,
    state: { sorting },
    manualSorting: true,
    manualPagination: true,
    pageCount: totalPages,
    getCoreRowModel: getCoreRowModel(),
  });

  /* ----------- render ----------- */

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">Subscriptions</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Browse and act on user subscription state.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
          aria-label="Refresh list"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {/* Filter bar */}
      <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="subs-search">Search email</Label>
          <Input
            id="subs-search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="user@example.com"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="subs-plan">Plan</Label>
          <Input
            id="subs-plan"
            value={planInput}
            onChange={(e) => setPlanInput(e.target.value)}
            placeholder="god_mode, pro, …"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="subs-store">Store</Label>
          <select
            id="subs-store"
            value={store}
            onChange={(e) => updateParam('store', e.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm text-text-primary focus:outline-none [&>option]:bg-surface-primary [&>option]:text-text-primary"
          >
            {STORE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="subs-override">Manual override</Label>
          <select
            id="subs-override"
            value={overrideFilter}
            onChange={(e) =>
              updateParam('manuallyOverridden', e.target.value === 'all' ? null : e.target.value)
            }
            className="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm text-text-primary focus:outline-none [&>option]:bg-surface-primary [&>option]:text-text-primary"
          >
            {OVERRIDE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Errors */}
      {isError ? (
        <div
          className="mb-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
          role="alert"
        >
          <div className="font-semibold">Failed to load subscriptions</div>
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

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => (
                    <th key={h.id} scope="col" className="whitespace-nowrap px-3 py-2 font-medium">
                      {h.isPlaceholder
                        ? null
                        : flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-3 py-12 text-center text-sm text-gray-500"
                  >
                    Loading subscriptions…
                  </td>
                </tr>
              ) : items.length === 0 && !isError ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-3 py-12 text-center text-sm text-gray-500"
                  >
                    No subscriptions match the current filters.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2 align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <Label htmlFor="subs-page-size" className="sr-only">
            Page size
          </Label>
          <select
            id="subs-page-size"
            value={limit}
            onChange={(e) => updateParam('limit', e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-text-primary [&>option]:bg-surface-primary [&>option]:text-text-primary"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </select>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {total > 0 ? `${total} total` : null}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1 || isFetching}
            onClick={() => setPage(page - 1)}
            className="inline-flex h-9 items-center rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            Prev
          </button>
          <span className="text-sm tabular-nums text-gray-600 dark:text-gray-300">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || isFetching}
            onClick={() => setPage(page + 1)}
            className="inline-flex h-9 items-center rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            Next
          </button>
        </div>
      </div>

      {/* Dialogs */}
      {dialog.userId && dialog.kind === 'grant' ? (
        <GrantProDialog
          userId={dialog.userId}
          userEmail={dialog.email}
          open
          onOpenChange={(next) => {
            if (!next) closeDialog();
          }}
        />
      ) : null}
      {dialog.userId && dialog.kind === 'revoke' ? (
        <RevokeProDialog
          userId={dialog.userId}
          userEmail={dialog.email}
          open
          onOpenChange={(next) => {
            if (!next) closeDialog();
          }}
        />
      ) : null}
      {dialog.userId && dialog.kind === 'clear' ? (
        <ClearOverrideDialog
          userId={dialog.userId}
          userEmail={dialog.email}
          open
          onOpenChange={(next) => {
            if (!next) closeDialog();
          }}
        />
      ) : null}
      {dialog.userId && dialog.kind === 'refresh' ? (
        <RefreshSubscriptionDialog
          userId={dialog.userId}
          userEmail={dialog.email}
          open
          onOpenChange={(next) => {
            if (!next) closeDialog();
          }}
        />
      ) : null}
    </div>
  );
}

/* ----------- sortable header ----------- */

function SortableHeader({
  label,
  field,
  sort,
  onSort,
}: {
  label: string;
  field: 'updatedAt' | 'expiresAt';
  sort: SortValue;
  onSort: () => void;
}) {
  const isActive = sort === field || sort === `-${field}`;
  const isDesc = sort === `-${field}`;
  return (
    <button
      type="button"
      onClick={onSort}
      className="inline-flex items-center gap-1 font-medium uppercase tracking-wide text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
    >
      {label}
      {isActive ? (
        isDesc ? (
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ChevronUp className="h-3 w-3" aria-hidden="true" />
        )
      ) : (
        <ChevronsUpDown className="h-3 w-3 opacity-50" aria-hidden="true" />
      )}
    </button>
  );
}
