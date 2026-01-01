import React, { useState, useEffect } from 'react';
import { Project } from '../types'; // Pastikan path import types ini benar

interface Props {
  mode: 'create' | 'edit';
  project?: Project | null;
  onSubmit: (data: Partial<Project>) => void;
  onClose: () => void;
  isSubmitting: boolean;
}

export default function ProjectModal({ mode, project, onSubmit, onClose, isSubmitting }: Props) {
  // Default state
  const defaultForm: Partial<Project> = {
    name: '',
    description: '',
    status: 'planning',
    budget: 0,
    spent: 0,
    progress: 0,
    startDate: new Date().toISOString().split('T')[0],
    deadline: '',
  };

  const [form, setForm] = useState<Partial<Project>>(defaultForm);

  // Isi form jika mode edit
  useEffect(() => {
    if (mode === 'edit' && project) {
      setForm({
        name: project.name,
        description: project.description,
        status: project.status,
        budget: project.budget,
        spent: project.spent,
        progress: project.progress,
        startDate: project.startDate ? project.startDate.split('T')[0] : '',
        deadline: project.deadline ? project.deadline.split('T')[0] : '',
        projectId: project.projectId || project._id, // Pastikan ID terbawa
      });
    } else {
      setForm(defaultForm);
    }
  }, [mode, project]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 duration-200 animate-in fade-in">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold capitalize">{mode} Project</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-bold uppercase text-gray-500">Project Name</label>
            <input
              className="w-full rounded border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter project name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase text-gray-500">Description</label>
            <textarea
              className="w-full rounded border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Project description"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              required
              disabled={isSubmitting}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase text-gray-500">Budget ($)</label>
              <input
                type="number"
                className="w-full rounded border border-gray-300 p-2"
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: +e.target.value })}
                disabled={isSubmitting}
              />
            </div>
            {mode === 'edit' && (
              <div>
                <label className="text-xs font-bold uppercase text-gray-500">Progress (%)</label>
                <input
                  type="number"
                  className="w-full rounded border border-gray-300 p-2"
                  value={form.progress}
                  onChange={(e) => setForm({ ...form, progress: +e.target.value })}
                  min="0"
                  max="100"
                  disabled={isSubmitting}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase text-gray-500">Start Date</label>
              <input
                type="date"
                className="w-full rounded border border-gray-300 p-2"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                disabled={isSubmitting}
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-gray-500">Deadline</label>
              <input
                type="date"
                className="w-full rounded border border-gray-300 p-2"
                value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase text-gray-500">Status</label>
            <select
              className="w-full rounded border border-gray-300 bg-white p-2"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as any })}
              disabled={isSubmitting}
            >
              <option value="planning">Planning</option>
              <option value="active">Active</option>
              <option value="on-hold">On Hold</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div className="mt-4 flex justify-end gap-2 border-t pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded border px-4 py-2 text-gray-600 transition-colors hover:bg-gray-50"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
            >
              {isSubmitting && (
                <svg
                  className="h-4 w-4 animate-spin text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              )}
              {mode === 'create' ? 'Create Project' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
