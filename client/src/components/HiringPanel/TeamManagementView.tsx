/* eslint-disable i18next/no-literal-string */
import React, { useState, useMemo } from 'react';
import { Plus, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Candidate, OnboardingStatus, AddCandidateInput } from './types';
import AddCandidateForm from './AddCandidateForm';

const STATUS_BADGE: Record<OnboardingStatus, string> = {
  pending: 'border border-gray-300 text-gray-600 bg-white dark:border-gray-600 dark:text-gray-300 dark:bg-transparent',
  onboarding: 'border border-gray-300 text-gray-600 bg-white dark:border-gray-600 dark:text-gray-300 dark:bg-transparent',
  active: 'bg-gray-900 text-white dark:bg-white dark:text-gray-900',
};

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

interface TeamManagementViewProps {
  candidates: Candidate[];
  loading: boolean;
  onAddCandidate: (data: AddCandidateInput) => Promise<Candidate | void>;
  onSwitchToTasks?: () => void;
}

export default function TeamManagementView({
  candidates,
  loading,
  onAddCandidate,
}: TeamManagementViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OnboardingStatus | 'all'>('all');
  const [showForm, setShowForm] = useState(false);
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    return candidates.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.role?.toLowerCase().includes(search.toLowerCase()) ||
        c.whatsapp.includes(search);
      const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [candidates, search, statusFilter]);

  const handleAdd = async (data: AddCandidateInput) => {
    await onAddCandidate(data);
  };

  return (
    <div className="flex h-full flex-col p-6">
      {/* Header row */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Team Management</h2>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            {candidates.length} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
          >
            <Plus className="h-4 w-4" />
            Add Employee
          </button>
        </div>
      </div>

      {/* Add Employee modal */}
      <AddCandidateForm
        open={showForm}
        onSubmit={handleAdd}
        onClose={() => setShowForm(false)}
      />

      {/* Search + filter row */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search name, role, or number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
          />
        </div>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as OnboardingStatus | 'all')}
            className="appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm text-gray-700 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="onboarding">Onboarding</option>
            <option value="active">Active</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Role</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">WhatsApp</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {loading ? (
              <tr>
                <td colSpan={4} className="py-10 text-center text-sm text-gray-400">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-10 text-center text-sm text-gray-400">
                  No candidates found.
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr
                  key={c._id}
                  onClick={() => navigate(`/hiring/team/${c._id}`)}
                  className="cursor-pointer bg-white hover:bg-gray-50 dark:bg-transparent dark:hover:bg-gray-800/30"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                        {getInitials(c.name)}
                      </div>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{c.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{c.role || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{c.whatsapp}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${STATUS_BADGE[c.status]}`}>
                      {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
