import React, { useState } from 'react';
import { useLocalize } from '~/hooks';
import { useGetScheduledTasks, useCreateScheduledTask, useDeleteScheduledTask } from '~/data-provider';
import { CalendarClock, Plus, Trash2 } from 'lucide-react';

export default function ScheduledTasksPanel() {
  const localize = useLocalize();
  const { data: tasks, isLoading } = useGetScheduledTasks();
  const createMutation = useCreateScheduledTask();
  const deleteMutation = useDeleteScheduledTask();

  const [isCreating, setIsCreating] = useState(false);
  const [newTask, setNewTask] = useState({
    targetType: 'agent' as const,
    targetId: '',
    triggerType: 'cron' as const,
    expression: '0 * * * *',
    payload: { text: '' },
    status: 'active' as const,
  });

  const handleCreate = () => {
    if (!newTask.targetId || !newTask.payload.text) return;
    createMutation.mutate(newTask, {
      onSuccess: () => {
        setIsCreating(false);
        setNewTask({
          targetType: 'agent',
          targetId: '',
          triggerType: 'cron',
          expression: '0 * * * *',
          payload: { text: '' },
          status: 'active',
        });
      },
    });
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4 text-text-primary">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <CalendarClock className="h-5 w-5" />
          {localize('com_sidepanel_scheduled_tasks')}
        </h2>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="rounded-md p-1 hover:bg-surface-hover"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {isCreating && (
        <div className="flex flex-col gap-3 rounded-lg border border-border-light p-3">
          <h3 className="font-medium">New Task</h3>
          
          <div className="flex flex-col gap-1">
            <label className="text-sm">Target Type</label>
            <select
              value={newTask.targetType}
              onChange={(e) => setNewTask({ ...newTask, targetType: e.target.value as 'agent' | 'assistant' })}
              className="rounded-md border border-border-light bg-surface-primary p-2 text-sm"
            >
              <option value="agent">Agent</option>
              <option value="assistant">Assistant</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm">Target ID (Agent/Assistant ID)</label>
            <input
              type="text"
              value={newTask.targetId}
              onChange={(e) => setNewTask({ ...newTask, targetId: e.target.value })}
              className="rounded-md border border-border-light bg-surface-primary p-2 text-sm"
              placeholder="e.g. agent-123"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm">Cron Expression</label>
            <input
              type="text"
              value={newTask.expression}
              onChange={(e) => setNewTask({ ...newTask, expression: e.target.value })}
              className="rounded-md border border-border-light bg-surface-primary p-2 text-sm"
              placeholder="0 * * * *"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm">Prompt</label>
            <textarea
              value={newTask.payload.text}
              onChange={(e) => setNewTask({ ...newTask, payload: { ...newTask.payload, text: e.target.value } })}
              className="rounded-md border border-border-light bg-surface-primary p-2 text-sm"
              rows={3}
              placeholder="What should the agent do?"
            />
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={() => setIsCreating(false)}
              className="rounded-md px-3 py-1.5 text-sm hover:bg-surface-hover"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={createMutation.isPending || !newTask.targetId || !newTask.payload.text}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="text-sm text-text-secondary">Loading...</div>
        ) : tasks?.length === 0 ? (
          <div className="text-sm text-text-secondary">No scheduled tasks found.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {tasks?.map((task) => (
              <div key={task._id} className="flex flex-col gap-2 rounded-lg border border-border-light p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-medium text-sm">
                      {task.targetType === 'agent' ? 'Agent' : 'Assistant'} Task
                    </span>
                    <div className="text-xs text-text-secondary font-mono mt-1">
                      {task.expression}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${task.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {task.status}
                    </span>
                    <button
                      onClick={() => deleteMutation.mutate(task._id)}
                      className="text-text-secondary hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="text-sm line-clamp-2 mt-1">
                  {task.payload.text as string}
                </div>
                {task.lastRunAt && (
                  <div className="text-xs text-text-secondary mt-1">
                    Last run: {new Date(task.lastRunAt).toLocaleString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
