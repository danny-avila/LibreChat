/* eslint-disable i18next/no-literal-string */
import React from 'react';
import type { Task, TaskStatus } from './types';

// One accent color per column status
const ACCENT: Record<TaskStatus, string> = {
  todo: 'bg-red-400',
  in_progress: 'bg-purple-500',
  review: 'bg-orange-400',
  done: 'bg-green-500',
};

interface TaskCardProps {
  task: Task;
  onStatusChange: (id: string, data: Partial<Task>) => void;
}

export default function TaskCard({ task, onStatusChange }: TaskCardProps) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('taskId', task._id);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="cursor-grab rounded-lg border border-gray-200 bg-white p-3 shadow-sm active:cursor-grabbing dark:border-gray-700 dark:bg-gray-800"
    >
      {/* Colored accent bar */}
      <div className={`mb-2 h-1 w-8 rounded-full ${ACCENT[task.status]}`} />
      <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{task.title}</p>
      {task.description && (
        <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{task.description}</p>
      )}
    </div>
  );
}
