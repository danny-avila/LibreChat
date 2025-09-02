import React, { useState } from 'react';
import { useUser } from '../hooks/useUser';

interface Props {
  userId: string | null;
  onClose: () => void;
  onUpdated: () => void;
}

const UserDrawer: React.FC<Props> = ({ userId, onClose, onUpdated }) => {
  const { user, balance, loading, error } = useUser(userId);
  const [role, setRole] = useState('USER');
  const [credits, setCredits] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  React.useEffect(() => {
    if (user) setRole(user.role);
    if (balance?.tokenCredits != null) setCredits(balance.tokenCredits);
  }, [user, balance]);

  if (!userId) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-end z-50">
      <div className="bg-white dark:bg-gray-900 w-full max-w-md h-full p-6 overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">User Detail</h2>
        {loading && <p>Loading…</p>}
        {error && <p className="text-red-600">{error}</p>}
        {user && (
          <>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
                <input disabled value={user.email} className="mt-1 w-full bg-gray-100 dark:bg-gray-800 border-gray-300 rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Role</label>
                <select value={role} onChange={(e)=>setRole(e.target.value)} className="mt-1 w-full border-gray-300 dark:bg-gray-800 rounded-md">
                  <option value="ADMIN">ADMIN</option>
                  <option value="USER">USER</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Token Credits</label>
                <input type="number" value={credits} onChange={(e)=>setCredits(parseInt(e.target.value))} className="mt-1 w-full border-gray-300 dark:bg-gray-800 rounded-md" />
              </div>
            </div>
            <div className="flex justify-between mt-6">
              <button onClick={onClose} className="px-4 py-2 border rounded">Cancel</button>
              <button
                disabled={saving}
                onClick={async () => {
                  if (!user) return;
                  setSaving(true);
                  setSaveError(null);
                  try {
                    // get token
                    const refreshRes = await fetch('/api/auth/refresh', {
                      method: 'POST',
                      credentials: 'include',
                    });
                    const refreshJson = await refreshRes.json().catch(() => ({}));
                    const token = refreshJson?.token;
                    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                    if (token) headers['Authorization'] = `Bearer ${token}`;

                    // update role
                    await fetch(`/admin/users/${user._id}`, {
                      method: 'PUT',
                      headers,
                      credentials: 'include',
                      body: JSON.stringify({ role }),
                    });

                    // update balance
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
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
            {saveError && <p className="text-red-600 mt-2">{saveError}</p>}
          </>
        )}
      </div>
    </div>
  );
};

export default UserDrawer; 