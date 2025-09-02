import { useEffect, useState } from 'react';
import { User } from './useUsers';

interface Balance {
  tokenCredits?: number;
  autoRefillEnabled?: boolean;
  refillIntervalValue?: number;
  refillIntervalUnit?: string;
  refillAmount?: number;
}

export function useUser(userId: string | null) {
  const [user, setUser] = useState<User | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    const fetchDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        // Get token
        const refreshRes = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        });
        const refreshJson = await refreshRes.json().catch(() => ({}));
        const token = refreshJson?.token;
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const [userRes, balRes] = await Promise.all([
          fetch(`/admin/users/${userId}`, { headers, credentials: 'include' }),
          fetch(`/admin/users/${userId}/balance`, { headers, credentials: 'include' }),
        ]);
        if (!userRes.ok) throw new Error(`User fetch failed (${userRes.status})`);
        const userJson = await userRes.json();
        setUser(userJson);
        if (balRes.ok) {
          setBalance(await balRes.json());
        } else if (balRes.status === 404) {
          setBalance({ tokenCredits: 0 });
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [userId]);

  return { user, balance, loading, error, setUser, setBalance };
} 