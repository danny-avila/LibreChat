import { useState, useCallback, useEffect } from 'react';
import { useToastContext } from '@librechat/client';
import { useAuthContext } from '~/hooks';
import type { Candidate, AddCandidateInput } from '~/components/HiringPanel/types';

export function useHiringCandidates() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const { token } = useAuthContext();
  const { showToast } = useToastContext();

  const refetch = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/hiring/candidates', {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok) {
        setCandidates(data);
      } else {
        showToast({ message: data.error || 'Failed to load candidates', status: 'error' });
      }
    } catch {
      showToast({ message: 'Failed to load candidates', status: 'error' });
    } finally {
      setLoading(false);
    }
  }, [token, showToast]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const addCandidate = useCallback(
    async (input: AddCandidateInput): Promise<Candidate> => {
      const res = await fetch('/api/hiring/candidates', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast({ message: data.error || 'Failed to add candidate', status: 'error' });
        throw new Error(data.error);
      }
      setCandidates((prev) => [data, ...prev]);
      return data;
    },
    [token, showToast],
  );

  const updateCandidate = useCallback(
    async (id: string, patch: Partial<Candidate>): Promise<Candidate> => {
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
      setCandidates((prev) => prev.map((c) => (c._id === id ? data : c)));
      return data;
    },
    [token, showToast],
  );

  return { candidates, loading, addCandidate, updateCandidate, refetch };
}
