import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, Plus, Trash2, History, Pause, Play, Pencil } from 'lucide-react';
import { Button } from '@librechat/client';
import {
  Permissions,
  SystemRoles,
  PermissionTypes,
} from 'librechat-data-provider';
import type { TScheduledTask } from 'librechat-data-provider';
import { useAuthContext, useHasAccess, useLocalize } from '~/hooks';
import {
  useGetScheduledTasks,
  useDeleteScheduledTask,
  useUpdateScheduledTask,
} from '~/data-provider';
import { nextPauseStatus } from './helpers';
import AdminSettings from './AdminSettings';
import TaskRunsModal from './TaskRunsModal';

/**
 * Side-panel entry for Scheduled Tasks. Acts as a thin list view: clicking a
 * task or the `+` button routes the user to the full-page builder at
 * `/scheduled-tasks/...`, leaving pause/resume/delete/history quick actions
 * here for one-tap management.
 */
export default function ScheduledTasksPanel() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const canCreate = useHasAccess({
    permissionType: PermissionTypes.SCHEDULED_TASKS,
    permission: Permissions.CREATE,
  });
  const { data: tasks, isLoading } = useGetScheduledTasks();
  const updateMutation = useUpdateScheduledTask();
  const deleteMutation = useDeleteScheduledTask();

  const [viewingTaskId, setViewingTaskId] = useState<string | null>(null);
  const viewingTask = tasks?.find((t) => t._id === viewingTaskId) ?? null;
  const viewingTaskName = viewingTask?.name?.trim() || viewingTask?.payload?.model || viewingTask?.targetId;

  const openCreate = () => navigate('/scheduled-tasks/new');
  const openEdit = (task: TScheduledTask) => navigate(`/scheduled-tasks/${task._id}`);
  const togglePause = (task: TScheduledTask) =>
    updateMutation.mutate({ id: task._id, payload: { status: nextPauseStatus(task.status) } });

  return (
    <div className="flex h-full flex-col gap-4 p-4 text-text-primary">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CalendarClock className="h-5 w-5" />
          {localize('com_sidepanel_scheduled_tasks')}
        </h2>
        {canCreate && (
          <Button
            variant="ghost"
            size="icon"
            onClick={openCreate}
            className="rounded-md p-1 hover:bg-surface-hover"
            aria-label={localize('com_sidepanel_new_task')}
          >
            <Plus className="h-5 w-5" />
          </Button>
        )}
      </div>

      {user?.role === SystemRoles.ADMIN && <AdminSettings />}

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="text-sm text-text-secondary">{localize('com_ui_loading')}</div>
        ) : tasks?.length === 0 ? (
          <div className="text-sm text-text-secondary">
            {localize('com_sidepanel_no_tasks')}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {tasks?.map((task) => {
              const modelLabel = task.payload?.model ?? task.targetId;
              const displayName = task.name?.trim() || modelLabel;
              const statusDot =
                task.status === 'active'
                  ? 'bg-green-500'
                  : task.status === 'paused'
                    ? 'bg-yellow-500'
                    : 'bg-gray-400';
              const statusLabel =
                task.status === 'paused'
                  ? localize('com_sidepanel_resume_task')
                  : localize('com_sidepanel_pause_task');
              return (
                <div
                  key={task._id}
                  className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-hover"
                >
                  <span
                    aria-label={task.status}
                    className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${statusDot}`}
                  />
                  <button
                    type="button"
                    onClick={() => openEdit(task)}
                    className="min-w-0 flex-1 truncate text-left text-sm text-text-primary"
                    title={displayName}
                  >
                    {displayName}
                  </button>
                  <div className="flex flex-shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => togglePause(task)}
                      className="h-6 w-6 text-text-secondary hover:text-text-primary"
                      title={statusLabel}
                      disabled={
                        updateMutation.isLoading ||
                        (task.status !== 'active' && task.status !== 'paused')
                      }
                    >
                      {task.status === 'paused' ? (
                        <Play className="h-3.5 w-3.5" />
                      ) : (
                        <Pause className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(task)}
                      className="h-6 w-6 text-text-secondary hover:text-text-primary"
                      title={localize('com_sidepanel_edit_task')}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setViewingTaskId(task._id)}
                      className="h-6 w-6 text-text-secondary hover:text-text-primary"
                      title={localize('com_sidepanel_task_runs')}
                    >
                      <History className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(task._id)}
                      className="h-6 w-6 text-text-secondary hover:text-red-500"
                      title={localize('com_ui_delete')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <TaskRunsModal
        taskId={viewingTaskId || ''}
        taskName={viewingTaskName}
        isOpen={!!viewingTaskId}
        onClose={() => setViewingTaskId(null)}
      />
    </div>
  );
}
