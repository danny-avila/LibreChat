/* eslint-disable i18next/no-literal-string */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import type { AdminAuditEntry, AdminAuditListParams } from 'librechat-data-provider';
import {
  useAdminAuditActions,
  useAdminAuditEntry,
  useAdminAuditLog,
} from '~/data-provider/Admin/queries';
import { cn } from '~/utils';

const TARGET_TYPES = [
  'user',
  'subscription',
  'balance',
  'transaction',
  'message',
  'conversation',
  'audit',
  'system',
] as const;

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

type SortDir = 'asc' | 'desc';

function isObjectId(v: string): boolean {
  return OBJECT_ID_RE.test(v);
}

function formatTimestamp(v?: string): string {
  if (!v) return '—';
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return v;
    return d.toLocaleString();
  } catch {
    return v;
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

function buildTargetLink(targetType?: string | null, targetId?: string | null): string | null {
  if (!targetType || !targetId) return null;
  switch (targetType) {
    case 'user':
      return `/admin/users/${targetId}`;
    case 'subscription':
      return `/admin/subscriptions/${targetId}`;
    case 'conversation':
      // Conversation detail requires userId — fall back to messages root.
      return `/admin/messages`;
    default:
      return null;
  }
}

function StatusBadge({ status }: { status?: string | null }) {
  const isFailure = status === 'failure';
  const isSuccess = status === 'success';
  const cls = isFailure
    ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
    : isSuccess
      ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
      : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  return (
    <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium', cls)}>
      {status ?? 'unknown'}
    </span>
  );
}

function ActionBadge({ action }: { action: string }) {
  return (
    <span className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 font-mono text-xs text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
      {action}
    </span>
  );
}

/* ---------- URL state ---------- */

type AuditUrlState = {
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  status: string;
  q: string;
  from: string;
  to: string;
  sort: SortDir;
  page: number;
  limit: number;
};

function defaultState(): AuditUrlState {
  return {
    actorId: '',
    action: '',
    targetType: '',
    targetId: '',
    status: '',
    q: '',
    from: '',
    to: '',
    sort: 'desc',
    page: 1,
    limit: 50,
  };
}

function parseUrl(sp: URLSearchParams): AuditUrlState {
  const d = defaultState();
  const sort = sp.get('sort') === 'asc' ? 'asc' : 'desc';
  const limitRaw = parseInt(sp.get('limit') ?? '', 10);
  const limit = PAGE_SIZE_OPTIONS.includes(limitRaw as (typeof PAGE_SIZE_OPTIONS)[number])
    ? limitRaw
    : d.limit;
  const pageRaw = parseInt(sp.get('page') ?? '', 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  return {
    actorId: sp.get('actorId') ?? '',
    action: sp.get('action') ?? '',
    targetType: sp.get('targetType') ?? '',
    targetId: sp.get('targetId') ?? '',
    status: sp.get('status') ?? '',
    q: sp.get('q') ?? '',
    from: sp.get('from') ?? '',
    to: sp.get('to') ?? '',
    sort,
    page,
    limit,
  };
}

function stateToParams(s: AuditUrlState): Record<string, string> {
  const out: Record<string, string> = {};
  if (s.actorId) out.actorId = s.actorId;
  if (s.action) out.action = s.action;
  if (s.targetType) out.targetType = s.targetType;
  if (s.targetId) out.targetId = s.targetId;
  if (s.status) out.status = s.status;
  if (s.q) out.q = s.q;
  if (s.from) out.from = s.from;
  if (s.to) out.to = s.to;
  if (s.sort !== 'desc') out.sort = s.sort;
  if (s.page !== 1) out.page = String(s.page);
  if (s.limit !== 50) out.limit = String(s.limit);
  return out;
}

/* ---------- Detail Dialog ---------- */

function JsonPane({ value }: { value: unknown }) {
  return (
    <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-md bg-gray-50 p-3 text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-200">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className="text-sm text-gray-900 dark:text-gray-100">{children}</div>
    </div>
  );
}

function AuditDetailDialog({
  entry,
  open,
  onOpenChange,
}: {
  entry: AdminAuditEntry | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const hasBefore = entry?.before != null;
  const hasAfter = entry?.after != null;
  const hasMeta = entry?.meta != null;
  const defaultTab = hasMeta ? 'meta' : hasAfter ? 'after' : hasBefore ? 'before' : 'meta';

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 grid w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border border-gray-200 bg-white p-6 shadow-lg',
            'dark:border-gray-800 dark:bg-gray-900',
            'max-h-[90vh] overflow-y-auto',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="text-base font-semibold text-gray-900 dark:text-gray-50">
                Audit entry
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {entry?._id ?? ''}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          {entry ? (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <DetailRow label="Created">{formatTimestamp(entry.createdAt)}</DetailRow>
                <DetailRow label="Action">
                  <ActionBadge action={entry.action} />
                </DetailRow>
                <DetailRow label="Actor">
                  <div className="flex flex-col">
                    <span>{entry.actorEmail ?? '—'}</span>
                    {entry.actorIp ? (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        IP: {entry.actorIp}
                      </span>
                    ) : null}
                    {entry.userAgent ? (
                      <span
                        className="truncate text-xs text-gray-500 dark:text-gray-400"
                        title={entry.userAgent}
                      >
                        UA: {truncate(entry.userAgent, 80)}
                      </span>
                    ) : null}
                  </div>
                </DetailRow>
                <DetailRow label="Target">
                  <div className="flex flex-col">
                    <span>{entry.targetType ?? '—'}</span>
                    {entry.targetId ? (
                      <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                        {entry.targetId}
                      </span>
                    ) : null}
                  </div>
                </DetailRow>
                <DetailRow label="Status">
                  <StatusBadge status={entry.status} />
                </DetailRow>
                <DetailRow label="Reason">
                  <span className="break-words text-sm">{entry.reason ?? '—'}</span>
                </DetailRow>
              </div>

              {entry.status === 'failure' && entry.errorMessage ? (
                <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <div className="break-words">{String(entry.errorMessage)}</div>
                  </div>
                </div>
              ) : null}

              <Tabs.Root defaultValue={defaultTab}>
                <Tabs.List
                  className="flex gap-1 border-b border-gray-200 dark:border-gray-800"
                  aria-label="Audit detail tabs"
                >
                  <Tabs.Trigger
                    value="before"
                    disabled={!hasBefore}
                    className="rounded-t-md border-b-2 border-transparent px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 data-[state=active]:border-blue-600 data-[state=active]:text-blue-700 dark:text-gray-300 dark:hover:text-gray-100 dark:data-[state=active]:text-blue-400"
                  >
                    Before
                  </Tabs.Trigger>
                  <Tabs.Trigger
                    value="after"
                    disabled={!hasAfter}
                    className="rounded-t-md border-b-2 border-transparent px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 data-[state=active]:border-blue-600 data-[state=active]:text-blue-700 dark:text-gray-300 dark:hover:text-gray-100 dark:data-[state=active]:text-blue-400"
                  >
                    After
                  </Tabs.Trigger>
                  <Tabs.Trigger
                    value="meta"
                    disabled={!hasMeta}
                    className="rounded-t-md border-b-2 border-transparent px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 data-[state=active]:border-blue-600 data-[state=active]:text-blue-700 dark:text-gray-300 dark:hover:text-gray-100 dark:data-[state=active]:text-blue-400"
                  >
                    Meta
                  </Tabs.Trigger>
                </Tabs.List>
                <Tabs.Content value="before" className="pt-3">
                  {hasBefore ? <JsonPane value={entry.before} /> : null}
                </Tabs.Content>
                <Tabs.Content value="after" className="pt-3">
                  {hasAfter ? <JsonPane value={entry.after} /> : null}
                </Tabs.Content>
                <Tabs.Content value="meta" className="pt-3">
                  {hasMeta ? <JsonPane value={entry.meta} /> : null}
                </Tabs.Content>
              </Tabs.Root>
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ---------- Page ---------- */

export default function AuditPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { auditId } = useParams<{ auditId?: string }>();

  const urlState = useMemo(() => parseUrl(searchParams), [searchParams]);

  // Local form state lets the user type without immediately re-fetching.
  const [form, setForm] = useState(() => urlState);
  // Sync form state when URL changes (e.g. browser back / external nav).
  useEffect(() => {
    setForm(urlState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()]);

  // Debounce the search box. Other filters apply on change immediately.
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (form.q === urlState.q) return;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      commitState({ ...form, page: 1 });
    }, 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.q]);

  function commitState(next: AuditUrlState) {
    setSearchParams(stateToParams(next), { replace: false });
  }

  function patchState(patch: Partial<AuditUrlState>) {
    const next: AuditUrlState = { ...urlState, ...patch };
    // Reset page on filter change
    if (
      patch.actorId !== undefined ||
      patch.action !== undefined ||
      patch.targetType !== undefined ||
      patch.targetId !== undefined ||
      patch.status !== undefined ||
      patch.from !== undefined ||
      patch.to !== undefined ||
      patch.q !== undefined ||
      patch.sort !== undefined ||
      patch.limit !== undefined
    ) {
      next.page = 1;
    }
    commitState(next);
  }

  // Validate actorId
  const actorIdInvalid = form.actorId.trim() !== '' && !isObjectId(form.actorId.trim());

  // Build query params (omit invalid actorId)
  const queryParams: AdminAuditListParams = useMemo(() => {
    const p: AdminAuditListParams = {
      page: urlState.page,
      limit: urlState.limit,
      sort: urlState.sort === 'asc' ? 'createdAt' : '-createdAt',
    };
    if (urlState.actorId && isObjectId(urlState.actorId)) p.actorId = urlState.actorId;
    if (urlState.action) p.action = urlState.action;
    if (urlState.targetType) p.targetType = urlState.targetType;
    if (urlState.targetId) p.targetId = urlState.targetId;
    if (urlState.status === 'success' || urlState.status === 'failure') p.status = urlState.status;
    if (urlState.from) p.from = urlState.from;
    if (urlState.to) p.to = urlState.to;
    if (urlState.q) p.q = urlState.q;
    return p;
  }, [urlState]);

  const listQuery = useAdminAuditLog(queryParams);
  const actionsQuery = useAdminAuditActions();

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / urlState.limit));

  // Detail dialog state — driven by URL :auditId
  const [selectedRow, setSelectedRow] = useState<AdminAuditEntry | null>(null);
  useEffect(() => {
    if (!auditId) {
      setSelectedRow(null);
      return;
    }
    const found = items.find((it) => it._id === auditId);
    if (found) setSelectedRow(found);
  }, [auditId, items]);

  // Fall back to fetching the entry if it isn't in the list (deep-link case).
  const needsFetch = !!auditId && !selectedRow;
  const entryQuery = useAdminAuditEntry(needsFetch ? (auditId as string) : '');
  useEffect(() => {
    if (entryQuery.data && entryQuery.data._id === auditId) {
      setSelectedRow(entryQuery.data);
    }
  }, [entryQuery.data, auditId]);

  const dialogOpen = !!auditId;
  function openDialog(row: AdminAuditEntry) {
    setSelectedRow(row);
    navigate(
      `/admin/audit/${row._id}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`,
    );
  }
  function closeDialog() {
    navigate(`/admin/audit${searchParams.toString() ? `?${searchParams.toString()}` : ''}`);
  }

  const columns = useMemo<ColumnDef<AdminAuditEntry>[]>(
    () => [
      {
        id: 'createdAt',
        header: () => (
          <button
            type="button"
            onClick={() => patchState({ sort: urlState.sort === 'desc' ? 'asc' : 'desc' })}
            className="inline-flex items-center gap-1 font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
          >
            Created
            {urlState.sort === 'asc' ? (
              <ArrowUp className="h-3 w-3" aria-hidden="true" />
            ) : (
              <ArrowDown className="h-3 w-3" aria-hidden="true" />
            )}
          </button>
        ),
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-mono text-xs text-gray-700 dark:text-gray-300">
            {formatTimestamp(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: 'actor',
        header: () => <span className="font-medium">Actor</span>,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="text-sm text-gray-900 dark:text-gray-100">
              {row.original.actorEmail ?? '—'}
            </span>
            {row.original.actorIp ? (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {row.original.actorIp}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: 'action',
        header: () => <span className="font-medium">Action</span>,
        cell: ({ row }) => <ActionBadge action={row.original.action} />,
      },
      {
        id: 'targetType',
        header: () => <span className="font-medium">Target type</span>,
        cell: ({ row }) => (
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {row.original.targetType ?? '—'}
          </span>
        ),
      },
      {
        id: 'targetId',
        header: () => <span className="font-medium">Target id</span>,
        cell: ({ row }) => {
          const link = buildTargetLink(row.original.targetType, row.original.targetId);
          if (!row.original.targetId) {
            return <span className="text-gray-400">—</span>;
          }
          if (link) {
            return (
              <a
                href={link}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  navigate(link);
                }}
                className="font-mono text-xs text-blue-600 hover:underline dark:text-blue-400"
              >
                {truncate(row.original.targetId, 24)}
              </a>
            );
          }
          return (
            <span
              className="font-mono text-xs text-gray-700 dark:text-gray-300"
              title={row.original.targetId}
            >
              {truncate(row.original.targetId, 24)}
            </span>
          );
        },
      },
      {
        id: 'status',
        header: () => <span className="font-medium">Status</span>,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'reason',
        header: () => <span className="font-medium">Reason</span>,
        cell: ({ row }) => {
          const r = row.original.reason ?? '';
          if (!r) return <span className="text-gray-400">—</span>;
          return (
            <span
              className="block max-w-[28ch] truncate text-sm text-gray-700 dark:text-gray-300"
              title={r}
            >
              {r}
            </span>
          );
        },
      },
      {
        id: 'view',
        header: () => <span className="sr-only">View</span>,
        cell: ({ row }) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openDialog(row.original);
            }}
            className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            View
          </button>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [urlState.sort, urlState.page, urlState.limit, searchParams.toString()],
  );

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount: totalPages,
  });

  const pageError = listQuery.isError ? listQuery.error : null;

  function resetFilters() {
    setSearchParams({}, { replace: false });
  }

  return (
    <div className="flex h-full flex-col p-6" data-page="audit">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">Audit log</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Browse admin activity across the system.
          </p>
        </div>
        <button
          type="button"
          onClick={() => listQuery.refetch()}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <RefreshCw
            className={cn('h-3.5 w-3.5', listQuery.isFetching && 'animate-spin')}
            aria-hidden="true"
          />
          Refresh
        </button>
      </header>

      {/* Filter bar */}
      <section
        aria-label="Filters"
        className="mb-4 grid grid-cols-1 gap-3 rounded-md border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:grid-cols-2 lg:grid-cols-4"
      >
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-600 dark:text-gray-400">Actor ID</span>
          <input
            value={form.actorId}
            onChange={(e) => setForm({ ...form, actorId: e.target.value })}
            onBlur={() => {
              const next = form.actorId.trim();
              if (next === '' || isObjectId(next)) {
                if (next !== urlState.actorId) patchState({ actorId: next });
              }
            }}
            placeholder="ObjectId"
            className={cn(
              'rounded border bg-white px-2 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 dark:bg-gray-900 dark:text-gray-100',
              actorIdInvalid
                ? 'border-red-400 focus:ring-red-300'
                : 'border-gray-300 focus:ring-blue-300 dark:border-gray-700',
            )}
            aria-invalid={actorIdInvalid || undefined}
          />
          {actorIdInvalid ? (
            <span className="text-[11px] text-red-600 dark:text-red-400">
              Must be a 24-char ObjectId
            </span>
          ) : null}
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-600 dark:text-gray-400">Action</span>
          <select
            value={form.action}
            onChange={(e) => {
              setForm({ ...form, action: e.target.value });
              patchState({ action: e.target.value });
            }}
            className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="">All actions</option>
            {(actionsQuery.data ?? []).map((a) => (
              <option key={a.action} value={a.action}>
                {a.action} ({a.count})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-600 dark:text-gray-400">Target type</span>
          <select
            value={form.targetType}
            onChange={(e) => {
              setForm({ ...form, targetType: e.target.value });
              patchState({ targetType: e.target.value });
            }}
            className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="">All target types</option>
            {TARGET_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-600 dark:text-gray-400">Target ID</span>
          <input
            value={form.targetId}
            onChange={(e) => setForm({ ...form, targetId: e.target.value })}
            onBlur={() => {
              if (form.targetId !== urlState.targetId) {
                patchState({ targetId: form.targetId });
              }
            }}
            placeholder="any id"
            className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-600 dark:text-gray-400">Status</span>
          <select
            value={form.status}
            onChange={(e) => {
              setForm({ ...form, status: e.target.value });
              patchState({ status: e.target.value });
            }}
            className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="">All</option>
            <option value="success">success</option>
            <option value="failure">failure</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-600 dark:text-gray-400">From</span>
          <input
            type="date"
            value={form.from}
            onChange={(e) => {
              setForm({ ...form, from: e.target.value });
              patchState({ from: e.target.value });
            }}
            className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-600 dark:text-gray-400">To</span>
          <input
            type="date"
            value={form.to}
            onChange={(e) => {
              setForm({ ...form, to: e.target.value });
              patchState({ to: e.target.value });
            }}
            className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-600 dark:text-gray-400">Search</span>
          <div className="relative">
            <Search
              className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
              aria-hidden="true"
            />
            <input
              value={form.q}
              onChange={(e) => setForm({ ...form, q: e.target.value })}
              placeholder="email, target id, reason"
              className="w-full rounded border border-gray-300 bg-white py-1.5 pl-7 pr-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
        </label>

        <div className="flex items-end justify-end sm:col-span-2 lg:col-span-4">
          <button
            type="button"
            onClick={resetFilters}
            className="text-xs font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            Reset filters
          </button>
        </div>
      </section>

      {/* Error banner */}
      {pageError ? (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <div className="font-semibold">Failed to load audit log</div>
              <div className="text-xs">{(pageError as Error)?.message ?? 'Unknown error'}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => listQuery.refetch()}
            className="rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-950/60"
          >
            Retry
          </button>
        </div>
      ) : null}

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-md border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full table-auto text-left">
          <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-gray-200 dark:border-gray-800">
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className="px-3 py-2 text-xs uppercase tracking-wide text-gray-600 dark:text-gray-400"
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {listQuery.isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={`skel-${i}`} className="border-b border-gray-100 dark:border-gray-800">
                  {columns.map((_c, j) => (
                    <td key={j} className="px-3 py-3">
                      <div className="h-3 w-full max-w-[16ch] animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
                    </td>
                  ))}
                </tr>
              ))
            ) : items.length === 0 && !pageError ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-12 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  No audit rows match your filters.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => openDialog(row.original)}
                  className="cursor-pointer border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/60"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2 align-top">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <footer className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
          <span>Page size</span>
          <select
            value={urlState.limit}
            onChange={(e) => patchState({ limit: parseInt(e.target.value, 10) })}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            aria-label="Page size"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span className="ml-3 text-xs text-gray-500 dark:text-gray-500">{total} total</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => patchState({ page: Math.max(1, urlState.page - 1) })}
            disabled={urlState.page <= 1 || listQuery.isFetching}
            className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Prev
          </button>
          <span className="px-1 text-xs text-gray-600 dark:text-gray-400">
            Page {urlState.page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => patchState({ page: Math.min(totalPages, urlState.page + 1) })}
            disabled={urlState.page >= totalPages || listQuery.isFetching}
            className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </footer>

      <AuditDetailDialog
        open={dialogOpen}
        entry={selectedRow}
        onOpenChange={(o) => {
          if (!o) closeDialog();
        }}
      />
    </div>
  );
}
