import React, { useState } from 'react';
import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuditList } from '~/data-provider/audit-queries';
import type { AuditFilters as AuditFiltersType } from '~/types/audit';
import { AuditTable } from './AuditTable';
import { AuditFilters } from './AuditFilters';

const DEFAULT_LIMIT = 20;

interface AuditListViewProps {
  onSelectSession: (sessionId: string) => void;
}

/**
 * Audit List View
 * Main view for listing audits with filters and pagination
 */
export const AuditListView: React.FC<AuditListViewProps> = ({ onSelectSession }) => {
  const [filters, setFilters] = useState<AuditFiltersType>({
    limit: DEFAULT_LIMIT,
    offset: 0,
  });

  const { data, isLoading, error, refetch, isFetching } = useAuditList(filters);

  const handleFilterChange = (newFilters: AuditFiltersType) => {
    setFilters({
      ...newFilters,
      limit: DEFAULT_LIMIT,
      offset: 0, // Reset to first page when filters change
    });
  };

  const handleResetFilters = () => {
    setFilters({
      limit: DEFAULT_LIMIT,
      offset: 0,
    });
  };

  const handleNextPage = () => {
    setFilters((prev) => ({
      ...prev,
      offset: (prev.offset || 0) + DEFAULT_LIMIT,
    }));
  };

  const handlePrevPage = () => {
    setFilters((prev) => ({
      ...prev,
      offset: Math.max(0, (prev.offset || 0) - DEFAULT_LIMIT),
    }));
  };

  const currentPage = Math.floor((filters.offset || 0) / DEFAULT_LIMIT) + 1;
  const totalPages = data?.pagination?.total ? Math.ceil(data.pagination.total / DEFAULT_LIMIT) : 1;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* Filters */}
          <AuditFilters
            filters={filters}
            onFilterChange={handleFilterChange}
            onReset={handleResetFilters}
          />

          {/* Header with Stats and Refresh */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {data?.pagination?.total !== undefined && (
                <>
                  Showing{' '}
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {Math.min((filters.offset || 0) + 1, data.pagination.total)}
                  </span>{' '}
                  to{' '}
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {Math.min((filters.offset || 0) + DEFAULT_LIMIT, data.pagination.total)}
                  </span>{' '}
                  of{' '}
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {data.pagination.total}
                  </span>{' '}
                  audits
                </>
              )}
            </div>

            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center space-x-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {/* Error State */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800 dark:text-red-400">
                    Error loading audits
                  </h3>
                  <div className="mt-2 text-sm text-red-700 dark:text-red-300">{error.message}</div>
                </div>
              </div>
            </div>
          )}

          {/* Table */}
          <AuditTable
            audits={data?.audits || []}
            isLoading={isLoading}
            onSelectSession={onSelectSession}
          />

          {/* Pagination */}
          {data?.pagination && data.pagination.total > DEFAULT_LIMIT && (
            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex flex-1 justify-between sm:hidden">
                <button
                  onClick={handlePrevPage}
                  disabled={(filters.offset || 0) === 0}
                  className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
                >
                  Previous
                </button>
                <button
                  onClick={handleNextPage}
                  disabled={!data.pagination.hasMore}
                  className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
                >
                  Next
                </button>
              </div>
              <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Page <span className="font-medium">{currentPage}</span> of{' '}
                    <span className="font-medium">{totalPages}</span>
                  </p>
                </div>
                <div>
                  <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm">
                    <button
                      onClick={handlePrevPage}
                      disabled={(filters.offset || 0) === 0}
                      className="relative inline-flex items-center rounded-l-md border border-gray-300 bg-white px-2 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      onClick={handleNextPage}
                      disabled={!data.pagination.hasMore}
                      className="relative inline-flex items-center rounded-r-md border border-gray-300 bg-white px-2 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuditListView;
