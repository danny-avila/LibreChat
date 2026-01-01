import React from 'react';
import { Task, User } from '../EmployeeDashboard';

interface TaskModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  taskForm: Task;
  setTaskForm: (form: Task) => void;
  onSubmit: () => void;
  onClose: () => void;
  isSubmitting: boolean;
  employees: User[];
}

const TaskModal: React.FC<TaskModalProps> = ({
  open,
  mode,
  taskForm,
  setTaskForm,
  onSubmit,
  onClose,
  isSubmitting,
  employees,
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
        <h3 className="mb-4 text-lg font-bold">{mode === 'create' ? 'Add Task' : 'Edit Task'}</h3>
        <div className="space-y-4">
          <input
            className="w-full rounded border p-2 text-sm"
            placeholder="Title"
            value={taskForm.title}
            onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
            disabled={isSubmitting}
          />
          <textarea
            className="w-full rounded border p-2 text-sm"
            placeholder="Description"
            rows={3}
            value={taskForm.description}
            onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
            disabled={isSubmitting}
          />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-500">Assign To</label>
              <select
                className="w-full rounded border bg-white p-2 text-sm"
                value={taskForm.assignedTo}
                onChange={(e) => setTaskForm({ ...taskForm, assignedTo: e.target.value })}
                disabled={isSubmitting}
              >
                <option value="">Select Employee...</option>
                {employees.map((emp) => (
                  <option key={emp.userId} value={emp.userId}>
                    {emp.username || emp.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500">Due Date</label>
              <input
                type="date"
                className="w-full rounded border p-2 text-sm"
                value={taskForm.dueDate}
                onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                disabled={isSubmitting}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <select
              className="rounded border p-2 text-sm"
              value={taskForm.priority}
              onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value as any })}
              disabled={isSubmitting}
            >
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="low">Low</option>
            </select>
            <select
              className="rounded border p-2 text-sm"
              value={taskForm.status}
              onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value as any })}
              disabled={isSubmitting}
            >
              <option value="pending">Pending</option>
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2 border-t pt-4">
          <button
            onClick={onClose}
            className="rounded border px-4 py-2 text-sm"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white"
            disabled={isSubmitting}
          >
            {mode === 'create' ? 'Create' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TaskModal;
