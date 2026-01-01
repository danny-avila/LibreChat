import React from 'react';
import { Task, User } from '../EmployeeDashboard';


interface TaskListProps {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onSelect?: (task: Task) => void;
  employees?: User[];
}



const TaskList: React.FC<TaskListProps> = ({ tasks, onEdit, onDelete, onSelect, employees }) => {
  if (!tasks.length) return (
    <div className="rounded-lg border bg-gray-50 py-10 text-center text-gray-400 text-lg">
      No tasks found.
    </div>
  );
  return (
    <div className="grid grid-cols-1 gap-5">
      {tasks.map((task) => (
        <div
          key={task._id || task.id}
          className="flex flex-col md:flex-row md:items-center md:justify-between rounded-xl border border-border-light bg-white p-5 shadow-sm transition-all hover:shadow-md"
        >
          <div onClick={() => onSelect && onSelect(task)} className="flex-1 cursor-pointer">
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-block w-2 h-2 rounded-full ${
                task.status === 'completed' ? 'bg-green-500' : task.status === 'in-progress' ? 'bg-blue-500' : 'bg-gray-400'
              }`}></span>
              <span className="text-lg font-semibold text-text-primary">{task.title}</span>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-1">
              <span>Status: <span className="font-bold">{task.status}</span></span>
              <span>Priority: <span className="font-bold">{task.priority}</span></span>
              <span>Due: {task.dueDate || '-'}</span>
            </div>
            {employees && (
              <div className="text-xs text-gray-500">
                Assigned to: <span className="font-bold">{task.assignedTo
                  ? employees.find((e) => e.userId === task.assignedTo)?.username || task.assignedTo
                  : 'Unassigned'}</span>
              </div>
            )}
          </div>
          <div className="mt-3 flex gap-2 md:mt-0">
            <button className="btn btn-secondary" onClick={() => onEdit(task)}>
              Edit
            </button>
            <button className="btn btn-danger" onClick={() => onDelete(task)}>
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default TaskList;
