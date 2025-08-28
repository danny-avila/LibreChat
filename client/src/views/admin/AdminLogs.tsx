import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '~/components/ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/Dialog';
import DataTable from '~/components/ui/DataTable';
import { ColumnDef } from '@tanstack/react-table';
import { SearchBar } from '~/views/admin/AdminSearchBar';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '~/components/ui/Pagination';
import { ArrowLeft } from 'lucide-react';

type RawUser = { _id: string; email?: string; username?: string; name?: string } | string;

type RawLog = {
  _id: string;
  user: RawUser;
  action: 'LOGIN' | 'LOGOUT' | 'MODEL CHANGED' | string;
  timestamp: string;
  details?: any;
  tokenUsage?: {
    beforeModelChange?: {
      model: string;
      totalTokens: number;
      messageCount: number;
    };
    afterModelChange?: {
      model: string;
      totalTokens: number;
      messageCount: number;
    };
    tokenDifference?: number;
  };
};

type RowLog = {
  _id: string;
  userId: string;
  email?: string;
  name?: string;
  action: string;
  timestamp: string;
  details?: any;
  tokenUsage?: RawLog['tokenUsage'];
};

type UserCache = Record<string, { email?: string; name?: string; username?: string }>;

function toRow(log: RawLog & { userInfo?: any }, cache: UserCache): RowLog {
  const userId = typeof log.user === 'string' ? log.user : log.user?._id;
  const populated = (log as any).userInfo || (typeof log.user === 'object' ? log.user : undefined);
  const cached = userId ? cache[userId] : undefined;

  return {
    _id: log._id,
    userId: userId || '',
    email: populated?.email ?? cached?.email,
    name: populated?.name ?? cached?.name ?? populated?.username ?? cached?.username,
    action: log.action,
    timestamp: log.timestamp,
    details: log.details,
    tokenUsage: log.tokenUsage,
  };
}

