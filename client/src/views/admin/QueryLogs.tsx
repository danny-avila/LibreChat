import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { EventSourcePolyfill } from 'event-source-polyfill';
import DataTable from '~/components/ui/DataTable';
import { SearchBar } from '~/views/admin/AdminSearchBar';
import { Pagination } from '~/components/ui/Pagination';
import { Button } from '~/components/ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/Dialog';
import { ArrowLeft, Info } from 'lucide-react';
import { debounce } from 'lodash';
import moment from 'moment';
import QueryLogDetailsDialog from './QueryLogDetailsDialog';

interface QueryLog {
  _id: string;
  user: { name?: string; email?: string; id?: string };
  role: 'user' | 'ai';
  model: string | null;
  text: string;
  tokenCount: number;
  createdAt: string;
}

function toRow(data: any): QueryLog {
  return {
    _id: data.messageId || `${data.createdAt}-${Math.random()}`,
    user: data.user || { id: 'unknown' },
    role: data.role || 'user',
    model: data.model || null,
    text: data.text || '',
    tokenCount: data.tokenCount || 0,
    createdAt: data.createdAt,
  };
}

export function useQueryLogs(limit: number = 10, page: number = 1, search: string = '') {
  const esRef = useRef<EventSourcePolyfill | null>(null);
  const [logs, setLogs] = useState<QueryLog[]>([]);
  const [connected, setConnected] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialFetchComplete, setIsInitialFetchComplete] = useState(false);

  const fetchLogs = useCallback(
    debounce(async (currentPage: number, currentLimit: number, currentSearch: string) => {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('No authentication token found');
        setLoading(false);
        setLogs([]);
        return;
      }

      setLoading(true);
      setError(null);
      setLogs([]);
      setIsInitialFetchComplete(false);

      const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: currentLimit.toString(),
      });
      if (currentSearch) params.append('search', currentSearch);

      if (esRef.current) {
        esRef.current.close();
      }
      const es = new EventSourcePolyfill(`${API_BASE}/api/logs/queries?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        heartbeatTimeout: 60000,
      });
      esRef.current = es;

      let tempLogs: QueryLog[] = [];

      es.onopen = () => {
        console.log('[useQueryLogs] SSE connected');
        setConnected(true);
      };

      es.onmessage = (event) => {
        if (!event.data || event.data.trim() === '') return;

        try {
          const data = JSON.parse(event.data);

          if (data.type === 'heartbeat') return;

          if (data.type === 'init') {
            setTotal(data.total || 0);
            if (data.count === 0) {
              setLoading(false);
              setIsInitialFetchComplete(true);
            }
            return;
          }

          if (data.type === 'historical_complete') {
            setLogs(tempLogs.reverse());
            setIsInitialFetchComplete(true);
            setLoading(false);
            return;
          }

          if (data.event === 'historical_log') {
            if (typeof data.createdAt !== 'string') return;
            const logData = toRow(data);
            tempLogs.push(logData);
          }

          if (data.event === 'realtime_log') {
            if (typeof data.createdAt !== 'string') return;
            const logData = toRow(data);
            
            // Only show real-time logs on the first page
            if (currentPage === 1) {
              setLogs((prevLogs) => {
                // Add the new log at the beginning
                const newLogs = [logData, ...prevLogs];
                // Keep only the limit number of logs to maintain pagination
                return newLogs.slice(0, currentLimit);
              });
              // Increment total count for new real-time logs
              setTotal((prevTotal) => prevTotal + 1);
            }
          }

          if (data.event === 'error') {
            setError(data.message || 'Unknown error from server');
          }
        } catch (e) {
          console.error('[useQueryLogs] Error parsing SSE data:', e, 'Raw:', event.data);
        }
      };

      es.onerror = () => {
        console.error('[useQueryLogs] SSE connection error');
        setError('Failed to maintain real-time logs connection.');
        es.close();
        esRef.current = null;
        setConnected(false);
        setLoading(false);
      };
    }, 50),
    []
  );

  useEffect(() => {
    return () => {
      (fetchLogs as any)?.cancel?.();
    };
  }, [fetchLogs]);

  useEffect(() => {
    console.log('[useQueryLogs] Triggering fetch for:', { page, limit, search });
    setIsInitialFetchComplete(false);
    fetchLogs(page, limit, search);
  }, [page, limit, search, fetchLogs]);

  useEffect(() => {
    return () => {
      if (esRef.current) {
        console.log('[useQueryLogs] Cleaning up SSE');
        esRef.current.close();
        esRef.current = null;
      }
      setConnected(false);
    };
  }, []);

  return { logs, connected, total, loading, error };
}

const QueryLogs: React.FC = () => {
  const navigate = useNavigate();
  const mainContainerRef = useRef<HTMLDivElement>(null);

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<QueryLog | null>(null);

  const limit = 10;

  const { logs, connected, total, loading, error } = useQueryLogs(limit, page, search);

  const handleSearch = (searchTerm: string) => {
    setSearch(searchTerm);
    setPage(1);
  };

  // Adjust container height
  useEffect(() => {
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
  }, [logs, page]);

  // Columns
  const columns = useMemo(
    () => [
      {
        id: 'index',
        header: 'No.',
        meta: { size: '60px' },
        cell: ({ row }: any) => (
          <span className="text-xs font-medium text-gray-500">
            {(page - 1) * limit + row.index + 1}
          </span>
        ),
      },
      {
        accessorKey: 'user.name',
        header: 'Name',
        meta: { size: '180px' },
        cell: ({ row }: any) => (
          <span className="text-sm font-medium text-gray-800">
            {row.original.user?.name ?? 'Unknown'}
          </span>
        ),
      },
      {
        accessorKey: 'user.email',
        header: 'Email',
        meta: { size: '220px' },
        cell: ({ row }: any) => (
          <span className="text-xs text-gray-600">{row.original.user?.email ?? 'N/A'}</span>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: 'Timestamp',
        meta: { size: '180px' },
        cell: ({ row }: any) => (
            <span className="text-xs text-gray-500">
              {row.original.createdAt
                ? moment(row.original.createdAt).format('Do MMM YY, h:mm:ss a')
                : '—'}
            </span>
          ),
          
      },
      {
        accessorKey: 'role',
        header: 'Role',
        meta: { size: '120px' },
        cell: ({ row }: any) => {
          const isAI = row.original.role === 'ai';
          return (
            <span
              className={`rounded px-2 py-0.5 text-xs font-semibold ${
                isAI ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
              }`}
            >
              {isAI ? 'AI' : 'User'}
            </span>
          );
        },
      },
      {
        accessorKey: 'model',
        header: 'Model',
        meta: { size: '150px' },
        cell: ({ row }: any) => (
          <span className="text-xs text-gray-700">{row.original.model ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'tokenCount',
        header: 'Tokens',
        meta: { size: '100px' },
        cell: ({ row }: any) => (
          <span className="text-xs font-medium text-gray-600">
            {row.original.tokenCount ?? 0}
          </span>
        ),
      },
      {
        id: 'info',
        header: 'Info',
        meta: { size: '80px' },
        cell: ({ row }: any) => (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setSelectedLog(row.original);
              setDialogOpen(true);
            }}
            className="h-8 w-8 rounded-full"
          >
            <Info className="h-4 w-4 text-blue-600" />
          </Button>
        ),
      },
    ],
    [page, limit]
  );

  return (
  <div className="flex h-full flex-col px-6 py-4 sm:py-6">
    {/* Header */}
    <div className="mb-4 flex items-center justify-between border-b border-border-light pb-3">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/c/new')}
          className="rounded-full hover:bg-surface-secondary"
          aria-label="Back to Admin Dashboard"
        >
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </Button>
        <h2 className="text-lg font-semibold text-foreground sm:text-2xl">
          Query Logs
        </h2>
      </div>
    </div>

    {/* Error Message */}
    {error && (
      <div className="mb-4 rounded-md border-l-4 border-red-500 bg-red-100 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
        {error}
      </div>
    )}

    {/* Search */}
    <div className="mb-4">
      <SearchBar
        search={search}
        setSearch={handleSearch}
        placeholder="Search by user name, email, or model"
      />
    </div>

    {/* Loading Spinner */}
    {loading && (
      <div className="flex items-center justify-center py-6">
        <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-500" />
        <span className="ml-3 text-sm text-muted-foreground">Loading query logs...</span>
      </div>
    )}

    {/* Empty State */}
    {!loading && logs.length === 0 && (
      <div className="flex flex-1 items-center justify-center text-center text-muted-foreground">
        <p className="text-base">
          {search ? 'No logs match your search.' : 'No query logs available.'}
        </p>
      </div>
    )}

    {/* Data Table */}
    {!loading && logs.length > 0 && (
      <div className="flex flex-1 flex-col gap-4">
        <div ref={mainContainerRef} className="min-h-[400px] flex-grow">
          <DataTable
            columns={columns}
            data={logs.map((log, i) => ({ ...log, id: log._id || `${i}` }))}
            className="h-full"
            enableRowSelection={false}
            showCheckboxes={false}
            isLoading={false}
          />
        </div>

        {/* Pagination */}
        <Pagination
          page={page}
          limit={limit}
          total={total}
          onPageChange={setPage}
        />
      </div>
    )}

    {/* Log Detail Dialog */}
    <QueryLogDetailsDialog dialogOpen={dialogOpen}setDialogOpen={setDialogOpen}selectedLog={selectedLog}/>
  </div>
);

};

export default QueryLogs;