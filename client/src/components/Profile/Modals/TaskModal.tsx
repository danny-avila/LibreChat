import React, { useState, useEffect } from 'react';
import { Task, User } from '../types';

interface Props {
  mode: 'create' | 'edit';
  task?: Task | null;
  employees: User[];
  onSubmit: (data: any) => void;
  onClose: () => void;
  isSubmitting: boolean;
}

export default function TaskModal({
  mode,
  task,
  employees,
  onSubmit,
  onClose,
  isSubmitting,
}: Props) {
  const [form, setForm] = useState<Partial<Task>>({
    title: '',
    description: '',
    status: 'pending',
    priority: 'medium',
    assignedTo: '',
  });

  useEffect(() => {
    if (mode === 'edit' && task) setForm(task);
  }, [mode, task]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6">
        <h3 className="mb-4 font-bold capitalize">{mode} Task</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            className="w-full rounded border p-2"
            placeholder="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
          <textarea
            className="w-full rounded border p-2"
            placeholder="Desc"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              className="rounded border p-2"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value as any })}
            >
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="low">Low</option>
            </select>
            <select
              className="rounded border p-2"
              value={form.assignedTo}
              onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
            >
              <option value="">Assign To...</option>
              {employees.map((u) => (
                <option key={u.userId} value={u.userId}>
                  {u.username}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <button type="button" onClick={onClose} className="rounded border px-4 py-2">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded bg-blue-600 px-4 py-2 text-white"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
