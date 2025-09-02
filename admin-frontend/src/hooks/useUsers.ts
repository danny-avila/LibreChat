import { useEffect, useState } from 'react';

export interface User {
  _id: string;
  email: string;
  role: string;
  name?: string;
  username?: string;
  tokenCredits?: number;
  createdAt?: string;
}

interface UsersResponse {
  users: User[];
  total: number;
  page: number;
  limit: number;
}

export function useUsers() {
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState('');

  const fetchUsers = async () => {
    try {
      // Step 1: ensure we have auth token
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

      // Step 2: call users endpoint
      const query = new URLSearchParams();
      query.append('page', page.toString());
      query.append('limit', limit.toString());
      if (search) query.append('search', search);

      const res = await fetch(`/admin/users?${query.toString()}`, {
        headers,
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Failed to load users (${res.status})`);
      const json: UsersResponse = await res.json();
      setData(json);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search]);

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  return {
    ...data,
    loading,
    error,
    page,
    totalPages,
    setPage,
    search,
    setSearch,
    refresh: fetchUsers,
  };
} 