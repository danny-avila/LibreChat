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
import { useAdminLogs}  from './useAdmin';
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
  const [statusMap, setStatusMap] = useState<Record<string, 'Active' | 'Inactive' | 'Unknown'>>({});
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchCategory, setSearchCategory] = useState<'all' | 'action' | 'email' | 'name'>('all');
  const itemsPerPage = 10;

  const { logs, connected: isConnected } = useAdminLogs();

  // Process logs from useAdminLogs
  useEffect(() => {
    if (logs.length > 0) {
      const normalized = logs.map((log: any) => toRow(log, userCache));
      setRows((prev) => {
        const newRows = [...normalized, ...prev];
        const uniqueRows = newRows.filter((row, i, self) => i === self.findIndex((r) => r._id === row._id));
        setTimeout(() => recalculateAllStatuses(uniqueRows), 0);
        return uniqueRows;
      });
      normalized.forEach((log) => applyStatusUpdate(log));
      setConnected(isConnected);
    }
  }, [logs, isConnected]);

  // Filter logs based on search term and category
  useEffect(() => {
    const searchLower = search.toLowerCase().trim();
    setFilteredRows(
      searchLower
        ? rows.filter((log) => {
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
          })
        : rows
    );
    setCurrentPage(1);
  }, [search, searchCategory, rows]);

  // Adjust table height and reset page if needed
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

  // Calculate user status
  const calculateUserStatus = (userId: string, allLogs: RowLog[]): 'Active' | 'Inactive' | 'Unknown' => {
    if (!userId) return 'Unknown';
    const userLogs = allLogs
      .filter((log) => log.userId === userId && (log.action === 'LOGIN' || log.action === 'LOGOUT'))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return userLogs.length === 0 ? 'Unknown' : userLogs[0].action === 'LOGIN' ? 'Active' : 'Inactive';
  };

  const getStatus = (row: RowLog): 'Active' | 'Inactive' | 'Unknown' =>
    statusMap[row.userId] || calculateUserStatus(row.userId, rows);

  // Recalculate all user statuses
  const recalculateAllStatuses = (allLogs: RowLog[]) => {
    const newStatusMap: Record<string, 'Active' | 'Inactive' | 'Unknown'> = {};
    const uniqueUserIds = [...new Set(allLogs.map((log) => log.userId).filter(Boolean))];
    uniqueUserIds.forEach((userId) => {
      newStatusMap[userId] = calculateUserStatus(userId, allLogs);
    });
    setStatusMap(newStatusMap);
  };

  // Apply status update for a single user
  const applyStatusUpdate = (log: RowLog) => {
    if (!log.userId) return;
    setStatusMap((prev) => ({
      ...prev,
      [log.userId]: log.action === 'LOGIN' ? 'Active' : log.action === 'LOGOUT' ? 'Inactive' : prev[log.userId] || 'Unknown',
    }));
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
          const s = getStatus(row.original);
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
    [statusMap, currentPage, itemsPerPage, rows]
  );

  const handlePageChange = (page: number) => setCurrentPage(page);

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
      </div>

      {/* Search with Category Selection */}
      <div className="flex w-full gap-2">
        <SearchBar
          search={search}
          setSearch={setSearch}
          onSearch={() => {}}
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
          }}
        >
          <option value="">All Events</option>
          <option value="LOGIN">LOGIN</option>
          <option value="LOGOUT">LOGOUT</option>
          <option value="MODEL CHANGED">MODEL CHANGED</option>
          <option value="ATTACHED FILE">ATTACHED FILE</option>
        </select>
      </div>

      {/* Table */}
      <div ref={mainContainerRef}>
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
      </div>
      {filteredRows.length === 0 && (
        <div className="flex h-40 w-full items-center justify-center">
          <p className="text-gray-500">No matching logs found</p>
        </div>
      )}

      {/* Pagination */}
      {filteredRows.length > itemsPerPage && (
        <Pagination
          page={currentPage}
          limit={itemsPerPage}
          total={filteredRows.length}
          onPageChange={handlePageChange}
          data={filteredRows}
          siblingCount={1}
        />
      )}

      {/* Details Dialog */}
      <AdminLogsDialog selected={selected} onClose={() => setSelected(null)} />
    </div>
  );
}