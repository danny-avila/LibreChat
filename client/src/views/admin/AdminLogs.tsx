import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '~/components/ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/Dialog';
import DataTable from '~/components/ui/DataTable';
import { ColumnDef } from '@tanstack/react-table';
import { SearchBar } from '~/views/admin/AdminSearchBar';
import { Pagination } from '~/components/ui/Pagination';
import { ArrowLeft, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { cn } from '~/utils';
import moment from 'moment';
import { useAdminLogs } from './useAdmin';
import AdminLogsDialog from './AdminLogsDialog';

type RawUser = { _id: string; email?: string; username?: string; name?: string } | string;

type RawLog = {
  _id: string;
  user: RawUser;
  action: 'LOGIN' | 'LOGOUT' | 'MODEL CHANGED' | 'ATTACHED FILE' | string;
  timestamp: string;
  details?: any;
  tokenUsage?: {
    beforeModelChange?: { model: string; totalTokens: number; messageCount: number };
    afterModelChange?: { model: string; totalTokens: number; messageCount: number };
    tokenDifference?: number;
  };
  userInfo?: { email?: string; name?: string; username?: string };
};

export type RowLog = {
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

function toRow(log: RawLog, cache: UserCache): RowLog {
  const userId = typeof log.user === 'string' ? log.user : log.user?._id;
  const populated = log.userInfo || (typeof log.user === 'object' ? log.user : undefined);
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
  const [userCache] = useState<UserCache>({});
  const [selected, setSelected] = useState<RowLog | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchCategory, setSearchCategory] = useState<'all' | 'action'>('all');
  const itemsPerPage = 10;

  const { logs, connected, total, loading, error, refetchLogs } = useAdminLogs(itemsPerPage, currentPage, search, searchCategory === 'action' ? search : '');

  // Process logs from useAdminLogs
  const rows = useMemo(() => logs.map((log: any) => toRow(log, userCache)), [logs, userCache]);

  // Log for debugging
  useEffect(() => {
    console.log('[AdminLogs] State:', { total, logsLength: logs.length, currentPage, loading, error, totalPages: Math.ceil(total / itemsPerPage) });
    console.log('[AdminLogs] Log IDs:', logs.map((log: any) => log._id));
  }, [total, logs, currentPage, loading, error]);

  // Reset page if totalPages is less than currentPage
  useEffect(() => {
    const totalPages = Math.ceil(total / itemsPerPage);
    if (totalPages > 0 && currentPage > totalPages) {
      console.log('[AdminLogs] Resetting page to 1, totalPages:', totalPages);
      setCurrentPage(1);
    }
  }, [total, currentPage, itemsPerPage]);

  // Calculate user status based on current page
  const statusMap = useMemo(() => {
    const map: Record<string, 'Active' | 'Inactive' | 'Unknown'> = {};
    const uniqueUserIds = [...new Set(rows.map((log) => log.userId).filter(Boolean))];
    uniqueUserIds.forEach((userId) => {
      const userLogs = rows
        .filter((log) => log.userId === userId && (log.action === 'LOGIN' || log.action === 'LOGOUT'))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      map[userId] = userLogs.length === 0 ? 'Unknown' : userLogs[0].action === 'LOGIN' ? 'Active' : 'Inactive';
    });
    return map;
  }, [rows]);

  // Adjust table height only on mount and resize
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef<number>(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const adjustTableHeight = () => {
      if (mainContainerRef.current) {
        const windowHeight = window.innerHeight;
        const containerTop = mainContainerRef.current.getBoundingClientRect().top;
        const paginationHeight = 80; // Increased to account for pagination
        const bottomPadding = 20; // Additional padding at bottom
        const availableHeight = windowHeight - containerTop - paginationHeight - bottomPadding;
        mainContainerRef.current.style.height = `${Math.max(300, availableHeight)}px`;
      }
    };

    adjustTableHeight();
    window.addEventListener('resize', adjustTableHeight);
    return () => window.removeEventListener('resize', adjustTableHeight);
  }, []);

  // Restore scroll position after page change
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollPositionRef.current;
      console.log('[AdminLogs] Restored scroll position:', scrollPositionRef.current);
    }
  }, [logs]);

  // Save scroll position before page change
  const handlePageChange = (page: number) => {
    console.log('[AdminLogs] Changing page to:', page);
    if (scrollContainerRef.current) {
      scrollPositionRef.current = scrollContainerRef.current.scrollTop;
      console.log('[AdminLogs] Saved scroll position:', scrollPositionRef.current);
    }
    setCurrentPage(page);
  };

  const columns: ColumnDef<RowLog>[] = useMemo(
    () => [
      {
        id: 'index',
        header: 'No.',
        meta: { size: '45px' },
        cell: ({ row }) => (
          <span className="text-xs font-medium text-gray-500">
            {(currentPage - 1) * itemsPerPage + row.index + 1}
          </span>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => row.original.name ?? '—',
        meta: { size: '180px' },
      },
      {
        accessorKey: 'email',
        header: 'Email',
        cell: ({ row }) => row.original.email ?? '—',
        meta: { size: '220px' },
      },
      {
        accessorKey: 'timestamp',
        header: 'Time',
        meta: { size: '150px' },
        cell: ({ row }) => (
          <span className="text-xs">
            {moment(row.original.timestamp).format('Do MMM YYYY, h:mm a')}
          </span>
        ),
      },
      {
        accessorKey: 'action',
        header: 'Event',
        meta: { size: '120px' },
        cell: ({ row }) => {
          const action = row.original.action;
          return (
            <span
              className={cn(
                'rounded px-2 py-0.5 text-xs font-medium',
                action === 'LOGIN' ? 'bg-green-100 text-green-700' :
                action === 'LOGOUT' ? 'bg-red-100 text-red-700' :
                action === 'MODEL CHANGED' ? 'bg-blue-100 text-blue-700' :
                action === 'ATTACHED FILE' ? 'bg-gray-100 text-gray-700' :
                'bg-slate-100 text-slate-700'
              )}
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
          const s = statusMap[row.original.userId] || 'Unknown';
          return (
            <span
              className={cn(
                'rounded px-2 py-0.5 text-xs font-medium',
                s === 'Active' ? 'bg-emerald-100 text-emerald-700' :
                s === 'Inactive' ? 'bg-zinc-100 text-zinc-700' :
                'bg-yellow-100 text-yellow-700'
              )}
            >
              {s}
            </span>
          );
        },
      },
      {
        id: 'view',
        header: 'Actions',
        meta: { size: '60px' },
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setSelected(row.original)}
              className="h-8 w-8 rounded-full"
            >
              <Info className="h-4 w-4 text-gray-600" />
            </Button>
          </div>
        ),
      },
    ],
    [statusMap, currentPage, itemsPerPage]
  );

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between border-b border-gray-200 pb-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => (window.location.href = '/c/new')}
            className="rounded-full"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold">System Logs</h1>
        </div>
        {connected && (
          <span className="text-sm text-green-600">Live</span>
        )}
      </div>

      {/* Search with Category Selection */}
      <div className="flex w-full gap-2">
        <SearchBar
          search={search}
          setSearch={(value) => {
            setSearch(value);
            setCurrentPage(1);
            if (value && searchCategory === 'action') {
              setSearchCategory('all');
            }
          }}
          inputRef={searchInputRef}
        />
        <select
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          value={searchCategory === 'action' ? search : ''}
          onChange={(e) => {
            if (e.target.value === '') {
              setSearchCategory('all');
              setSearch('');
            } else {
              setSearchCategory('action');
              setSearch(e.target.value);
            }
            setCurrentPage(1);
          }}
          disabled={loading}
        >
          <option value="">All Events</option>
          <option value="LOGIN">LOGIN</option>
          <option value="LOGOUT">LOGOUT</option>
          <option value="MODEL CHANGED">MODEL CHANGED</option>
          <option value="ATTACHED FILE">ATTACHED FILE</option>
        </select>
      </div>

      {/* Error State */}
      {error && (
        <div className="flex items-center justify-between rounded bg-red-100 p-2 text-red-700">
          <span>{error}</span>
          <Button variant="outline" onClick={refetchLogs}>
            Retry
          </Button>
        </div>
      )}

      {/* Table with Loading Overlay */}
      <div ref={mainContainerRef} className="relative flex-1 min-h-0">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-50 dark:bg-gray-800 dark:bg-opacity-50 z-10">
            <svg className="animate-spin h-5 w-5 text-gray-500" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            </svg>
            <p className="ml-2 text-gray-500">Loading...</p>
          </div>
        )}
        <div ref={scrollContainerRef} className="h-full overflow-auto">
          <DataTable
            columns={columns}
            data={rows.map((r, i) => ({ ...r, id: r._id || i }))}
            className="h-full"
            enableRowSelection={false}
            showCheckboxes={false}
            onDelete={undefined}
          />
        </div>
      </div>
      {rows.length === 0 && !loading && (
        <div className="flex h-40 w-full items-center justify-center">
          <p className="text-gray-500">No matching logs found</p>
        </div>
      )}

      {/* Pagination */}
      <div data-testid="pagination-container" className="flex-shrink-0">
        <Pagination
          page={currentPage}
          limit={itemsPerPage}
          total={total}
          onPageChange={handlePageChange}
          siblingCount={1}
        />
      </div>

      {/* Details Dialog */}
      <AdminLogsDialog selected={selected} onClose={() => setSelected(null)} />
    </div>
  );
}