import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Skeleton } from '@librechat/client';
import { cn } from '~/utils';
import type { MetricCardProps } from '~/types/admin';

/**
 * MetricCard component displays a single metric with optional change indicator
 * Used in the Admin Dashboard to show key statistics
 */
const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  change,
  changeType = 'neutral',
  icon,
  loading = false,
}) => {
  // Format large numbers with commas
  const formatValue = (val: number | string): string => {
    if (typeof val === 'number') {
      return val.toLocaleString();
    }
    return val;
  };

  // Determine change indicator color and icon
  const getChangeStyles = () => {
    switch (changeType) {
      case 'increase':
        return {
          color: 'text-green-600 dark:text-green-400',
          icon: <TrendingUp className="h-4 w-4" />,
        };
      case 'decrease':
        return {
          color: 'text-red-600 dark:text-red-400',
          icon: <TrendingDown className="h-4 w-4" />,
        };
      case 'neutral':
      default:
        return {
          color: 'text-text-secondary',
          icon: <Minus className="h-4 w-4" />,
        };
    }
  };

  const changeStyles = getChangeStyles();

  if (loading) {
    return (
      <div className="rounded-lg border border-border-light bg-surface-primary p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <Skeleton className="mb-2 h-4 w-24" />
            <Skeleton className="h-8 w-32" />
            {change !== undefined && <Skeleton className="mt-2 h-4 w-16" />}
          </div>
          {icon && <Skeleton className="h-10 w-10 rounded-full" />}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border-light bg-surface-primary p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {/* Metric Title */}
          <p className="text-sm font-medium text-text-secondary">{title}</p>

          {/* Metric Value */}
          <p className="mt-2 text-3xl font-semibold text-text-primary">{formatValue(value)}</p>

          {/* Change Indicator */}
          {change !== undefined && (
            <div className={cn('mt-2 flex items-center gap-1 text-sm', changeStyles.color)}>
              {changeStyles.icon}
              <span>
                {change > 0 ? '+' : ''}
                {change}%
              </span>
            </div>
          )}
        </div>

        {/* Optional Icon */}
        {icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-tertiary text-text-secondary">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
};

export default MetricCard;
