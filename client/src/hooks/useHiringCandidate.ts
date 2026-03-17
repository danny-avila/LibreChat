import { useState, useCallback, useEffect } from 'react';
import { useToastContext } from '@librechat/client';
import { useAuthContext } from '~/hooks';
import type { Candidate } from '~/components/HiringPanel/types';

export function useHiringCandidate(id: string | undefined) {
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(false);
  const { token } = useAuthContext();
  const { showToast } = useToastContext();

  const refetch = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/hiring/candidates/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok) {
        setCandidate(data);
      } else {
        showToast({ message: data.error || 'Failed to load candidate', status: 'error' });
      }
    } catch {
      showToast({ message: 'Failed to load candidate', status: 'error' });
    } finally {
      setLoading(false);
    }
  }, [token, id, showToast]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const update = useCallback(
    async (patch: Partial<Candidate>): Promise<Candidate | null> => {
      if (!token || !id) return null;
      const res = await fetch(`/api/hiring/candidates/${id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast({ message: data.error || 'Failed to update candidate', status: 'error' });
        throw new Error(data.error);
      }
      setCandidate(data);
      showToast({ message: 'Saved', status: 'success' });
      return data;
    },
    [token, id, showToast],
  );

  return { candidate, loading, update, refetch };
}
