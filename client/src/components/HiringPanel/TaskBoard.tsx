/* eslint-disable i18next/no-literal-string */
import React, { useState, useRef } from 'react';
import { Plus, MoreHorizontal } from 'lucide-react';
import type { Task, TaskStatus, CreateTaskInput } from './types';
import TaskCard from './TaskCard';

const DEFAULT_COLUMNS: { id: string; label: string }[] = [
  { id: 'todo', label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
];

interface TaskBoardProps {
  tasks: Task[];
  loading: boolean;
  onCreateTask: (data: CreateTaskInput) => Promise<Task | void>;
  onUpdateTask: (id: string, data: Partial<Task>) => Promise<Task | void>;
  onSwitchToTeam?: () => void;
}

export default function TaskBoard({ tasks, loading, onCreateTask, onUpdateTask }: TaskBoardProps) {
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [addingInColumn, setAddingInColumn] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [titleError, setTitleError] = useState('');
  const [creating, setCreating] = useState(false);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const columnInputRef = useRef<HTMLInputElement>(null);
  const cardInputRef = useRef<HTMLInputElement>(null);

  const startAdding = (colId: string) => {
    setAddingInColumn(colId);
    setNewTitle('');
    setTitleError('');
    setTimeout(() => cardInputRef.current?.focus(), 50);
  };

  const cancelAdding = () => {
    setAddingInColumn(null);
    setNewTitle('');
    setTitleError('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      setTitleError('Title is required');
      return;
    }
    setTitleError('');
    setCreating(true);
    try {
      const task = await onCreateTask({ title: newTitle.trim() });
      if (task && addingInColumn && addingInColumn !== 'todo') {
        await onUpdateTask((task as Task)._id, { status: addingInColumn as TaskStatus });
      }
      cancelAdding();
    } finally {
      setCreating(false);
    }
  };

  const handleDrop = async (e: React.DragEvent, status: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    const taskId = e.dataTransfer.getData('taskId');
    if (!taskId) return;
    const task = tasks.find((t) => t._id === taskId);
    // Only update if it's a known TaskStatus column
    const knownStatuses: TaskStatus[] = ['todo', 'in_progress', 'review', 'done'];
    if (task && task.status !== status && knownStatuses.includes(status as TaskStatus)) {
      await onUpdateTask(taskId, { status: status as TaskStatus });
    }
  };

  const handleAddColumn = (e: React.FormEvent) => {
    e.preventDefault();
    const title = newColumnTitle.trim();
    if (!title) return;
    const id = title.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now();
    setColumns((prev) => [...prev, { id, label: title }]);
    setNewColumnTitle('');
    setShowAddColumn(false);
  };

  const openAddColumn = () => {
    setShowAddColumn(true);
    setTimeout(() => columnInputRef.current?.focus(), 50);
  };

  const totalTasks = tasks.length;

  return (
    <div className="flex h-full flex-col p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Task Board</h2>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            {totalTasks} task{totalTasks !== 1 ? 's' : ''} across {columns.length} columns
          </p>
        </div>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-gray-400">Loading…</p>
      ) : (
        /* Horizontally scrollable columns */
        <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
          {columns.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.id);
            const isOver = dragOverColumn === col.id;

            return (
              <div
                key={col.id}
                onDrop={(e) => handleDrop(e, col.id)}
                onDragOver={(e) => { e.preventDefault(); setDragOverColumn(col.id); }}
                onDragLeave={() => setDragOverColumn(null)}
                className={`flex w-56 shrink-0 flex-col rounded-xl transition-colors ${
                  isOver ? 'bg-gray-100 dark:bg-gray-700/50' : 'bg-gray-50 dark:bg-gray-800/40'
                }`}
              >
                {/* Column header */}
                <div className="flex items-center justify-between px-3 pt-3 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                      {col.label}
                    </span>
                    <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      {colTasks.length}
                    </span>
                  </div>
                  <button className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>

                {/* Cards */}
                <div className="flex flex-1 flex-col gap-2 px-3">
                  {colTasks.map((task) => (
                    <TaskCard key={task._id} task={task} onStatusChange={onUpdateTask} />
                  ))}
                </div>

                {/* Inline add card */}
                <div className="px-3 pb-3 pt-2">
                  {addingInColumn === col.id ? (
                    <form onSubmit={handleCreate} className="flex flex-col gap-1.5">
                      <input
                        ref={cardInputRef}
                        type="text"
                        placeholder="Card title…"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      />
                      {titleError && <p className="text-xs text-red-500">{titleError}</p>}
                      <div className="flex gap-1.5">
                        <button
                          type="submit"
                          disabled={creating}
                          className="flex-1 rounded-lg bg-gray-900 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900"
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={cancelAdding}
                          className="flex-1 rounded-lg border border-gray-200 py-1.5 text-xs text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      onClick={() => startAdding(col.id)}
                      className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
                    >
                      <Plus className="h-4 w-4" />
                      Add a card
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Add Column */}
          <div className="flex w-56 shrink-0 items-start pt-3">
            {showAddColumn ? (
              <form
                onSubmit={handleAddColumn}
                className="w-full rounded-xl bg-gray-50 p-3 dark:bg-gray-800/40"
              >
                <input
                  ref={columnInputRef}
                  type="text"
                  placeholder="Column title..."
                  value={newColumnTitle}
                  onChange={(e) => setNewColumnTitle(e.target.value)}
                  className="w-full rounded-lg border-2 border-gray-900 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none dark:border-gray-200 dark:bg-gray-700 dark:text-gray-100"
                />
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="submit"
                    className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddColumn(false); setNewColumnTitle(''); }}
                    className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={openAddColumn}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                <Plus className="h-4 w-4" />
                Add Column
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
