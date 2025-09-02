import React, { useState, useEffect } from 'react';
import { formatNumber } from '../utils/helpers';
import SettingToggle from './SettingToggle';
import { useUsers } from '../hooks/useUsers';
import { User } from '../hooks/useUsers';
import { UserModal } from './UserModal';
import CreateUserModal from './CreateUserModal';
import { useUserStats } from '../hooks/useUserStats';

const TableHeader = () => (
  <thead className="bg-gray-50 dark:bg-gray-800">
    <tr>
      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Email</th>
      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Role</th>
      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Credits</th>
      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Username</th>
      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Created</th>
    </tr>
  </thead>
);

const UserRow: React.FC<{ user: User }> = ({ user }) => (
  <tr className="border-b border-gray-200 dark:border-gray-700">
    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{user.email}</td>
    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{user.role}</td>
    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{formatNumber(user.tokenCredits)}</td>
  </tr>
);

interface UsersSectionProps {
  values: Record<string, unknown>;
  saving: boolean;
  onUpdateSetting: (key: string, value: unknown) => void;
}

const UsersSection: React.FC<UsersSectionProps> = ({ values, saving, onUpdateSetting }) => {
  const {
    users = [],
    loading,
    error,
    refresh,
    page,
    totalPages,
    setPage,
    search,
    setSearch,
  } = useUsers();
  const { stats } = useUserStats();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // local state for numeric inputs with step selector
  const [stepSize, setStepSize] = useState<number>(1000);

  const startBalance = (values['balance.startBalance'] as number) ?? 0;
  const balanceEnabled = (values['balance.enabled'] as boolean) ?? false;
  const refillEnabled = (values['balance.autoRefillEnabled'] as boolean) ?? false;
  const refillAmount = (values['balance.refillAmount'] as number) ?? 0;
  const refillValue = (values['balance.refillIntervalValue'] as number) ?? 1;
  const refillUnit = (values['balance.refillIntervalUnit'] as string) ?? 'days';

  // debounce search input
  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  return (
    <section id="users" className="mb-12">
      <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">Users</h2>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="p-4 rounded-lg bg-green-100 dark:bg-gray-800">
            <p className="text-sm text-gray-600 dark:text-gray-300">Total Users</p>
            <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{stats.totalUsers}</p>
          </div>
          <div className="p-4 rounded-lg bg-green-100 dark:bg-gray-800">
            <p className="text-sm text-gray-600 dark:text-gray-300">Admins</p>
            <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{stats.adminUsers}</p>
          </div>
          <div className="p-4 rounded-lg bg-green-100 dark:bg-gray-800">
            <p className="text-sm text-gray-600 dark:text-gray-300">Recent (7d)</p>
            <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{stats.recentUsers}</p>
          </div>
        </div>
      )}
      {/* Search & create */}
      <div className="mb-4 flex items-center gap-3">
        <input
          type="text"
          placeholder="Search users…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full md:w-64 px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-800 dark:border-gray-700"
        />
        <button
          onClick={() => setCreateOpen(true)}
          className="ml-auto px-3 py-2 bg-green-500 text-white text-sm rounded-md hover:bg-green-600"
        >
          New User
        </button>
      </div>

      {/* Users table */}
      {loading && <p>Loading users…</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <TableHeader />
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {users.map((u) => (
                <tr key={u._id} className="cursor-pointer hover:bg-gray-50" onClick={()=>setSelectedId(u._id)}>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{u.email}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{u.role}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{formatNumber(u.tokenCredits)}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{u.username ?? '—'}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{new Date(u.createdAt as any).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center mt-4 gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                Prev
              </button>
              {Array.from({ length: totalPages }).map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setPage(idx + 1)}
                  className={`px-3 py-1 border rounded ${page === idx + 1 ? 'bg-green-500 text-white' : ''}`}
                >
                  {idx + 1}
                </button>
              ))}
              <button
                disabled={page === totalPages}
                onClick={() => setPage(page + 1)}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
      {selectedId && (
        <UserModal
          userId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdated={() => {
            setSelectedId(null);
            refresh();
          }}
        />
      )}

      {createOpen && (
        <CreateUserModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            refresh();
          }}
        />
      )}

      {/* User management configuration card */}
      <div className="mt-6 p-4 border border-gray-200 rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700">
        {/* Token balance system - Level 0 toggle */}
        <SettingToggle
          label="Enable Token Balance System"
          description="Track and restrict token usage per user"
          value={balanceEnabled}
          disabled={saving}
          onChange={(v) => onUpdateSetting('balance.enabled', v)}
        />

        {balanceEnabled && (
          <div className="pl-6 border-l border-gray-200 dark:border-gray-700 mt-4 space-y-4">
            {/* Units & Start balance */}
            <div className="flex flex-wrap md:flex-nowrap items-end gap-4">
              {/* Units selector */}
              <label className="flex flex-col text-sm">
                Units
                <select
                  className="mt-1 w-40 px-2 py-1 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600"
                  value={stepSize}
                  onChange={(e) => setStepSize(Number(e.target.value))}
                >
                  <option value={1000}>1,000</option>
                  <option value={10000}>10,000</option>
                  <option value={100000}>100,000</option>
                  <option value={1000000}>1,000,000</option>
                </select>
              </label>

              {/* Start Balance */}
              <label className="flex flex-col text-sm">
                Start Balance
                <input
                  type="number"
                  step={stepSize}
                  className="mt-1 w-40 px-2 py-1 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600"
                  value={startBalance}
                  disabled={saving}
                  onChange={(e) => onUpdateSetting('balance.startBalance', Number(e.target.value))}
                />
              </label>
            </div>

            {/* Level 1 toggle */}
            <SettingToggle
              label="Enable Auto Refill"
              description="Automatically top-up user tokens on an interval"
              value={refillEnabled}
              disabled={saving}
              onChange={(v) => onUpdateSetting('balance.autoRefillEnabled', v)}
            />

            {refillEnabled && (
              <div className="pl-6 border-l border-gray-200 dark:border-gray-700 mt-4 flex flex-wrap md:flex-nowrap items-end gap-4">
                {/* Refill Amount */}
                <label className="flex flex-col text-sm">
                  Refill Amount
                  <input
                    type="number"
                    step={stepSize}
                    className="mt-1 w-32 px-2 py-1 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600"
                    value={refillAmount}
                    disabled={saving}
                    onChange={(e) => onUpdateSetting('balance.refillAmount', Number(e.target.value))}
                  />
                </label>

                {/* Refill Every */}
                <label className="flex flex-col text-sm">
                  Refill Every
                  <div className="flex gap-1 mt-1">
                    <input
                      type="number"
                      min={1}
                      className="w-20 px-2 py-1 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600"
                      value={refillValue}
                      disabled={saving}
                      onChange={(e) => onUpdateSetting('balance.refillIntervalValue', Number(e.target.value))}
                    />
                    <select
                      className="px-2 py-1 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600"
                      value={refillUnit}
                      disabled={saving}
                      onChange={(e) => onUpdateSetting('balance.refillIntervalUnit', e.target.value)}
                    >
                      <option value="seconds">seconds</option>
                      <option value="minutes">minutes</option>
                      <option value="hours">hours</option>
                      <option value="days">days</option>
                      <option value="weeks">weeks</option>
                      <option value="months">months</option>
                    </select>
                  </div>
                </label>
              </div>
            )}
          </div>
        )}
      </div>

    </section>
  );
};

export default UsersSection; 