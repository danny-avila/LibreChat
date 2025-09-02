import { useEffect, useState } from 'react';

interface Stats {
  totalUsers: number;
  adminUsers: number;
  recentUsers: number;
}

export function useUserStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      const refreshRes = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      const refreshJson = await refreshRes.json().catch(() => ({}));
      const token = refreshJson?.token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/admin/users/stats', { headers, credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to load stats (${res.status})`);
      setStats(await res.json());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStats(); }, []);

  return { stats, loading, error, refresh: fetchStats };
} 