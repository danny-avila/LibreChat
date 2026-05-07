/* eslint-disable i18next/no-literal-string */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  MoreHorizontal,
  RefreshCw,
  UserPlus,
} from 'lucide-react';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@librechat/client';
import type { AdminUserListItem, AdminUserListParams } from 'librechat-data-provider';
import { useAdminUsers } from '~/data-provider/Admin';
import {
  BanUserDialog,
  UnbanUserDialog,
  ChangeRoleDialog,
  ResetPasswordDialog,
  DeleteUserDialog,
  InviteUserDialog,
} from '~/components/Admin/Users';

type SortKey = 'email' | 'createdAt' | 'name';
type SortField = SortKey | `-${SortKey}`;

const PROVIDERS = ['local', 'google', 'github', 'discord', 'openid', 'saml', 'ldap'];
const ROLES = ['USER', 'ADMIN'];
const PAGE_SIZES = [25, 50, 100];

function isSortField(value: string | null): value is SortField {
  if (!value) return false;
  const stripped = value.startsWith('-') ? value.slice(1) : value;
  return stripped === 'email' || stripped === 'createdAt' || stripped === 'name';
}

function fmtDate(value: unknown): string {
  if (!value) return '—';
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function RoleBadge({ role }: { role?: string | null }) {
  const isAdmin = role === 'ADMIN';
  return (
    <span
      className={
        isAdmin
          ? 'inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-200'
          : 'inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300'
      }
    >
      {role ?? 'USER'}
    </span>
  );
}

function BannedBadge({ banned }: { banned?: boolean }) {
  return banned ? (
    <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/40 dark:text-red-200">
      Banned
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
      Active
    </span>
  );
}

function ProviderText({ provider }: { provider?: string | null }) {
  return <span className="text-xs text-muted-foreground">{provider || 'local'}</span>;
}

function SortHeader({
  label,
  columnKey,
  sort,
  onChange,
}: {
  label: string;
  columnKey: SortKey;
  sort: SortField | null;
  onChange: (next: SortField | null) => void;
}) {
  const active = sort && (sort === columnKey || sort === `-${columnKey}`);
  const isDesc = sort === `-${columnKey}`;
  return (
    <button
      type="button"
      className="-ml-2 inline-flex items-center gap-1 rounded px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-surface-hover"
      onClick={() => {
        if (sort === columnKey) onChange(`-${columnKey}`);
        else if (sort === `-${columnKey}`) onChange(null);
        else onChange(columnKey);
      }}
      aria-label={`Sort by ${label}`}
    >
      <span>{label}</span>
      {active ? (
        isDesc ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronUp className="h-3 w-3" />
        )
      ) : (
        <ChevronsUpDown className="h-3 w-3 opacity-50" />
      )}
    </button>
  );
}

