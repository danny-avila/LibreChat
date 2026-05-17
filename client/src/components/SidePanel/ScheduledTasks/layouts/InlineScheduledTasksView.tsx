import { useMemo } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { Permissions, PermissionTypes } from 'librechat-data-provider';
import { useGetScheduledTasks } from '~/data-provider';
import { useHasAccess, useLocalize } from '~/hooks';
import TaskForm from '../TaskForm';

/**
 * Full-page Scheduled Tasks builder route. Mirrors `InlinePromptsView`: the
 * route lazy-loads this component which then renders the create or edit form
 * inside the same scroll container that the chat normally occupies.
 *
 * Permission gates:
 *  - `SCHEDULED_TASKS / USE` is required to render any builder view; a denied
 *    user is redirected to `/c/new` (same fallback the side-panel uses when
 *    the entry is hidden).
 *  - `SCHEDULED_TASKS / CREATE` is required for the `/new` route; without it,
 *    we redirect to the list so existing tasks can still be inspected.
 */
export default function InlineScheduledTasksView() {
  const localize = useLocalize();
  const { taskId } = useParams();
  const isNew = taskId === undefined;
  const canUse = useHasAccess({
    permissionType: PermissionTypes.SCHEDULED_TASKS,
    permission: Permissions.USE,
  });
  const canCreate = useHasAccess({
    permissionType: PermissionTypes.SCHEDULED_TASKS,
    permission: Permissions.CREATE,
  });
  const { data: tasks, isLoading } = useGetScheduledTasks({ enabled: canUse });

  const task = useMemo(
    () => (taskId ? tasks?.find((t) => t._id === taskId) : undefined),
    [tasks, taskId],
  );

  if (!canUse) {
    return <Navigate to="/c/new" replace />;
  }

  if (isNew && !canCreate) {
    return <Navigate to="/c/new" replace />;
  }

  if (!isNew && !isLoading && !task) {
    return <Navigate to={canCreate ? '/scheduled-tasks/new' : '/c/new'} replace />;
  }

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-presentation">
      {isLoading && !isNew ? (
        <div className="flex h-full items-center justify-center text-sm text-text-secondary">
          {localize('com_ui_loading')}
        </div>
      ) : (
        <TaskForm task={task} />
      )}
    </div>
  );
}
