import React from 'react';
import { Filter, X } from 'lucide-react';
import type { AuditFilters as AuditFiltersType, AuditSessionStatus } from '~/types/audit';

interface AuditFiltersProps {
  filters: AuditFiltersType;
  onFilterChange: (filters: AuditFiltersType) => void;
  onReset: () => void;
}

/**
 * Audit Filters Component
 * Provides UI for filtering audit list
 */
export const AuditFilters: React.FC<AuditFiltersProps> = ({
  filters,
  onFilterChange,
  onReset,
}) => {
  const hasActiveFilters = filters.status || filters.approved !== undefined || filters.userId;

  const statuses: AuditSessionStatus[] = ['PAID', 'COMPLETED', 'PROCESSED', 'FAILED'];

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Filter className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Filters</h3>
        </div>
        {hasActiveFilters && (
          <button
            onClick={onReset}
            className="flex items-center space-x-1 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            <X className="h-3 w-3" />
            <span>Clear</span>
          </button>
        )}
      </div>

      {/* Filter Controls */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Status Filter */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
            Session Status
          </label>
          <select
            value={filters.status || ''}
            onChange={(e) =>
              onFilterChange({
                ...filters,
                status: e.target.value as AuditSessionStatus | undefined,
              })
            }
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          >
            <option value="">All Statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        {/* Approval Filter */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
            Approval Status
          </label>
          <select
            value={
              filters.approved === undefined ? '' : filters.approved ? 'approved' : 'pending'
            }
            onChange={(e) =>
              onFilterChange({
                ...filters,
                approved:
                  e.target.value === '' ? undefined : e.target.value === 'approved',
              })
            }
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          >
            <option value="">All</option>
            <option value="pending">Pending Approval</option>
            <option value="approved">Approved</option>
          </select>
        </div>

        {/* User ID Filter */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
            User ID
          </label>
          <input
            type="text"
            value={filters.userId || ''}
            onChange={(e) =>
              onFilterChange({
                ...filters,
                userId: e.target.value || undefined,
              })
            }
            placeholder="Filter by user ID..."
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
          />
        </div>
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          {filters.status && (
            <span className="inline-flex items-center space-x-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
              <span>Status: {filters.status}</span>
              <button
                onClick={() => onFilterChange({ ...filters, status: undefined })}
                className="ml-1 hover:text-blue-900 dark:hover:text-blue-300"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {filters.approved !== undefined && (
            <span className="inline-flex items-center space-x-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
              <span>{filters.approved ? 'Approved' : 'Pending'}</span>
              <button
                onClick={() => onFilterChange({ ...filters, approved: undefined })}
                className="ml-1 hover:text-blue-900 dark:hover:text-blue-300"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {filters.userId && (
            <span className="inline-flex items-center space-x-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
              <span>User: {filters.userId.substring(0, 8)}...</span>
              <button
                onClick={() => onFilterChange({ ...filters, userId: undefined })}
                className="ml-1 hover:text-blue-900 dark:hover:text-blue-300"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default AuditFilters;
