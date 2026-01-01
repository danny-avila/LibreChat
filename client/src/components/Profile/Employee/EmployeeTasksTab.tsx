import React from 'react';
import TaskList from '../Employee/TaskList';

export default function EmployeeTasksTab({
  tasks,
  taskSearch,
  setTaskSearch,
  onAddTask,
  onEditTask,
  onDeleteTask,
}) {
  // Filter and sort tasks by name (or dueDate if available)
  const filteredTasks = tasks
    .filter((t) => t.title?.toLowerCase().includes(taskSearch.toLowerCase()))
    .sort((a, b) => {
      if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate) - new Date(b.dueDate);
      }
      return a.title.localeCompare(b.title);
    });

  return (
    <div className="duration-500 animate-in fade-in">
      <div className="mb-4 flex flex-col items-center justify-between gap-3 md:flex-row">
        <h2 className="text-xl font-semibold">All Tasks</h2>
        <div className="flex w-full gap-2 md:w-auto">
          <div className="relative flex-1 md:w-64">
            <input
              type="text"
              placeholder="Search tasks..."
              className="w-full rounded-lg border py-2 pl-9 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              value={taskSearch}
              onChange={(e) => setTaskSearch(e.target.value)}
            />
            <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
          </div>
          <button
            onClick={onAddTask}
            className="btn btn-primary flex items-center gap-1 whitespace-nowrap"
          >
            <span>+</span> New Task
          </button>
        </div>
      </div>
      <TaskList
        tasks={filteredTasks}
        searchTerm={taskSearch}
        onEdit={onEditTask}
        onDelete={onDeleteTask}
      />
    </div>
  );
}
