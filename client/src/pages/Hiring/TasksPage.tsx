import { useHiringTasks } from '~/hooks/useHiringTasks';
import TaskBoard from '~/components/HiringPanel/TaskBoard';
import { useNavigate } from 'react-router-dom';

export default function TasksPage() {
  const { tasks, loading, createTask, updateTask } = useHiringTasks();
  const navigate = useNavigate();

  return (
    <div className="h-full overflow-hidden">
      <TaskBoard
        tasks={tasks}
        loading={loading}
        onCreateTask={createTask}
        onUpdateTask={updateTask}
        onSwitchToTeam={() => navigate('/hiring/team')}
      />
    </div>
  );
}