export default function AdminLogs() {
  const [rows, setRows] = useState<RowLog[]>([]);
  const [filteredRows, setFilteredRows] = useState<RowLog[]>([]);
  const [userCache] = useState<UserCache>({});
  const [selected, setSelected] = useState<RowLog | null>(null);
  const [connected, setConnected] = useState(false);
  const [statusMap, setStatusMap] = useState<Record<string, 'Active' | 'Inactive'>>({});
  const esRef = useRef<EventSource | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchCategory, setSearchCategory] = useState<'all' | 'action' | 'email' | 'name'>('all');
  const itemsPerPage = 10;
  const mainContainerRef = useRef<HTMLDivElement>(null);

  // Filter logs based on search term and category
  useEffect(() => {
    if (!search.trim()) {
      setFilteredRows(rows);
    } else {
      const searchLower = search.toLowerCase();
      const filtered = rows.filter((log) => {
        switch (searchCategory) {
          case 'action':
            return log.action.toLowerCase().includes(searchLower);
          case 'email':
            return log.email?.toLowerCase().includes(searchLower);
          case 'name':
            return log.name?.toLowerCase().includes(searchLower);
          case 'all':
          default:
            return (
              log.email?.toLowerCase().includes(searchLower) ||
              log.name?.toLowerCase().includes(searchLower) ||
              log.action.toLowerCase().includes(searchLower)
            );
        }
      });
      setFilteredRows(filtered);
    }
    // Reset to page 1 when search changes
    setCurrentPage(1);
  }, [search, searchCategory, rows]);

  // Adjust table height + reset page if needed
  useEffect(() => {
    if (filteredRows.length > 0 && Math.ceil(filteredRows.length / itemsPerPage) < currentPage) {
      setCurrentPage(1);
    }

    const adjustTableHeight = () => {
      if (mainContainerRef.current) {
        const windowHeight = window.innerHeight;
        const containerTop = mainContainerRef.current.getBoundingClientRect().top;
        const paginationHeight = 60;
        const headerHeight = 60;
        const availableHeight = windowHeight - containerTop - paginationHeight - headerHeight;
        mainContainerRef.current.style.height = `${Math.max(400, availableHeight)}px`;
      }
    };

    setTimeout(adjustTableHeight, 100);
    window.addEventListener('resize', adjustTableHeight);
    return () => window.removeEventListener('resize', adjustTableHeight);
  }, [filteredRows, currentPage]);

  const getStatus = (row: RowLog) =>
    statusMap[row.userId] || (row.action === 'LOGOUT' ? 'Inactive' : 'Active');

  const applyStatusUpdate = (log: RowLog) => {
    if (!log.userId) return;
    setStatusMap((prev) => {
      if (log.action === 'LOGIN') return { ...prev, [log.userId]: 'Active' };
      if (log.action === 'LOGOUT') return { ...prev, [log.userId]: 'Inactive' };
      return prev;
    });
  };

  // Initial load + SSE connect
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    (async () => {
      try {
        const resp = await fetch(`http://localhost:3080/api/user-activity/logs?all=true`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await resp.json();
        if (json?.success && json?.data?.logs) {
          const normalized = json.data.logs.map((log: any) => toRow(log, userCache));
          setRows(normalized);
          normalized.forEach((log) => applyStatusUpdate(log));
        }
      } catch (e) {
        console.error('[AdminLogs] ❌ Initial HTTP fetch failed:', e);
      }
    })();

    const es = new EventSource(`http://localhost:3080/api/user-activity/stream?token=${token}`);
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.addEventListener('activity', (evt) => {
      if (!evt.data) return;
      try {
        const msg = JSON.parse(evt.data);
        if (msg.success && msg.data && msg.data.logs) {
          const normalized = msg.data.logs.map((log: any) => toRow(log, userCache));
          setRows((prev) => {
            const newRows = [...normalized, ...prev];
            return newRows.filter((row, i, self) => i === self.findIndex((r) => r._id === row._id));
          });
          normalized.forEach((log) => applyStatusUpdate(log));
        }
      } catch (e) {
        console.error('[AdminLogs] ❌ Failed to parse activity:', e);
      }
    });

    return () => es.close();
  }, []);

  const columns: ColumnDef<RowLog>[] = useMemo(
    () => [
      {
        id: 'index',
        header: 'No.',
        meta: { size: '60px' },
        cell: ({ row }) => (
          <span className="text-xs font-medium text-gray-500">
            {(currentPage - 1) * itemsPerPage + row.index + 1}
          </span>
        ),
      },
      {
        accessorKey: 'timestamp',
        header: 'Time',
        meta: { size: '150px' },
        cell: ({ row }) => (
          <span className="text-xs">{new Date(row.original.timestamp).toLocaleString()}</span>
        ),
      },
      {
        accessorKey: 'email',
        header: 'Email',
        cell: ({ row }) => row.original.email ?? '—',
        meta: { size: '220px' },
      },
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => row.original.name ?? '—',
        meta: { size: '180px' },
      },
      {
        accessorKey: 'action',
        header: 'Event',
        meta: { size: '120px' },
        cell: ({ row }) => {
          const action = row.original.action;
          return (
            <span
              className={[
                'rounded px-2 py-0.5 text-xs font-medium',
                action === 'LOGIN'
                  ? 'bg-[#DEF2ED] text-[#0A4F53]'
                  : action === 'LOGOUT'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-slate-100 text-slate-700',
              ].join(' ')}
            >
              {action}
            </span>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        meta: { size: '100px' },
        cell: ({ row }) => {
          const s = getStatus(row.original);
          return (
            <span
              className={[
                'rounded px-2 py-0.5 text-xs font-medium',
                s === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-700',
              ].join(' ')}
            >
              {s}
            </span>
          );
        },
      },
      {
        id: 'view',
        header: 'View',
        meta: { size: '80px' },
        cell: ({ row }) => (
          <Button size="sm" variant="outline" onClick={() => setSelected(row.original)}>
            View
          </Button>
        ),
      },
    ],
    [statusMap, currentPage, itemsPerPage],
  );

  const totalPages = Math.ceil(filteredRows.length / itemsPerPage);

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between border-b border-gray-200 pb-3">
        <div className="flex items-center gap-3">
          {/* Back Arrow */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => (window.location.href = '/c/new')}
            className="rounded-full"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

          {/* Title */}
          <h2 className="text-xl font-semibold">System Logs</h2>
        </div>
      </div>

      {/* Search with Category Selection */}
      <div className="flex flex-col gap-2">
        <div className="flex w-full gap-2">
          <div className="flex-none">
            <select
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              value={searchCategory}
              onChange={(e) => setSearchCategory(e.target.value as any)}
            >
              <option value="all">All Fields</option>
              <option value="action">Event</option>
              <option value="email">Email</option>
              <option value="name">Username</option>
            </select>
          </div>
          <SearchBar
            search={search}
            setSearch={setSearch}
            onSearch={() => {
              /* Immediate filtering handled by useEffect */
            }}
          />
        </div>

        {/* Event Filter Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={search === 'LOGIN' && searchCategory === 'action' ? 'default' : 'outline'}
            onClick={() => {
              setSearchCategory('action');
              setSearch('LOGIN');
            }}
            className="bg-[#DEF2ED] text-[#0A4F53] hover:bg-[#c7e6e1] hover:text-[#0A4F53]"
          >
            LOGIN
          </Button>
          <Button
            size="sm"
            variant={search === 'LOGOUT' && searchCategory === 'action' ? 'default' : 'outline'}
            onClick={() => {
              setSearchCategory('action');
              setSearch('LOGOUT');
            }}
            className="bg-red-100 text-red-700 hover:bg-red-200 hover:text-red-800"
          >
            LOGOUT
          </Button>
          <Button
            size="sm"
            variant={
              search === 'MODEL CHANGED' && searchCategory === 'action' ? 'default' : 'outline'
            }
            onClick={() => {
              setSearchCategory('action');
              setSearch('MODEL CHANGED');
            }}
            className="bg-blue-100 text-blue-700 hover:bg-blue-200 hover:text-blue-800"
          >
            MODEL CHANGED
          </Button>
          <Button
            size="sm"
            variant={
              search === 'ATTACHED FILE' && searchCategory === 'action' ? 'default' : 'outline'
            }
            onClick={() => {
              setSearchCategory('action');
              setSearch('ATTACHED FILE');
            }}
            className="bg-purple-100 text-purple-700 hover:bg-purple-200 hover:text-purple-800"
          >
            ATTACHED FILE
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSearchCategory('all');
              setSearch('');
            }}
          >
            Clear
          </Button>
        </div>
      </div>

      {/* Table */}
      <div
        ref={mainContainerRef}
        className="flex-grow overflow-hidden rounded-md border border-gray-200 dark:border-gray-700"
      >
        <DataTable
          columns={columns}
          data={filteredRows
            .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
            .map((r, i) => ({ ...r, id: r._id || i }))}
          className="h-full"
          enableRowSelection={false}
          showCheckboxes={false}
          onDelete={undefined}
        />
        {filteredRows.length === 0 && (
          <div className="flex h-40 w-full items-center justify-center">
            <p className="text-gray-500">No matching logs found</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {filteredRows.length > itemsPerPage && (
        <div className="flex items-center justify-between border-t border-gray-200 py-3 dark:border-gray-700">
          {/* Left: Showing text */}
          <div className="text-sm text-gray-500">
            {filteredRows.length > 0
              ? `Showing ${(currentPage - 1) * itemsPerPage + 1}-${Math.min(
                  currentPage * itemsPerPage,
                  filteredRows.length,
                )} of ${filteredRows.length}`
              : 'No logs'}
          </div>

          {/* Right: Pagination */}
          <Pagination>
            <PaginationContent>
              {/* Previous */}
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  className={currentPage === 1 ? 'pointer-events-none opacity-50' : ''}
                />
              </PaginationItem>

              {/* Page numbers with ellipsis */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pageNumber = i + 1;
                const isCurrentPage = pageNumber === currentPage;

                if (
                  pageNumber === 1 ||
                  pageNumber === totalPages ||
                  (pageNumber >= currentPage - 1 && pageNumber <= currentPage + 1)
                ) {
                  return (
                    <PaginationItem key={pageNumber}>
                      <PaginationLink
                        isActive={isCurrentPage}
                        onClick={() => setCurrentPage(pageNumber)}
                      >
                        {pageNumber}
                      </PaginationLink>
                    </PaginationItem>
                  );
                }

                if (
                  (pageNumber === 2 && currentPage > 3) ||
                  (pageNumber === totalPages - 1 && currentPage < totalPages - 2)
                ) {
                  return (
                    <PaginationItem key={`ellipsis-${pageNumber}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  );
                }

                return null;
              })}

              {/* Next */}
              <PaginationItem>
                <PaginationNext
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  className={currentPage === totalPages ? 'pointer-events-none opacity-50' : ''}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      {/* Details Dialog */}
      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto border border-gray-200 shadow-lg dark:border-gray-700">
          <DialogHeader className="border-b border-gray-200 dark:border-gray-700">
            <DialogTitle className="flex items-center gap-2 text-xl">
              {/* Event-specific icon */}
              {selected && (
                <span
                  className={`rounded-full p-1.5 ${
                    selected?.action === 'LOGIN'
                      ? 'bg-[#DEF2ED] text-[#0A4F53] dark:bg-green-900 dark:text-green-300'
                      : selected?.action === 'LOGOUT'
                        ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                        : selected?.action === 'MODEL CHANGED'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                          : selected?.action === 'ATTACHED FILE'
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                            : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                  }`}
                >
                  {selected?.action === 'LOGIN' && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M13.8 12H3" />
                    </svg>
                  )}
                  {selected?.action === 'LOGOUT' && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                    </svg>
                  )}
                  {selected?.action === 'MODEL CHANGED' && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                      <path d="M16 16h5v5" />
                    </svg>
                  )}
                  {selected?.action === 'ATTACHED FILE' && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                  )}
                  {selected?.action !== 'LOGIN' &&
                    selected?.action !== 'LOGOUT' &&
                    selected?.action !== 'MODEL CHANGED' &&
                    selected?.action !== 'ATTACHED FILE' && (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                    )}
                </span>
              )}
              {selected?.action || 'Log Details'}
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="flex flex-col gap-4 p-1">
              <div className="grid grid-cols-2 gap-4 rounded-md bg-gray-50 p-4 text-sm shadow-sm dark:bg-gray-800">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                    Time
                  </span>
                  <span>{new Date(selected.timestamp).toLocaleString()}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                    Event
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      selected.action === 'LOGIN'
                        ? 'bg-[#DEF2ED] text-[#0A4F53] dark:bg-green-900 dark:text-green-300'
                        : selected.action === 'LOGOUT'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                          : selected.action === 'MODEL CHANGED'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                            : selected.action === 'ATTACHED FILE'
                              ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                              : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                    }`}
                  >
                    {selected.action}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                    Email
                  </span>
                  <span>{selected.email ?? '—'}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                    Name
                  </span>
                  <span>{selected.name ?? '—'}</span>
                </div>
              </div>

              {selected.tokenUsage ? (
                <div className="rounded-md border border-blue-100 bg-white p-4 shadow-sm dark:border-blue-900 dark:bg-gray-800">
                  <div className="mb-3 flex items-center gap-2 border-b border-gray-100 pb-2 dark:border-gray-700">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-blue-500"
                    >
                      <path d="M9 19v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2z" />
                      <path d="M9 9V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4" />
                      <path d="M13 19v-6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" />
                    </svg>
                    <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                      Model Usage Statistics
                    </h3>
                  </div>

                  <div className="mb-4 grid grid-cols-2 gap-4">
                    <div className="rounded-md bg-blue-50 p-3 dark:bg-blue-900/30">
                      <div className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                        Before Change
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-xs text-gray-500 dark:text-gray-400">Model:</span>
                          <span className="text-xs font-medium">
                            {selected.tokenUsage.beforeModelChange?.model ?? '-'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-gray-500 dark:text-gray-400">Tokens:</span>
                          <span className="text-xs font-medium">
                            {selected.tokenUsage.beforeModelChange?.totalTokens ?? 0}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            Messages:
                          </span>
                          <span className="text-xs font-medium">
                            {selected.tokenUsage.beforeModelChange?.messageCount ?? 0}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-md bg-blue-50 p-3 dark:bg-blue-900/30">
                      <div className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                        After Change
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-xs text-gray-500 dark:text-gray-400">Model:</span>
                          <span className="text-xs font-medium">
                            {selected.tokenUsage.afterModelChange?.model ?? '-'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-gray-500 dark:text-gray-400">Tokens:</span>
                          <span className="text-xs font-medium">
                            {selected.tokenUsage.afterModelChange?.totalTokens ?? 0}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            Messages:
                          </span>
                          <span className="text-xs font-medium">
                            {selected.tokenUsage.afterModelChange?.messageCount ?? 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-md bg-gray-50 p-2 dark:bg-gray-700">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      Token Difference:
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        (selected.tokenUsage.tokenDifference || 0) > 0
                          ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                      }`}
                    >
                      {selected.tokenUsage.tokenDifference ?? 0}
                    </span>
                  </div>
                </div>
              ) : selected.action === 'ATTACHED FILE' ? (
                <div className="rounded-md border border-purple-100 bg-white p-4 shadow-sm dark:border-purple-900 dark:bg-gray-800">
                  <div className="mb-3 flex items-center gap-2 border-b border-gray-100 pb-2 dark:border-gray-700">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-purple-500"
                    >
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                    <h3 className="text-sm font-semibold text-purple-700 dark:text-purple-300">
                      File Attachment Details
                    </h3>
                  </div>

                  {selected.details?.filename && (
                    <div className="mb-3 rounded-md bg-purple-50 p-3 dark:bg-purple-900/30">
                      <div className="flex items-center gap-2">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-purple-500"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                          <polyline points="10 9 9 9 8 9" />
                        </svg>
                        <span className="text-sm font-medium">{selected.details.filename}</span>
                      </div>
                      {selected.details.fileSize && (
                        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                          Size: {Math.round(selected.details.fileSize / 1024)} KB
                        </div>
                      )}
                    </div>
                  )}

                  <pre className="max-h-64 overflow-auto rounded bg-gray-50 p-3 text-xs dark:bg-gray-700">
                    {JSON.stringify(selected.details ?? {}, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                  <div className="mb-3 flex items-center gap-2 border-b border-gray-100 pb-2 dark:border-gray-700">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-gray-500"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Event Details
                    </h3>
                  </div>

                  <pre className="max-h-64 overflow-auto rounded bg-gray-50 p-3 text-xs dark:bg-gray-700">
                    {JSON.stringify(selected.details ?? {}, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Dialog Footer */}
          {selected && (
            <div className="flex justify-end border-t border-gray-200 pt-4 dark:border-gray-700">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelected(null)}
                className="px-4"
              >
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
