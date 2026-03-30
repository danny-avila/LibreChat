import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@librechat/client';
import TimeWindowList from './TimeWindowList';
import TimeWindowForm from './TimeWindowForm';
import {
  useAddTimeWindowMutation,
  useUpdateTimeWindowMutation,
  useRemoveTimeWindowMutation,
} from './hooks';
import type { TimeWindow, CreateTimeWindowRequest, UpdateTimeWindowRequest } from './types';

interface TimeWindowManagerProps {
  groupId: string;
  timeWindows: TimeWindow[];
  onRefresh?: () => void;
}

export default function TimeWindowManager({
  groupId,
  timeWindows,
  onRefresh,
}: TimeWindowManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingWindow, setEditingWindow] = useState<TimeWindow | null>(null);

  // Mutations
  const addMutation = useAddTimeWindowMutation();
  const updateMutation = useUpdateTimeWindowMutation();
  const removeMutation = useRemoveTimeWindowMutation();

  const isLoading = addMutation.isPending || updateMutation.isPending || removeMutation.isPending;

  const handleAdd = () => {
    setEditingWindow(null);
    setShowForm(true);
  };

  const handleEdit = (timeWindow: TimeWindow) => {
    setEditingWindow(timeWindow);
    setShowForm(true);
  };

  const handleDelete = async (timeWindowId: string) => {
    try {
      await removeMutation.mutateAsync({ groupId, windowId: timeWindowId });
      onRefresh?.();
    } catch (error) {
      console.error('Error deleting time window:', error);
    }
  };

  const handleToggleActive = async (timeWindowId: string, isActive: boolean) => {
    try {
      await updateMutation.mutateAsync({
        groupId,
        windowId: timeWindowId,
        data: { isActive },
      });
      onRefresh?.();
    } catch (error) {
      console.error('Error toggling time window:', error);
    }
  };

  const handleSave = async (data: CreateTimeWindowRequest | UpdateTimeWindowRequest) => {
    try {
      if (editingWindow?._id) {
        // Update existing window
        await updateMutation.mutateAsync({
          groupId,
          windowId: editingWindow._id,
          data: data as UpdateTimeWindowRequest,
        });
      } else {
        // Create new window
        await addMutation.mutateAsync({
          groupId,
          data: data as CreateTimeWindowRequest,
        });
      }

      setShowForm(false);
      setEditingWindow(null);
      onRefresh?.();
    } catch (error) {
      console.error('Error saving time window:', error);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingWindow(null);
  };

  if (showForm) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-text-primary">
              {editingWindow ? 'Edit Time Window' : 'Add Time Window'}
            </h3>
            <p className="text-sm text-text-secondary">
              {editingWindow
                ? 'Modify the time window settings'
                : 'Configure when group members can access the system'}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            disabled={isLoading}
            className="flex items-center gap-1"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Form */}
        <div className="rounded-lg border border-border-light bg-surface-secondary p-6">
          <TimeWindowForm
            timeWindow={editingWindow || undefined}
            isEditing={!!editingWindow}
            onSave={handleSave}
            onCancel={handleCancel}
            isLoading={isLoading}
          />
        </div>
      </div>
    );
  }

  return (
    <TimeWindowList
      timeWindows={timeWindows}
      onAdd={handleAdd}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onToggleActive={handleToggleActive}
      isLoading={isLoading}
    />
  );
}
