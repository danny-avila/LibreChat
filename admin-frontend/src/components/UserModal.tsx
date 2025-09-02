import React, { useState, useEffect } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { X } from 'lucide-react';
import { useUser } from '../hooks/useUser';

interface Props {
  userId: string | null;
  onClose: () => void;
  onUpdated: () => void;
}

export const UserModal: React.FC<Props> = ({ userId, onClose, onUpdated }) => {
  const { user, balance, loading, error } = useUser(userId);
  const [role, setRole] = useState('USER');
  const [credits, setCredits] = useState(0);
  const [creditsStr, setCreditsStr] = useState('0');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (user) setRole(user.role);
    if (balance?.tokenCredits != null) {
      setCredits(balance.tokenCredits);
      setCreditsStr(balance.tokenCredits.toString());
    }
  }, [user, balance]);

  if (!userId) return null;

  return (
    <Dialog open={!!userId} onClose={onClose} className="relative z-50">
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/40" aria-hidden="true" />

      {/* Centered panel */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-md rounded-lg bg-white dark:bg-gray-800 shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <DialogTitle className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              Edit User
            </DialogTitle>
            <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              <X className="w-5 h-5" />
            </button>
          </div>

          {loading && <p>Loading…</p>}
          {error && <p className="text-red-600">{error}</p>}
          {saveError && <p className="text-red-600 mb-2">{saveError}</p>}

          {user && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!user) return;
                setSaving(true);
                setSaveError(null);
                try {
                  const refreshRes = await fetch('/api/auth/refresh', {
                    method: 'POST',
                    credentials: 'include',
                  });
                  const refreshJson = await refreshRes.json().catch(() => ({}));
                  const token = refreshJson?.token;
                  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                  if (token) headers['Authorization'] = `Bearer ${token}`;

                  await fetch(`/admin/users/${user._id}`, {
                    method: 'PUT',
                    headers,
                    credentials: 'include',
                    body: JSON.stringify({ role }),
                  });

                  await fetch(`/admin/users/${user._id}/balance`, {
                    method: 'PUT',
                    headers,
                    credentials: 'include',
                    body: JSON.stringify({ tokenCredits: credits }),
                  });

                  onUpdated();
                } catch (err) {
                  setSaveError((err as Error).message);
                } finally {
                  setSaving(false);
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
                <input
                  disabled
                  value={user.email}
                  className="mt-1 w-full border border-gray-300 bg-gray-100 dark:bg-gray-700 dark:border-gray-600 rounded-md text-sm px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="mt-1 w-full border border-gray-300 dark:bg-gray-700 dark:border-gray-600 rounded-md text-sm px-3 py-2"
                >
                  <option value="ADMIN">ADMIN</option>
                  <option value="USER">USER</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Token Credits</label>
                <input
                  type="number"
                  value={creditsStr}
                  onChange={(e) => {
                    setCreditsStr(e.target.value);
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) {
                      setCredits(val);
                    }
                  }}
                  className="mt-1 w-full border border-gray-300 dark:bg-gray-700 dark:border-gray-600 rounded-md text-sm px-3 py-2"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={onClose} className="px-4 py-2 border rounded-md text-sm">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!user) return;
                    if (!confirm('Delete this user?')) return;
                    setSaving(true);
                    try {
                      const refreshRes = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
                      const refreshJson = await refreshRes.json().catch(() => ({}));
                      const token = refreshJson?.token;
                      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                      if (token) headers['Authorization'] = `Bearer ${token}`;
                      await fetch(`/admin/users/${user._id}`, { method: 'DELETE', headers, credentials: 'include' });
                      onUpdated();
                    } catch (err) {
                      setSaveError((err as Error).message);
                    } finally {
                      setSaving(false);
                    }
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded-md text-sm disabled:opacity-50"
                >
                  Delete
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-green-500 text-white rounded-md text-sm disabled:opacity-50 hover:bg-green-600"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  );
};