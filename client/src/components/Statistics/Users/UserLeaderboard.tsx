import React, { useState } from 'react';
import {
  ChevronUp,
  ChevronDown,
  Crown,
  Medal,
  Award,
  Users,
  Clock,
  DollarSign,
} from 'lucide-react';
import { Button, Spinner } from '@librechat/client';
import { useUserLeaderboard, UserLeaderboardParams } from '../hooks';
import { formatNumber, formatCurrency, formatRelativeTime } from '~/utils';
import UserStatsFilters from './UserStatsFilters';

const UserLeaderboard: React.FC = () => {
  const [params, setParams] = useState<UserLeaderboardParams>({
    page: 1,
    limit: 50,
    sortBy: 'totalTokens',
    sortOrder: 'desc',
  });

  const { data: leaderboardData, isLoading, error, refetch } = useUserLeaderboard(params);

  const users = leaderboardData?.users || [];
  const pagination = leaderboardData?.pagination;
  const summary = leaderboardData?.summary;

  const handleSort = (field: UserLeaderboardParams['sortBy']) => {
    setParams((prev) => ({
      ...prev,
      sortBy: field,
      sortOrder: prev.sortBy === field && prev.sortOrder === 'desc' ? 'asc' : 'desc',
      page: 1, // Reset to first page when sorting
    }));
  };

  const handlePageChange = (newPage: number) => {
    setParams((prev) => ({ ...prev, page: newPage }));
  };

  const handleFilterChange = (filters: Partial<UserLeaderboardParams>) => {
    setParams((prev) => ({
      ...prev,
      ...filters,
      page: 1, // Reset to first page when filtering
    }));
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="h-5 w-5 text-yellow-500" />;
      case 2:
        return <Medal className="h-5 w-5 text-gray-400" />;
      case 3:
        return <Award className="h-5 w-5 text-amber-600" />;
      default:
        return <span className="text-sm font-medium text-gray-500">#{rank}</span>;
    }
  };

  const SortableHeader: React.FC<{
    field: UserLeaderboardParams['sortBy'];
    children: React.ReactNode;
    className?: string;
  }> = ({ field, children, className = '' }) => (
    <th
      className={`cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-gray-50 ${className}`}
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center space-x-1">
        {children}
        {params.sortBy === field &&
          (params.sortOrder === 'desc' ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          ))}
      </div>
    </th>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-8 w-8" />
        <span className="ml-2 text-gray-600">Loading user statistics...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="mb-4 text-red-500">Error loading user leaderboard</div>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Statistics</h1>
          <p className="mt-1 text-gray-600">Token usage leaderboard and analytics</p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          Refresh Data
        </Button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-lg border bg-white p-6 shadow">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-blue-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total Users</p>
                <p className="text-2xl font-bold text-gray-900">{pagination?.totalUsers || 0}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-white p-6 shadow">
            <div className="flex items-center">
              <Clock className="h-8 w-8 text-green-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total Tokens</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatNumber(summary.totalTokensUsed)}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-white p-6 shadow">
            <div className="flex items-center">
              <DollarSign className="h-8 w-8 text-purple-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total Cost</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(summary.totalCost)}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-white p-6 shadow">
            <div className="flex items-center">
              <Award className="h-8 w-8 text-orange-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Average/User</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatNumber(summary.averagePerUser)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <UserStatsFilters params={params} onFilterChange={handleFilterChange} />

      {/* Leaderboard Table */}
      <div className="overflow-hidden rounded-lg bg-white shadow">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Rank
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  User
                </th>
                <SortableHeader field="totalTokens">
                  <span>Total Tokens</span>
                </SortableHeader>
                <SortableHeader field="totalCost">
                  <span>Total Cost</span>
                </SortableHeader>
                <SortableHeader field="lastActivity">
                  <span>Last Activity</span>
                </SortableHeader>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Avg Daily
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {users.map((user) => (
                <tr key={user.userId} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="flex items-center">{getRankIcon(user.rank)}</div>
                  </td>

                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="flex items-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200">
                        <span className="text-sm font-medium text-gray-700">
                          {user.email?.charAt(0).toUpperCase() || 'U'}
                        </span>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {user.username || user.email}
                        </div>
                        <div className="text-sm text-gray-500">
                          {user.conversationCount} conversations
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="text-sm text-gray-900">{formatNumber(user.totalTokens)}</div>
                    <div className="text-sm text-gray-500">
                      {formatNumber(user.promptTokens)} + {formatNumber(user.completionTokens)}
                    </div>
                  </td>

                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="text-sm text-gray-900">{formatCurrency(user.totalCost)}</div>
                  </td>

                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {formatRelativeTime(user.lastActivity)}
                    </div>
                  </td>

                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="text-sm text-gray-900">{formatNumber(user.averageDaily)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
            <div className="flex flex-1 justify-between sm:hidden">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.currentPage - 1)}
                disabled={pagination.currentPage <= 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.currentPage + 1)}
                disabled={pagination.currentPage >= pagination.totalPages}
              >
                Next
              </Button>
            </div>

            <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing{' '}
                  <span className="font-medium">
                    {(pagination.currentPage - 1) * pagination.usersPerPage + 1}
                  </span>{' '}
                  to{' '}
                  <span className="font-medium">
                    {Math.min(
                      pagination.currentPage * pagination.usersPerPage,
                      pagination.totalUsers,
                    )}
                  </span>{' '}
                  of <span className="font-medium">{pagination.totalUsers}</span> results
                </p>
              </div>

              <div>
                <nav className="relative z-0 inline-flex -space-x-px rounded-md shadow-sm">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(pagination.currentPage - 1)}
                    disabled={pagination.currentPage <= 1}
                    className="rounded-l-md"
                  >
                    Previous
                  </Button>

                  {/* Page numbers */}
                  {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                    const pageNum = i + Math.max(1, pagination.currentPage - 2);
                    if (pageNum > pagination.totalPages) return null;

                    return (
                      <Button
                        key={pageNum}
                        variant={pageNum === pagination.currentPage ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handlePageChange(pageNum)}
                        className="border-l-0"
                      >
                        {pageNum}
                      </Button>
                    );
                  })}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(pagination.currentPage + 1)}
                    disabled={pagination.currentPage >= pagination.totalPages}
                    className="rounded-r-md border-l-0"
                  >
                    Next
                  </Button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>

      {users.length === 0 && (
        <div className="py-12 text-center">
          <Users className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No users found</h3>
          <p className="mt-1 text-sm text-gray-500">Try adjusting your filters or date range.</p>
        </div>
      )}
    </div>
  );
};

export default UserLeaderboard;
