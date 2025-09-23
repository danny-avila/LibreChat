import { useEffect, useState, useRef, useCallback } from 'react';
import { debounce } from 'lodash';

export function useAdminLogs(limit: number = 10, page: number = 1, search: string = '', action: string = '') {
  const esRef = useRef<EventSource | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [connected, setConnected] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialFetchComplete, setIsInitialFetchComplete] = useState(false);

  const fetchLogs = useCallback(
    debounce(async (currentPage: number, currentLimit: number, currentSearch: string, currentAction: string) => {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('No authentication token found');
        setLoading(false);
        setLogs([]);
        return;
      }

      setLoading(true);
      setError(null);
      setLogs([]); // Clear logs to prevent showing stale data

      try {
        const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
        const params = new URLSearchParams({
          page: currentPage.toString(),
          limit: currentLimit.toString(),
          includeTokenUsage: 'true',
        });
        if (currentSearch) params.append('search', currentSearch);
        if (currentAction) params.append('action', currentAction);

        const url = `${API_BASE}/api/user-activity/logs?${params}`;
        console.log('[useAdminLogs] Fetching:', url);
        const resp = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!resp.ok) {
          throw new Error(`HTTP error! status: ${resp.status}`);
        }

        const json = await resp.json();
        console.log('[useAdminLogs] API Response:', {
          page: currentPage,
          logsCount: json?.data?.logs?.length || 0,
          logIds: json?.data?.logs?.map((log: any) => log._id) || [],
          totalCount: json?.data?.pagination?.totalCount || 0,
        });
        if (json?.success && json?.data) {
          setLogs(json.data.logs || []);
          // Normalize total to align with pagination
          const normalizedTotal = Math.floor((json.data.pagination?.totalCount || 0) / limit) * limit;
          setTotal(normalizedTotal);
          setIsInitialFetchComplete(true);
        } else {
          throw new Error(json?.message || 'Failed to fetch logs');
        }
      } catch (e) {
        console.error('[useAdminLogs] ❌ HTTP fetch failed:', e);
        setError(e instanceof Error ? e.message : 'Failed to fetch logs');
      } finally {
        setLoading(false);
      }
    }, 50),
    []
  );

  // Cancel pending debounced fetch on unmount to avoid setState on unmounted component
  useEffect(() => {
    return () => {
      (fetchLogs as any)?.cancel?.();
    };
  }, [fetchLogs]);

  // Fetch logs when page, limit, search, or action changes
  useEffect(() => {
    console.log('[useAdminLogs] Triggering fetch for:', { page, limit, search, action });
    setIsInitialFetchComplete(false);
    fetchLogs(page, limit, search, action);
  }, [page, limit, search, action, fetchLogs]);

  // Setup EventSource for real-time updates
  useEffect(() => {
    if (page !== 1 || search || action) {
      if (esRef.current) {
        console.log('[useAdminLogs] Closing SSE due to page/filter change');
        esRef.current.close();
        esRef.current = null;
        setConnected(false);
      }
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) return;

    const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
    const es = new EventSource(`${API_BASE}/api/user-activity/stream?token=${token}`);
    esRef.current = es;

    es.onopen = () => {
      console.log('[useAdminLogs] SSE connected');
      setConnected(true);
    };
    es.onerror = () => {
      console.log('[useAdminLogs] SSE error');
      setConnected(false);
      es.close();
      esRef.current = null;
    };

    es.addEventListener('activity', (evt) => {
      if (!evt.data || !isInitialFetchComplete) {
        console.log('[useAdminLogs] SSE skipped: initial fetch not complete');
        return;
      }
      try {
        const msg = JSON.parse(evt.data);
        console.log('[useAdminLogs] SSE Update:', {
          logsCount: msg?.data?.logs?.length || 0,
          logIds: msg?.data?.logs?.map((log: any) => log._id) || [],
        });
        if (msg.success && msg.data && msg.data.logs) {
          setLogs((prev) => {
            const latestLogTime = prev[0]?.timestamp ? new Date(prev[0].timestamp).getTime() : 0;
            const newLogs = msg.data.logs.filter(
              (log: any) => new Date(log.timestamp).getTime() > latestLogTime
            );
            if (!newLogs.length) {
              console.log('[useAdminLogs] SSE skipped: no newer logs');
              return prev;
            }
            const updatedLogs = [...newLogs, ...prev];
            const uniqueLogs = Array.from(new Set(updatedLogs.map((log: any) => log._id)))
              .map((id) => updatedLogs.find((log: any) => log._id === id))
              .slice(0, limit);
            console.log('[useAdminLogs] SSE appended logs, new length:', uniqueLogs.length);
            return uniqueLogs;
          });
          // Do NOT increment total here
          console.log('[useAdminLogs] Skipping total update for activity event:', msg.data);
        }
      } catch (e) {
        console.error('[useAdminLogs] ❌ Failed to parse activity:', e);
      }
    });

    return () => {
      console.log('[useAdminLogs] Cleaning up SSE');
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      setConnected(false);
    };
  }, [page, limit, search, action, isInitialFetchComplete]);

  const refetchLogs = useCallback(() => {
    console.log('[useAdminLogs] Refetching logs for:', { page, limit, search, action });
    fetchLogs(page, limit, search, action);
  }, [page, limit, search, action, fetchLogs]);

  return {
    logs,
    connected,
    total,
    loading,
    error,
    refetchLogs,
  };
}