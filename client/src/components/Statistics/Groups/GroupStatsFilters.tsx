import React, { useState } from 'react';
import { Calendar, Filter, X, Users, Activity } from 'lucide-react';
import { Button, Input, Select } from '@librechat/client';
import { GroupLeaderboardParams } from '../hooks';

interface GroupStatsFiltersProps {
  params: GroupLeaderboardParams;
  onFilterChange: (filters: Partial<GroupLeaderboardParams>) => void;
}

const GroupStatsFilters: React.FC<GroupStatsFiltersProps> = ({ params, onFilterChange }) => {
  const [showFilters, setShowFilters] = useState(false);
  const [localFilters, setLocalFilters] = useState<Partial<GroupLeaderboardParams>>({
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    minMembers: params.minMembers,
    includeInactive: params.includeInactive,
  });

  const handleApplyFilters = () => {
    onFilterChange(localFilters);
    setShowFilters(false);
  };

  const handleResetFilters = () => {
    const resetFilters = {
      dateFrom: undefined,
      dateTo: undefined,
      minMembers: undefined,
      includeInactive: false,
    };
    setLocalFilters(resetFilters);
    onFilterChange(resetFilters);
  };

  const hasActiveFilters =
    params.dateFrom || params.dateTo || params.minMembers || params.includeInactive;

  return (
    <div className="rounded-lg border bg-white shadow">
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button
              variant={showFilters ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center space-x-2"
            >
              <Filter className="h-4 w-4" />
              <span>Filters</span>
              {hasActiveFilters && (
                <span className="ml-2 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                  Active
                </span>
              )}
            </Button>

            {/* Quick filters */}
            <div className="flex items-center space-x-2">
              <Select
                value={params.limit?.toString() || '20'}
                onChange={(e) => onFilterChange({ limit: parseInt(e.target.value) })}
                className="w-24"
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
              </Select>
              <span className="text-sm text-gray-500">per page</span>
            </div>
          </div>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetFilters}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="mr-1 h-4 w-4" />
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      {showFilters && (
        <div className="bg-gray-50 px-6 py-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Date Range */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                <Calendar className="mr-1 inline h-4 w-4" />
                Date From
              </label>
              <Input
                type="date"
                value={localFilters.dateFrom || ''}
                onChange={(e) => setLocalFilters({ ...localFilters, dateFrom: e.target.value })}
                className="w-full"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                <Calendar className="mr-1 inline h-4 w-4" />
                Date To
              </label>
              <Input
                type="date"
                value={localFilters.dateTo || ''}
                onChange={(e) => setLocalFilters({ ...localFilters, dateTo: e.target.value })}
                className="w-full"
              />
            </div>

            {/* Minimum Members */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                <Users className="mr-1 inline h-4 w-4" />
                Minimum Members
              </label>
              <Input
                type="number"
                min="1"
                placeholder="e.g., 5"
                value={localFilters.minMembers || ''}
                onChange={(e) =>
                  setLocalFilters({
                    ...localFilters,
                    minMembers: e.target.value ? parseInt(e.target.value) : undefined,
                  })
                }
                className="w-full"
              />
            </div>

            {/* Include Inactive */}
            <div className="flex items-end">
              <label className="flex cursor-pointer items-center space-x-2">
                <input
                  type="checkbox"
                  checked={localFilters.includeInactive || false}
                  onChange={(e) =>
                    setLocalFilters({ ...localFilters, includeInactive: e.target.checked })
                  }
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  <Activity className="mr-1 inline h-4 w-4" />
                  Include Inactive Groups
                </span>
              </label>
            </div>
          </div>

          {/* Quick Date Range Buttons */}
          <div className="mt-4 flex items-center space-x-2">
            <span className="text-sm text-gray-500">Quick select:</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const today = new Date();
                const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
                setLocalFilters({
                  ...localFilters,
                  dateFrom: lastWeek.toISOString().split('T')[0],
                  dateTo: today.toISOString().split('T')[0],
                });
              }}
            >
              Last 7 days
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const today = new Date();
                const lastMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
                setLocalFilters({
                  ...localFilters,
                  dateFrom: lastMonth.toISOString().split('T')[0],
                  dateTo: today.toISOString().split('T')[0],
                });
              }}
            >
              Last 30 days
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const today = new Date();
                const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                setLocalFilters({
                  ...localFilters,
                  dateFrom: thisMonth.toISOString().split('T')[0],
                  dateTo: today.toISOString().split('T')[0],
                });
              }}
            >
              This month
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const today = new Date();
                const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
                setLocalFilters({
                  ...localFilters,
                  dateFrom: lastMonth.toISOString().split('T')[0],
                  dateTo: lastMonthEnd.toISOString().split('T')[0],
                });
              }}
            >
              Last month
            </Button>
          </div>

          {/* Apply/Cancel Buttons */}
          <div className="mt-4 flex justify-end space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLocalFilters({
                  dateFrom: params.dateFrom,
                  dateTo: params.dateTo,
                  minMembers: params.minMembers,
                  includeInactive: params.includeInactive,
                });
                setShowFilters(false);
              }}
            >
              Cancel
            </Button>
            <Button variant="default" size="sm" onClick={handleApplyFilters}>
              Apply Filters
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupStatsFilters;
