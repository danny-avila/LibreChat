import { useEffect, useState, useRef, useCallback } from 'react';

export function useAdminLogs(limit: number = 10, page: number = 1) {
  const esRef = useRef<EventSource | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [connected, setConnected] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async (currentPage: number, currentLimit: number) => {
    const token = localStorage.getItem('token');
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
      const resp = await fetch(
        `${API_BASE}/api/user-activity/logs?all=true`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      
      if (!resp.ok) {
        throw new Error(`HTTP error! status: ${resp.status}`);
      }

      const json = await resp.json();
      if (json?.success && json?.data) {
        setLogs(json.data.logs || []);
        setTotal(json.data.total || 0);
      } else {
        throw new Error(json?.message || 'Failed to fetch logs');
      }
    } catch (e) {
      console.error('[AdminLogs] ❌ HTTP fetch failed:', e);
      setError(e instanceof Error ? e.message : 'Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  }, []);

  // Setup EventSource for real-time updates
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
    const es = new EventSource(`${API_BASE}/api/user-activity/stream?token=${token}`);
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.addEventListener('activity', (evt) => {
      if (!evt.data) return;
      try {
        const msg = JSON.parse(evt.data);
        if (msg.success && msg.data && msg.data.logs) {
          // Only add new logs if we're on the first page
          // This prevents disrupting pagination on other pages
          if (page === 1) {
            setLogs((prev) => {
              const newLogs = [...msg.data.logs, ...prev];
              // Remove duplicates and limit to current page size
              const uniqueLogs = Array.from(new Set(newLogs.map((log: any) => log._id)))
                .map((id) => newLogs.find((log: any) => log._id === id))
                .slice(0, limit);
              return uniqueLogs;
            });
            
            // Update total count
            setTotal((prevTotal) => prevTotal + msg.data.logs.length);
          }
        }
      } catch (e) {
        console.error('[AdminLogs] ❌ Failed to parse activity:', e);
      }
    });

    return () => {
      es.close();
    };
  }, [page, limit]);

  // Fetch logs when page or limit changes
  useEffect(() => {
    fetchLogs(page, limit);
  }, [page, limit, fetchLogs]);

  const refetchLogs = useCallback(() => {
    fetchLogs(page, limit);
  }, [page, limit, fetchLogs]);

  return { 
    logs, 
    connected, 
    total, 
    loading, 
    error, 
    refetchLogs 
  };
}