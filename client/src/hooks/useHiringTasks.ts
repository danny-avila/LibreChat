import { useState, useCallback, useEffect } from 'react';
import { useToastContext } from '@librechat/client';
import { useAuthContext } from '~/hooks';
import type { Task, CreateTaskInput } from '~/components/HiringPanel/types';

export function useHiringTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const { token } = useAuthContext();
  const { showToast } = useToastContext();

  const refetch = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/hiring/tasks', {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok) {
        setTasks(data);
      } else {
        showToast({ message: data.error || 'Failed to load tasks', status: 'error' });
      }
    } catch {
      showToast({ message: 'Failed to load tasks', status: 'error' });
    } finally {
      setLoading(false);
    }
  }, [token, showToast]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createTask = useCallback(
    async (input: CreateTaskInput): Promise<Task> => {
      const res = await fetch('/api/hiring/tasks', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast({ message: data.error || 'Failed to create task', status: 'error' });
        throw new Error(data.error);
      }
      setTasks((prev) => [data, ...prev]);
      return data;
    },
    [token, showToast],
  );

  const updateTask = useCallback(
    async (id: string, patch: Partial<Task>): Promise<Task> => {
      const res = await fetch(`/api/hiring/tasks/${id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast({ message: data.error || 'Failed to update task', status: 'error' });
        throw new Error(data.error);
      }
      setTasks((prev) => prev.map((t) => (t._id === id ? data : t)));
      return data;
    },
    [token, showToast],
  );

  return { tasks, loading, createTask, updateTask, refetch };
}
