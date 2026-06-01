import { useState, useEffect, useCallback } from 'react';
import { useAuthContext } from './AuthContext';

export interface AppNotification {
  _id: string;
  userId: string;
  originalQuestion?: string;
  message?: string;
  type?: string;
  isVisited: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function useNotifications() {
  const { token } = useAuthContext();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/notifications', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsVisited = useCallback(
    async (id: string) => {
      if (!token) return;
      try {
        await fetch(`/api/notifications/${id}/visited`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
        });
        // Remove from list immediately when clicked
        setNotifications((prev) => prev.filter((n) => n._id !== id));
      } catch (err) {
        console.error('Failed to mark notification as visited:', err);
      }
    },
    [token],
  );

  const markAllVisited = useCallback(async () => {
    if (!token) return;
    try {
      await fetch('/api/notifications/mark-all-visited', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, isVisited: true })));
    } catch (err) {
      console.error('Failed to mark all notifications as visited:', err);
    }
  }, [token]);

  const unreadCount = notifications.filter((n) => !n.isVisited).length;

  return { notifications, loading, unreadCount, fetchNotifications, markAsVisited, markAllVisited };
}
