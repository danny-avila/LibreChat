import React, { useState } from 'react';
import {
  ChevronUp,
  ChevronDown,
  Crown,
  Medal,
  Award,
  Users,
  TrendingUp,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { Button, Spinner } from '@librechat/client';
import { useGroupLeaderboard, GroupLeaderboardParams } from '../hooks';
import { formatNumber, formatCurrency, formatRelativeTime, formatPercentage } from '~/utils';
import GroupStatsFilters from './GroupStatsFilters';
import { useNavigate } from 'react-router-dom';

const GroupLeaderboard: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useState<GroupLeaderboardParams>({
    page: 1,
    limit: 20,
    sortBy: 'totalTokens',
    sortOrder: 'desc',
  });

  const { data: leaderboardData, isLoading, error, refetch } = useGroupLeaderboard(params);

  const groups = leaderboardData?.groups || [];
  const pagination = leaderboardData?.pagination;
  const summary = leaderboardData?.summary;

  const handleSort = (field: GroupLeaderboardParams['sortBy']) => {
    setParams((prev) => ({
      ...prev,
      sortBy: field,
      sortOrder: prev.sortBy === field && prev.sortOrder === 'desc' ? 'asc' : 'desc',
      page: 1,
    }));
  };

  const handlePageChange = (newPage: number) => {
    setParams((prev) => ({ ...prev, page: newPage }));
  };

  const handleFilterChange = (filters: Partial<GroupLeaderboardParams>) => {
    setParams((prev) => ({
      ...prev,
      ...filters,
      page: 1,
    }));
  };

  const handleGroupClick = (groupId: string) => {
    navigate(`/d/statistics/groups/${groupId}`);
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

  const getBalanceStatus = (balance: number, memberCount: number) => {
    const avgBalance = memberCount > 0 ? balance / memberCount : 0;
    if (avgBalance > 10000) {
      return { icon: null, color: 'text-green-600' };
    } else if (avgBalance > 5000) {
      return { icon: null, color: 'text-yellow-600' };
    } else {
      return { icon: <AlertTriangle className="h-4 w-4" />, color: 'text-red-600' };
    }
  };


  const SortableHeader: React.FC<{
    field: GroupLeaderboardParams['sortBy'];
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
        <span className="ml-2 text-gray-600">Loading group statistics...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="mb-4 text-red-500">Error loading group leaderboard</div>
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
          <h1 className="text-2xl font-bold text-gray-900">Group Statistics</h1>
          <p className="mt-1 text-gray-600">Aggregated usage analytics by group</p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          Refresh Data
        </Button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
          <div className="rounded-lg border bg-white p-6 shadow">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-blue-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total Groups</p>
                <p className="text-2xl font-bold text-gray-900">{summary.totalGroups}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-white p-6 shadow">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-green-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total Members</p>
                <p className="text-2xl font-bold text-gray-900">{summary.totalMembers}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-white p-6 shadow">
            <div className="flex items-center">
              <TrendingUp className="h-8 w-8 text-purple-500" />
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
              <Users className="h-8 w-8 text-orange-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Avg Group Size</p>
                <p className="text-2xl font-bold text-gray-900">{summary.averageGroupSize}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-white p-6 shadow">
            <div className="flex items-center">
              <Crown className="h-8 w-8 text-yellow-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Most Active</p>
                <p className="truncate text-lg font-bold text-gray-900">
                  {summary.mostActiveGroup || 'N/A'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <GroupStatsFilters params={params} onFilterChange={handleFilterChange} />

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
                  Group
                </th>
                <SortableHeader field="memberCount">
                  <span>Members</span>
                </SortableHeader>
                <SortableHeader field="totalTokens">
                  <span>Total Tokens</span>
                </SortableHeader>
                <SortableHeader field="averagePerMember">
                  <span>Avg/Member</span>
                </SortableHeader>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Balance Pool
                </th>
                <SortableHeader field="totalCost">
                  <span>Total Cost</span>
                </SortableHeader>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Time Windows
                </th>
                <SortableHeader field="lastActivity">
                  <span>Last Activity</span>
                </SortableHeader>
                <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {groups.map((group) => {
                const balanceStatus = getBalanceStatus(group.groupBalance, group.memberCount);

                return (
                  <tr key={group.groupId} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center">{getRankIcon(group.rank)}</div>
                    </td>

                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-purple-500">
                          <Users className="h-5 w-5 text-white" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{group.groupName}</div>
                          <div className="text-sm text-gray-500">
                            {group.activeMemberCount} active
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="text-sm text-gray-900">{group.memberCount}</div>
                      {group.membersWithLowBalance > 0 && (
                        <div className="text-xs text-red-600">
                          {group.membersWithLowBalance} low balance
                        </div>
                      )}
                    </td>

                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="text-sm text-gray-900">{formatNumber(group.totalTokens)}</div>
                      <div className="text-xs text-gray-500">
                        {formatNumber(group.promptTokens)} + {formatNumber(group.completionTokens)}
                      </div>
                    </td>

                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {formatNumber(group.averagePerMember)}
                      </div>
                      <div className="text-xs text-gray-500">
                        per active: {formatNumber(group.averagePerActiveMember)}
                      </div>
                    </td>

                    <td className="whitespace-nowrap px-6 py-4">
                      <div
                        className={`text-sm font-medium ${balanceStatus.color} flex items-center space-x-1`}
                      >
                        {balanceStatus.icon}
                        <span>{formatNumber(group.groupBalance)}</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        avg: {formatNumber(group.averageBalance)}
                      </div>
                    </td>

                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="text-sm text-gray-900">{formatCurrency(group.totalCost)}</div>
                    </td>

                    <td className="whitespace-nowrap px-6 py-4 text-center">
                      {group.timeWindowsActive > 0 ? (
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                          <Clock className="mr-1 h-3 w-3" />
                          {group.timeWindowsActive}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">None</span>
                      )}
                    </td>

                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {formatRelativeTime(group.lastActivity)}
                      </div>
                    </td>

                    <td className="whitespace-nowrap px-6 py-4 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleGroupClick(group.groupId)}
                      >
                        View Details
                      </Button>
                    </td>
                  </tr>
                );
              })}
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
                    {(pagination.currentPage - 1) * pagination.groupsPerPage + 1}
                  </span>{' '}
                  to{' '}
                  <span className="font-medium">
                    {Math.min(
                      pagination.currentPage * pagination.groupsPerPage,
                      pagination.totalGroups,
                    )}
                  </span>{' '}
                  of <span className="font-medium">{pagination.totalGroups}</span> groups
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

      {groups.length === 0 && (
        <div className="py-12 text-center">
          <Users className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No groups found</h3>
          <p className="mt-1 text-sm text-gray-500">Try adjusting your filters or date range.</p>
        </div>
      )}
    </div>
  );
};

export default GroupLeaderboard;
