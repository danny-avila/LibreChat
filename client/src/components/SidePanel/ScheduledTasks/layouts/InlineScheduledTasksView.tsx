import { useMemo } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useGetScheduledTasks } from '~/data-provider';
import { useLocalize } from '~/hooks';
import TaskForm from '../TaskForm';

/**
 * Full-page Scheduled Tasks builder route. Mirrors `InlinePromptsView`: the
 * route lazy-loads this component which then renders the create or edit form
 * inside the same scroll container that the chat normally occupies.
 */
export default function InlineScheduledTasksView() {
  const localize = useLocalize();
  const { taskId } = useParams();
  const isNew = taskId === undefined;
  const { data: tasks, isLoading } = useGetScheduledTasks();

  const task = useMemo(
    () => (taskId ? tasks?.find((t) => t._id === taskId) : undefined),
    [tasks, taskId],
  );

  if (!isNew && !isLoading && !task) {
    return <Navigate to="/scheduled-tasks/new" replace />;
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
