import { useState } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  Clock,
  CalendarDays,
  Calendar,
  AlertTriangle,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { Button } from '@librechat/client';
import type { TimeWindow } from './types';

interface TimeWindowListProps {
  timeWindows: TimeWindow[];
  onAdd: () => void;
  onEdit: (timeWindow: TimeWindow) => void;
  onDelete: (timeWindowId: string) => void;
  onToggleActive: (timeWindowId: string, isActive: boolean) => void;
  isLoading?: boolean;
}

export default function TimeWindowList({
  timeWindows = [],
  onAdd,
  onEdit,
  onDelete,
  onToggleActive,
  isLoading = false,
}: TimeWindowListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const getWindowTypeIcon = (type: string) => {
    switch (type) {
      case 'daily':
        return <Clock className="h-4 w-4" />;
      case 'weekly':
        return <CalendarDays className="h-4 w-4" />;
      case 'date_range':
        return <Calendar className="h-4 w-4" />;
      case 'exception':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getWindowTypeLabel = (type: string) => {
    switch (type) {
      case 'daily':
        return 'Daily';
      case 'weekly':
        return 'Weekly';
      case 'date_range':
        return 'Date Range';
      case 'exception':
        return 'Exception';
      default:
        return type;
    }
  };

  const formatTimeWindow = (window: TimeWindow) => {
    switch (window.windowType) {
      case 'daily':
        return `${window.startTime} - ${window.endTime}`;
      case 'weekly':
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const days = window.daysOfWeek?.map((d) => dayNames[d]).join(', ') || '';
        return `${days} ${window.startTime} - ${window.endTime}`;
      case 'date_range':
        const startDate = window.startDate ? new Date(window.startDate).toLocaleDateString() : '';
        const endDate = window.endDate ? new Date(window.endDate).toLocaleDateString() : '';
        return `${startDate} - ${endDate}`;
      case 'exception':
        const exStartDate = window.startDate ? new Date(window.startDate).toLocaleDateString() : '';
        const exEndDate = window.endDate ? new Date(window.endDate).toLocaleDateString() : '';
        return exStartDate === exEndDate ? exStartDate : `${exStartDate} - ${exEndDate}`;
      default:
        return 'Unknown format';
    }
  };

  const handleDelete = async (timeWindowId: string) => {
    if (
      window.confirm(
        'Are you sure you want to delete this time window? This action cannot be undone.',
      )
    ) {
      setDeletingId(timeWindowId);
      try {
        await onDelete(timeWindowId);
      } finally {
        setDeletingId(null);
      }
    }
  };

  const handleToggleActive = async (timeWindow: TimeWindow) => {
    if (timeWindow._id) {
      await onToggleActive(timeWindow._id, !timeWindow.isActive);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-text-primary">Time Windows</h3>
          <p className="text-sm text-text-secondary">
            Configure when members of this group can access the system
          </p>
        </div>
        <Button onClick={onAdd} disabled={isLoading} className="flex items-center gap-2" size="sm">
          <Plus className="h-4 w-4" />
          Add Window
        </Button>
      </div>

      {/* Time Windows List */}
      {timeWindows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-light bg-surface-secondary p-8 text-center">
          <Clock className="text-text-secondary/50 mx-auto h-12 w-12" />
          <h4 className="mt-4 text-lg font-medium text-text-primary">No time windows configured</h4>
          <p className="mt-2 text-text-secondary">
            Add time windows to control when group members can access the system
          </p>
          <Button
            onClick={onAdd}
            disabled={isLoading}
            className="mt-4 flex items-center gap-2"
            size="sm"
          >
            <Plus className="h-4 w-4" />
            Add Your First Window
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {timeWindows.map((window) => (
            <div
              key={window._id}
              className={`rounded-lg border p-4 transition-colors ${
                window.isActive
                  ? 'border-border-light bg-surface-secondary'
                  : 'bg-surface-secondary/50 border-border-light opacity-75'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex items-center gap-3">
                    <div
                      className={`flex items-center gap-2 ${window.isActive ? 'text-text-primary' : 'text-text-secondary'}`}
                    >
                      {getWindowTypeIcon(window.windowType)}
                      <span className="font-medium">{window.name}</span>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:text-blue-200">
                      {getWindowTypeLabel(window.windowType)}
                    </span>
                    {!window.isActive && (
                      <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-0.5 text-xs font-medium text-gray-800 dark:text-gray-200">
                        Disabled
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-text-secondary">{formatTimeWindow(window)}</div>
                  {window.timezone && window.timezone !== 'UTC' && (
                    <div className="text-text-secondary/75 mt-1 text-xs">
                      Timezone: {window.timezone}
                    </div>
                  )}
                </div>

                <div className="ml-4 flex items-center gap-2">
                  {/* Toggle Active */}
                  <button
                    onClick={() => handleToggleActive(window)}
                    disabled={isLoading}
                    className="flex items-center gap-1 focus:outline-none"
                    title={window.isActive ? 'Disable window' : 'Enable window'}
                  >
                    {window.isActive ? (
                      <ToggleRight className="h-5 w-5 text-blue-500 dark:text-blue-400" />
                    ) : (
                      <ToggleLeft className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                    )}
                  </button>

                  {/* Edit Button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(window)}
                    disabled={isLoading}
                    className="flex items-center gap-1"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>

                  {/* Delete Button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window._id && handleDelete(window._id)}
                    disabled={isLoading || deletingId === window._id}
                    className="flex items-center gap-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Help Text */}
      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/50 p-4 text-sm">
        <h4 className="mb-2 font-medium text-blue-900 dark:text-blue-100">Time Window Types:</h4>
        <ul className="space-y-1 text-blue-800 dark:text-blue-200">
          <li className="flex items-center gap-2">
            <Clock className="h-3 w-3" />
            <strong>Daily:</strong> Same time period every day
          </li>
          <li className="flex items-center gap-2">
            <CalendarDays className="h-3 w-3" />
            <strong>Weekly:</strong> Specific days and times each week
          </li>
          <li className="flex items-center gap-2">
            <Calendar className="h-3 w-3" />
            <strong>Date Range:</strong> Access allowed during specific date period
          </li>
          <li className="flex items-center gap-2">
            <AlertTriangle className="h-3 w-3" />
            <strong>Exception:</strong> Block access on specific dates (overrides other windows)
          </li>
        </ul>
      </div>
    </div>
  );
}
