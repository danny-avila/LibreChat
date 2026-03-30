import React, { useState } from 'react';
import { Calendar, Filter, X, Search } from 'lucide-react';
import { Button, Input, Label } from '@librechat/client';
import { UserLeaderboardParams } from '../hooks';

interface UserStatsFiltersProps {
  params: UserLeaderboardParams;
  onFilterChange: (filters: Partial<UserLeaderboardParams>) => void;
}

const UserStatsFilters: React.FC<UserStatsFiltersProps> = ({ params, onFilterChange }) => {
  const [showFilters, setShowFilters] = useState(false);
  const [localFilters, setLocalFilters] = useState({
    dateFrom: params.dateFrom || '',
    dateTo: params.dateTo || '',
    minUsage: params.minUsage?.toString() || '',
    maxUsage: params.maxUsage?.toString() || '',
    includeInactive: params.includeInactive || false,
  });

  const handleApplyFilters = () => {
    const filters: Partial<UserLeaderboardParams> = {};

    if (localFilters.dateFrom) filters.dateFrom = localFilters.dateFrom;
    if (localFilters.dateTo) filters.dateTo = localFilters.dateTo;
    if (localFilters.minUsage) filters.minUsage = parseInt(localFilters.minUsage);
    if (localFilters.maxUsage) filters.maxUsage = parseInt(localFilters.maxUsage);
    filters.includeInactive = localFilters.includeInactive;

    onFilterChange(filters);
  };

  const handleClearFilters = () => {
    const clearedFilters = {
      dateFrom: '',
      dateTo: '',
      minUsage: '',
      maxUsage: '',
      includeInactive: false,
    };

    setLocalFilters(clearedFilters);
    onFilterChange({
      dateFrom: undefined,
      dateTo: undefined,
      minUsage: undefined,
      maxUsage: undefined,
      includeInactive: false,
    });
  };

  const handleQuickDateRange = (range: string) => {
    const now = new Date();
    let dateFrom: string;

    switch (range) {
      case '7d':
        dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case '30d':
        dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case '90d':
        dateFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
        break;
      default:
        dateFrom = '';
    }

    const newFilters = {
      ...localFilters,
      dateFrom: dateFrom.split('T')[0], // Get YYYY-MM-DD format
      dateTo: now.toISOString().split('T')[0],
    };

    setLocalFilters(newFilters);
    onFilterChange({
      dateFrom: dateFrom || undefined,
      dateTo: now.toISOString(),
    });
  };

  const handleSortChange = (sortBy: UserLeaderboardParams['sortBy'], sortOrder: 'asc' | 'desc') => {
    onFilterChange({ sortBy, sortOrder });
  };

  const hasActiveFilters =
    params.dateFrom ||
    params.dateTo ||
    params.minUsage ||
    params.maxUsage ||
    params.includeInactive;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-col space-y-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div className="flex items-center space-x-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center space-x-2"
          >
            <Filter className="h-4 w-4" />
            <span>Filters</span>
            {hasActiveFilters && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                {
                  [
                    params.dateFrom,
                    params.dateTo,
                    params.minUsage,
                    params.maxUsage,
                    params.includeInactive,
                  ].filter(Boolean).length
                }
              </span>
            )}
          </Button>

          {/* Quick Date Ranges */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-500">Quick:</span>
            <Button variant="ghost" size="sm" onClick={() => handleQuickDateRange('7d')}>
              7 days
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleQuickDateRange('30d')}>
              30 days
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleQuickDateRange('90d')}>
              90 days
            </Button>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* Sort Controls */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-500">Sort by:</span>
            <select
              value={params.sortBy || 'totalTokens'}
              onChange={(e) =>
                handleSortChange(
                  e.target.value as UserLeaderboardParams['sortBy'],
                  params.sortOrder || 'desc',
                )
              }
              className="rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="totalTokens">Total Tokens</option>
              <option value="totalCost">Total Cost</option>
              <option value="lastActivity">Last Activity</option>
              <option value="joinDate">Join Date</option>
            </select>

            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                handleSortChange(
                  params.sortBy || 'totalTokens',
                  params.sortOrder === 'desc' ? 'asc' : 'desc',
                )
              }
            >
              {params.sortOrder === 'desc' ? '↓' : '↑'}
            </Button>
          </div>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              className="text-red-600 hover:text-red-700"
            >
              <X className="mr-1 h-4 w-4" />
              Clear All
            </Button>
          )}
        </div>
      </div>

      {/* Extended Filters Panel */}
      {showFilters && (
        <div className="mt-4 border-t border-gray-200 pt-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Date Range */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Date From</Label>
              <Input
                type="date"
                value={localFilters.dateFrom}
                onChange={(e) => setLocalFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Date To</Label>
              <Input
                type="date"
                value={localFilters.dateTo}
                onChange={(e) => setLocalFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
                className="w-full"
              />
            </div>

            {/* Usage Range */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Min Tokens</Label>
              <Input
                type="number"
                placeholder="e.g. 1000"
                value={localFilters.minUsage}
                onChange={(e) => setLocalFilters((prev) => ({ ...prev, minUsage: e.target.value }))}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Max Tokens</Label>
              <Input
                type="number"
                placeholder="e.g. 100000"
                value={localFilters.maxUsage}
                onChange={(e) => setLocalFilters((prev) => ({ ...prev, maxUsage: e.target.value }))}
                className="w-full"
              />
            </div>
          </div>

          {/* Additional Options */}
          <div className="mt-4 flex items-center space-x-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={localFilters.includeInactive}
                onChange={(e) =>
                  setLocalFilters((prev) => ({ ...prev, includeInactive: e.target.checked }))
                }
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">
                Include inactive users (no activity in 30 days)
              </span>
            </label>
          </div>

          {/* Apply/Reset Buttons */}
          <div className="mt-4 flex items-center space-x-3">
            <Button onClick={handleApplyFilters} size="sm">
              Apply Filters
            </Button>
            <Button variant="outline" onClick={handleClearFilters} size="sm">
              Clear All
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserStatsFilters;