export default function UsersPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL-derived state
  const urlQ = searchParams.get('q') ?? '';
  const urlRole = searchParams.get('role') ?? '';
  const urlProvider = searchParams.get('provider') ?? '';
  const urlBanned = searchParams.get('banned') ?? '';
  const urlCreatedAfter = searchParams.get('createdAfter') ?? '';
  const urlCreatedBefore = searchParams.get('createdBefore') ?? '';
  const urlPageRaw = parseInt(searchParams.get('page') ?? '1', 10);
  const urlPage = Number.isFinite(urlPageRaw) && urlPageRaw > 0 ? urlPageRaw : 1;
  const urlLimitRaw = parseInt(searchParams.get('limit') ?? '25', 10);
  const urlLimit = PAGE_SIZES.includes(urlLimitRaw) ? urlLimitRaw : 25;
  const urlSortRaw = searchParams.get('sort');
  const urlSort: SortField | null = isSortField(urlSortRaw) ? urlSortRaw : null;

  // Local search input (debounced into URL)
  const [searchInput, setSearchInput] = useState(urlQ);
  useEffect(() => {
    setSearchInput(urlQ);
  }, [urlQ]);

  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === urlQ) return;
    const handle = setTimeout(() => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        if (trimmed) next.set('q', trimmed);
        else next.delete('q');
        next.set('page', '1');
        return next;
      });
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput, urlQ, setSearchParams]);

  const updateParams = (mutator: (next: URLSearchParams) => void) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      mutator(next);
      return next;
    });
  };

  // Build query filters
  const filters: AdminUserListParams = useMemo(() => {
    const out: AdminUserListParams = { page: urlPage, limit: urlLimit };
    if (urlQ) out.q = urlQ;
    if (urlRole) out.role = urlRole;
    if (urlProvider) out.provider = urlProvider;
    if (urlBanned === 'true' || urlBanned === 'false') out.banned = urlBanned;
    if (urlCreatedAfter) out.createdAfter = urlCreatedAfter;
    if (urlCreatedBefore) out.createdBefore = urlCreatedBefore;
    if (urlSort) out.sort = urlSort;
    return out;
  }, [
    urlPage,
    urlLimit,
    urlQ,
    urlRole,
    urlProvider,
    urlBanned,
    urlCreatedAfter,
    urlCreatedBefore,
    urlSort,
  ]);

  const usersQuery = useAdminUsers(filters);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<{
    action: 'ban' | 'unban' | 'role' | 'reset' | 'delete';
    user: AdminUserListItem;
  } | null>(null);

  // Define columns
  const columns = useMemo<ColumnDef<AdminUserListItem>[]>(
    () => [
      {
        id: 'email',
        header: () => (
          <SortHeader
            label="Email"
            columnKey="email"
            sort={urlSort}
            onChange={(next) =>
              updateParams((p) => {
                if (next) p.set('sort', next);
                else p.delete('sort');
                p.set('page', '1');
              })
            }
          />
        ),
        cell: ({ row }) => (
          <Link
            to={`/admin/users/${row.original._id}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            {row.original.email}
          </Link>
        ),
      },
      {
        id: 'name',
        header: () => (
          <SortHeader
            label="Name"
            columnKey="name"
            sort={urlSort}
            onChange={(next) =>
              updateParams((p) => {
                if (next) p.set('sort', next);
                else p.delete('sort');
                p.set('page', '1');
              })
            }
          />
        ),
        cell: ({ row }) => (
          <span className="text-sm text-text-primary">
            {row.original.name || row.original.username || '—'}
          </span>
        ),
      },
      {
        id: 'role',
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Role
          </span>
        ),
        cell: ({ row }) => <RoleBadge role={row.original.role} />,
      },
      {
        id: 'provider',
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Provider
          </span>
        ),
        cell: ({ row }) => <ProviderText provider={row.original.provider} />,
      },
      {
        id: 'banned',
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Status
          </span>
        ),
        cell: ({ row }) => <BannedBadge banned={row.original.banned} />,
      },
      {
        id: 'createdAt',
        header: () => (
          <SortHeader
            label="Created"
            columnKey="createdAt"
            sort={urlSort}
            onChange={(next) =>
              updateParams((p) => {
                if (next) p.set('sort', next);
                else p.delete('sort');
                p.set('page', '1');
              })
            }
          />
        ),
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{fmtDate(row.original.createdAt)}</span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const u = row.original;
          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Actions for ${u.email}`}
                    className="h-8 w-8"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => navigate(`/admin/users/${u._id}`)}>
                    View
                  </DropdownMenuItem>
                  {u.banned ? (
                    <DropdownMenuItem
                      onSelect={() => setActiveAction({ action: 'unban', user: u })}
                    >
                      Unban
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onSelect={() => setActiveAction({ action: 'ban', user: u })}>
                      Ban
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={() => setActiveAction({ action: 'role', user: u })}>
                    Change role
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setActiveAction({ action: 'reset', user: u })}>
                    Reset password
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setActiveAction({ action: 'delete', user: u })}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [urlSort, navigate, setSearchParams],
  );

  const data = usersQuery.data?.items ?? [];
  const total = usersQuery.data?.total ?? 0;
  const totalPages = total > 0 ? Math.max(1, Math.ceil(total / urlLimit)) : 1;

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount: totalPages,
  });

  const showLoading = usersQuery.isLoading || (usersQuery.isFetching && !usersQuery.data);
  const isError = usersQuery.isError;
  const isEmpty = !showLoading && !isError && data.length === 0;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Users</h1>
          <p className="text-sm text-muted-foreground">
            {total > 0 ? `${total.toLocaleString()} total` : 'Manage user accounts'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => usersQuery.refetch()}
            disabled={usersQuery.isFetching}
          >
            <RefreshCw className={'h-4 w-4 ' + (usersQuery.isFetching ? 'animate-spin' : '')} />
            Refresh
          </Button>
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Invite user
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 rounded-lg border border-border-light bg-white p-3 dark:bg-gray-900 sm:grid-cols-2 lg:grid-cols-6">
        <div className="flex flex-col gap-1 lg:col-span-2">
          <Label htmlFor="users-search" className="text-xs">
            Search
          </Label>
          <Input
            id="users-search"
            type="search"
            placeholder="Email, name, username…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="users-role" className="text-xs">
            Role
          </Label>
          <select
            id="users-role"
            className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            value={urlRole}
            onChange={(e) =>
              updateParams((p) => {
                if (e.target.value) p.set('role', e.target.value);
                else p.delete('role');
                p.set('page', '1');
              })
            }
          >
            <option value="">All</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="users-provider" className="text-xs">
            Provider
          </Label>
          <select
            id="users-provider"
            className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            value={urlProvider}
            onChange={(e) =>
              updateParams((p) => {
                if (e.target.value) p.set('provider', e.target.value);
                else p.delete('provider');
                p.set('page', '1');
              })
            }
          >
            <option value="">All</option>
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="users-banned" className="text-xs">
            Status
          </Label>
          <select
            id="users-banned"
            className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            value={urlBanned}
            onChange={(e) =>
              updateParams((p) => {
                if (e.target.value) p.set('banned', e.target.value);
                else p.delete('banned');
                p.set('page', '1');
              })
            }
          >
            <option value="">All</option>
            <option value="true">Banned</option>
            <option value="false">Active</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="users-created-after" className="text-xs">
            Created after
          </Label>
          <input
            id="users-created-after"
            type="date"
            className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            value={urlCreatedAfter}
            onChange={(e) =>
              updateParams((p) => {
                if (e.target.value) p.set('createdAfter', e.target.value);
                else p.delete('createdAfter');
                p.set('page', '1');
              })
            }
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="users-created-before" className="text-xs">
            Created before
          </Label>
          <input
            id="users-created-before"
            type="date"
            className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            value={urlCreatedBefore}
            onChange={(e) =>
              updateParams((p) => {
                if (e.target.value) p.set('createdBefore', e.target.value);
                else p.delete('createdBefore');
                p.set('page', '1');
              })
            }
          />
        </div>
      </div>

      {/* Error banner */}
      {isError ? (
        <div
          role="alert"
          className="flex items-center justify-between rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
        >
          <span>Failed to load users.</span>
          <Button size="sm" variant="outline" onClick={() => usersQuery.refetch()}>
            Retry
          </Button>
        </div>
      ) : null}

      {/* Table */}
      <div className="rounded-lg border border-border-light bg-white dark:bg-gray-900">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="whitespace-nowrap">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {showLoading ? (
              Array.from({ length: 6 }).map((_, idx) => (
                <TableRow key={`skeleton-${idx}`}>
                  {columns.map((c, i) => (
                    <TableCell key={`s-${idx}-${i}`}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : isEmpty ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center text-sm text-muted-foreground"
                >
                  No users match your filters.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Rows per page</span>
          <select
            aria-label="Rows per page"
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            value={urlLimit}
            onChange={(e) =>
              updateParams((p) => {
                p.set('limit', e.target.value);
                p.set('page', '1');
              })
            }
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            Page {urlPage} of {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={urlPage <= 1 || showLoading}
            onClick={() => updateParams((p) => p.set('page', String(Math.max(1, urlPage - 1))))}
          >
            Prev
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={urlPage >= totalPages || showLoading}
            onClick={() =>
              updateParams((p) => p.set('page', String(Math.min(totalPages, urlPage + 1))))
            }
          >
            Next
          </Button>
        </div>
      </div>

      {/* Modals */}
      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      {activeAction?.action === 'ban' ? (
        <BanUserDialog
          user={activeAction.user}
          open
          onOpenChange={(open) => {
            if (!open) setActiveAction(null);
          }}
        />
      ) : null}
      {activeAction?.action === 'unban' ? (
        <UnbanUserDialog
          user={activeAction.user}
          open
          onOpenChange={(open) => {
            if (!open) setActiveAction(null);
          }}
        />
      ) : null}
      {activeAction?.action === 'role' ? (
        <ChangeRoleDialog
          user={activeAction.user}
          open
          onOpenChange={(open) => {
            if (!open) setActiveAction(null);
          }}
        />
      ) : null}
      {activeAction?.action === 'reset' ? (
        <ResetPasswordDialog
          user={activeAction.user}
          open
          onOpenChange={(open) => {
            if (!open) setActiveAction(null);
          }}
        />
      ) : null}
      {activeAction?.action === 'delete' ? (
        <DeleteUserDialog
          user={activeAction.user}
          open
          onOpenChange={(open) => {
            if (!open) setActiveAction(null);
          }}
        />
      ) : null}
    </div>
  );
}
