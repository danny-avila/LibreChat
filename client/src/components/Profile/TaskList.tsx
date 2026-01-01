import React, { useState, useMemo } from 'react';
import { Task } from '../types';

interface TaskListProps {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onSelect?: (task: Task) => void;
  searchTerm?: string;
}

type SortKey = 'dueDate' | 'priority' | 'status' | 'title';

const TaskList: React.FC<TaskListProps> = ({
  tasks,
  onEdit,
  onDelete,
  onSelect,
  searchTerm = '',
}) => {
  const [sortKey, setSortKey] = useState<SortKey>('dueDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const processedTasks = useMemo(() => {
    let result = [...tasks];

    // 1. FILTERING
    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(
        (t) =>
          (t.title || '').toLowerCase().includes(lower) ||
          (t.description || '').toLowerCase().includes(lower),
      );
    }

    // 2. SORTING
    result.sort((a, b) => {
      let valA: any = a[sortKey];
      let valB: any = b[sortKey];

      if (sortKey === 'priority') {
        const pWeight: Record<string, number> = { high: 3, medium: 2, low: 1 };
        valA = pWeight[valA?.toLowerCase()] || 0;
        valB = pWeight[valB?.toLowerCase()] || 0;
        if (valA < valB) return sortDir === 'asc' ? -1 : 1;
        if (valA > valB) return sortDir === 'asc' ? 1 : -1;
        return 0;
      }

      if (sortKey === 'status') {
        // Urutan status: In Progress paling atas, lalu Pending, lalu Completed
        const sWeight: Record<string, number> = { 'in-progress': 3, pending: 2, completed: 1 };
        valA = sWeight[valA?.toLowerCase()] || 0;
        valB = sWeight[valB?.toLowerCase()] || 0;
      }

      if (sortKey === 'dueDate') {
        valA = new Date(valA || '2099-12-31').getTime();
        valB = new Date(valB || '2099-12-31').getTime();
      }

      // Default string sort (title)
      if (sortKey === 'title') {
        valA = (valA || '').toLowerCase();
        valB = (valB || '').toLowerCase();
      }

      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [tasks, searchTerm, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const getSortIcon = (key: SortKey) => {
    if (sortKey !== key) return <span className="ml-1 text-gray-300">↕</span>;
    return sortDir === 'asc' ? (
      <span className="ml-1 text-blue-600">↑</span>
    ) : (
      <span className="ml-1 text-blue-600">↓</span>
    );
  };

  if (!tasks.length) return <div className="py-8 text-center text-gray-400">No tasks found.</div>;

  return (
    <div className="space-y-3">
      {/* HEADER SORTING */}
      <div className="mb-2 flex gap-2 overflow-x-auto pb-2 text-xs font-semibold text-gray-500">
        <button
          onClick={() => handleSort('dueDate')}
          className={`flex items-center rounded border px-3 py-1 transition-colors ${sortKey === 'dueDate' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'bg-white hover:bg-gray-50'}`}
        >
          Due Date {getSortIcon('dueDate')}
        </button>
        <button
          onClick={() => handleSort('priority')}
          className={`flex items-center rounded border px-3 py-1 transition-colors ${sortKey === 'priority' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'bg-white hover:bg-gray-50'}`}
        >
          Priority {getSortIcon('priority')}
        </button>
        <button
          onClick={() => handleSort('status')}
          className={`flex items-center rounded border px-3 py-1 transition-colors ${sortKey === 'status' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'bg-white hover:bg-gray-50'}`}
        >
          Status {getSortIcon('status')}
        </button>
      </div>

      {processedTasks.map((task) => {
        const isCompleted = task.status === 'completed';

        return (
          <div
            key={task._id || task.id}
            className={`flex items-center justify-between rounded-lg border p-4 shadow-sm transition-all ${isCompleted ? 'border-gray-200 bg-gray-50 opacity-80' : 'border-border-light bg-white hover:shadow-md'}`}
          >
            <div className="flex-1 cursor-pointer" onClick={() => onSelect && onSelect(task)}>
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${task.priority === 'high' ? 'bg-red-500' : task.priority === 'medium' ? 'bg-yellow-500' : 'bg-blue-500'}`}
                ></span>
                <div
                  className={`font-semibold text-text-primary ${isCompleted ? 'text-gray-500 line-through' : ''}`}
                >
                  {task.title}
                </div>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                    task.status === 'completed'
                      ? 'bg-green-100 text-green-700'
                      : task.status === 'in-progress'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {task.status}
                </span>
              </div>
              <div className="mt-1 pl-4 text-xs text-gray-500">
                Due: {task.dueDate || 'No Date'}{' '}
                {task.assignedName ? `• Assigned to: ${task.assignedName}` : ''}
              </div>
            </div>

            <div className="ml-4 flex gap-2">
              {/* TOMBOL EDIT: Disabled jika Completed */}
              <button
                className={`rounded border px-2 py-1 text-xs transition-colors ${
                  isCompleted
                    ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400' // Disabled Style
                    : 'border-blue-100 bg-white text-blue-600 hover:bg-blue-50' // Active Style
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  !isCompleted && onEdit(task);
                }}
                disabled={isCompleted}
                title={isCompleted ? 'Cannot edit completed task' : 'Edit Task'}
              >
                Edit
              </button>

              {/* TOMBOL DELETE: Disabled jika BELUM Completed */}
              <button
                className={`rounded border px-2 py-1 text-xs transition-colors ${
                  !isCompleted
                    ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400' // Disabled Style
                    : 'border-red-100 bg-white text-red-600 hover:bg-red-50' // Active Style
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  isCompleted && onDelete(task);
                }}
                disabled={!isCompleted}
                title={!isCompleted ? 'Complete task to delete' : 'Delete Task'}
              >
                Del
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default TaskList;
