import React, { useState } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { X } from 'lucide-react';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

const CreateUserModal: React.FC<Props> = ({ onClose, onCreated }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'USER'>('USER');
  const [tokenCreditsStr, setTokenCreditsStr] = useState('0');
  const [tokenCredits, setTokenCredits] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const refreshRes = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      const refreshJson = await refreshRes.json().catch(() => ({}));
      const token = refreshJson?.token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/admin/users', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ email, password, role }),
      });
      if (!res.ok) throw new Error(`Create failed (${res.status})`);

      const created = await res.json().catch(() => null);

      // If credits were specified, set them via balance endpoint
      if (created?._id && tokenCredits > 0) {
        await fetch(`/admin/users/${created._id}/balance`, {
          method: 'PUT',
          headers,
          credentials: 'include',
          body: JSON.stringify({ tokenCredits }),
        });
      }

      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-md rounded-lg bg-white dark:bg-gray-800 shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <DialogTitle className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              Create User
            </DialogTitle>
            <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              <X className="w-5 h-5" />
            </button>
          </div>

          {error && <p className="text-red-600 mb-2">{error}</p>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full border border-gray-300 dark:bg-gray-700 dark:border-gray-600 rounded-md text-sm px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full border border-gray-300 dark:bg-gray-700 dark:border-gray-600 rounded-md text-sm px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
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
                value={tokenCreditsStr}
                onChange={(e) => {
                  setTokenCreditsStr(e.target.value);
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v)) setTokenCredits(v);
                }}
                className="mt-1 w-full border border-gray-300 dark:bg-gray-700 dark:border-gray-600 rounded-md text-sm px-3 py-2"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 border rounded-md text-sm">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 bg-green-500 text-white rounded-md text-sm disabled:opacity-50 hover:bg-green-600">
                {saving ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  );
};

export default CreateUserModal; 