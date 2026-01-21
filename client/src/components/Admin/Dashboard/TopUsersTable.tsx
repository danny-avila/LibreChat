import React, { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Skeleton } from '@librechat/client';
import { cn } from '~/utils';
import type { TopUsersTableProps } from '~/types/admin';

type SortField = 'email' | 'conversationCount' | 'messageCount' | 'tokenUsage' | 'lastActive';
type SortDirection = 'asc' | 'desc';

/**
 * TopUsersTable component displays a table of top users by various metrics
 * Supports sorting by different columns and loading states
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */
const TopUsersTable: React.FC<TopUsersTableProps> = ({ users, metric, loading = false }) => {
  const [sortField, setSortField] = useState<SortField>(
    metric === 'conversations'
      ? 'conversationCount'
      : metric === 'tokens'
        ? 'tokenUsage'
        : 'messageCount',
  );
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Handle column header click for sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle direction if clicking the same field
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new field and default to descending
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Sort users based on current sort field and direction
  const sortedUsers = useMemo(() => {
    if (!users || users.length === 0) {
      return [];
    }

    return [...users].sort((a, b) => {
      let aValue: string | number | Date;
      let bValue: string | number | Date;

      switch (sortField) {
        case 'email':
          aValue = (a.email || 'Unknown').toLowerCase();
          bValue = (b.email || 'Unknown').toLowerCase();
          break;
        case 'conversationCount':
          aValue = a.conversationCount;
          bValue = b.conversationCount;
          break;
        case 'messageCount':
          aValue = a.messageCount;
          bValue = b.messageCount;
          break;
        case 'tokenUsage':
          aValue = a.tokenUsage;
          bValue = b.tokenUsage;
          break;
        case 'lastActive':
          aValue = new Date(a.lastActive).getTime();
          bValue = new Date(b.lastActive).getTime();
          break;
        default:
          return 0;
      }

      if (aValue < bValue) {
        return sortDirection === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortDirection === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [users, sortField, sortDirection]);

  // Render sort icon based on current sort state
  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-1 h-4 w-4 text-text-tertiary" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="ml-1 h-4 w-4 text-text-primary" />
    ) : (
      <ArrowDown className="ml-1 h-4 w-4 text-text-primary" />
    );
  };

  // Format numbers with commas
  const formatNumber = (num: number): string => {
    return num.toLocaleString();
  };

  // Format date to relative time or absolute date
  const formatDate = (date: Date): string => {
    const now = new Date();
    const lastActive = new Date(date);
    const diffMs = now.getTime() - lastActive.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) {
      return 'Just now';
    } else if (diffMins < 60) {
      return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else {
      return lastActive.toLocaleDateString();
    }
  };

  // Loading skeleton
  if (loading) {
    return (
      <div className="rounded-lg border border-border-light bg-surface-primary shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-border-light bg-surface-secondary">
              <tr>
                <th className="px-6 py-3 text-left">
                  <Skeleton className="h-4 w-20" />
                </th>
                <th className="px-6 py-3 text-right">
                  <Skeleton className="h-4 w-24" />
                </th>
                <th className="px-6 py-3 text-right">
                  <Skeleton className="h-4 w-20" />
                </th>
                <th className="px-6 py-3 text-right">
                  <Skeleton className="h-4 w-20" />
                </th>
                <th className="px-6 py-3 text-right">
                  <Skeleton className="h-4 w-24" />
                </th>
              </tr>
            </thead>
            <tbody>
              {[...Array(5)].map((_, index) => (
                <tr key={index} className="border-b border-border-light last:border-b-0">
                  <td className="px-6 py-4">
                    <Skeleton className="h-4 w-48" />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Skeleton className="h-4 w-16" />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Skeleton className="h-4 w-16" />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Skeleton className="h-4 w-16" />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Skeleton className="h-4 w-24" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Empty state
  if (!users || users.length === 0) {
    return (
      <div className="rounded-lg border border-border-light bg-surface-primary p-8 text-center shadow-sm">
        <p className="text-text-secondary">No user data available for the selected time range.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border-light bg-surface-primary shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-border-light bg-surface-secondary">
            <tr>
              {/* Email Column */}
              <th className="px-6 py-3 text-left">
                <button
                  onClick={() => handleSort('email')}
                  className={cn(
                    'flex items-center text-sm font-semibold text-text-primary transition-colors hover:text-text-secondary',
                    'focus:outline-none focus:ring-2 focus:ring-border-medium focus:ring-offset-2',
                  )}
                >
                  User Email
                  {renderSortIcon('email')}
                </button>
              </th>

              {/* Conversations Column */}
              <th className="px-6 py-3 text-right">
                <button
                  onClick={() => handleSort('conversationCount')}
                  className={cn(
                    'ml-auto flex items-center text-sm font-semibold text-text-primary transition-colors hover:text-text-secondary',
                    'focus:outline-none focus:ring-2 focus:ring-border-medium focus:ring-offset-2',
                  )}
                >
                  Conversations
                  {renderSortIcon('conversationCount')}
                </button>
              </th>

              {/* Messages Column */}
              <th className="px-6 py-3 text-right">
                <button
                  onClick={() => handleSort('messageCount')}
                  className={cn(
                    'ml-auto flex items-center text-sm font-semibold text-text-primary transition-colors hover:text-text-secondary',
                    'focus:outline-none focus:ring-2 focus:ring-border-medium focus:ring-offset-2',
                  )}
                >
                  Messages
                  {renderSortIcon('messageCount')}
                </button>
              </th>

              {/* Tokens Column */}
              <th className="px-6 py-3 text-right">
                <button
                  onClick={() => handleSort('tokenUsage')}
                  className={cn(
                    'ml-auto flex items-center text-sm font-semibold text-text-primary transition-colors hover:text-text-secondary',
                    'focus:outline-none focus:ring-2 focus:ring-border-medium focus:ring-offset-2',
                  )}
                >
                  Tokens
                  {renderSortIcon('tokenUsage')}
                </button>
              </th>

              {/* Last Active Column */}
              <th className="px-6 py-3 text-right">
                <button
                  onClick={() => handleSort('lastActive')}
                  className={cn(
                    'ml-auto flex items-center text-sm font-semibold text-text-primary transition-colors hover:text-text-secondary',
                    'focus:outline-none focus:ring-2 focus:ring-border-medium focus:ring-offset-2',
                  )}
                >
                  Last Active
                  {renderSortIcon('lastActive')}
                </button>
              </th>
            </tr>
          </thead>

          <tbody>
            {sortedUsers.map((user, index) => (
              <tr
                key={user.userId}
                className={cn(
                  'border-b border-border-light transition-colors hover:bg-surface-hover last:border-b-0',
                  index % 2 === 0 ? 'bg-surface-primary' : 'bg-surface-secondary/30',
                )}
              >
                {/* Email */}
                <td className="px-6 py-4 text-sm text-text-primary">{user.email || 'Unknown'}</td>

                {/* Conversations */}
                <td className="px-6 py-4 text-right text-sm text-text-primary">
                  {formatNumber(user.conversationCount)}
                </td>

                {/* Messages */}
                <td className="px-6 py-4 text-right text-sm text-text-primary">
                  {formatNumber(user.messageCount)}
                </td>

                {/* Tokens */}
                <td className="px-6 py-4 text-right text-sm text-text-primary">
                  {formatNumber(user.tokenUsage)}
                </td>

                {/* Last Active */}
                <td className="px-6 py-4 text-right text-sm text-text-secondary">
                  {formatDate(user.lastActive)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TopUsersTable;
