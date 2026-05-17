import React, { useState } from 'react';
import { useLocalize, useMCPServerManager } from '~/hooks';
import { useGetScheduledTasks, useCreateScheduledTask, useDeleteScheduledTask } from '~/data-provider';
import { CalendarClock, Plus, Trash2, History } from 'lucide-react';
import { Button, Input, SelectDropDown, TextareaAutosize, Checkbox, Switch } from '@librechat/client';
import TaskRunsModal from './TaskRunsModal';

export default function ScheduledTasksPanel() {
  const localize = useLocalize();
  const { data: tasks, isLoading } = useGetScheduledTasks();
  const createMutation = useCreateScheduledTask();
  const deleteMutation = useDeleteScheduledTask();
  const { availableMCPServers } = useMCPServerManager();

  const [isCreating, setIsCreating] = useState(false);
  const [viewingTaskId, setViewingTaskId] = useState<string | null>(null);
  const [newTask, setNewTask] = useState<{
    targetType: 'agent' | 'assistant';
    targetId: string;
    triggerType: 'cron' | 'interval' | 'date';
    expression: string;
    payload: {
      text?: string;
      isTemporary?: boolean;
      ephemeralAgent?: {
        web_search?: boolean;
        file_search?: boolean;
        execute_code?: boolean;
        mcp?: string[];
      };
    };
    status: 'active' | 'paused' | 'completed' | 'failed';
    outputConversationId: string;
  }>({
    targetType: 'agent',
    targetId: '',
    triggerType: 'cron',
    expression: '0 * * * *',
    payload: { 
      text: '', 
      isTemporary: false,
      ephemeralAgent: {
        web_search: false,
        file_search: false,
        execute_code: false,
        mcp: []
      }
    },
    status: 'active',
    outputConversationId: '',
  });

  const handleCreate = () => {
    if (!newTask.targetId || !newTask.payload.text) return;
    
    // Create a copy and remove empty optional fields
    const { outputConversationId, ...rest } = newTask;
    const payloadToSubmit: any = outputConversationId ? { ...rest, outputConversationId } : rest;

    createMutation.mutate(payloadToSubmit, {
      onSuccess: () => {
        setIsCreating(false);
        setNewTask({
          targetType: 'agent',
          targetId: '',
          triggerType: 'cron',
          expression: '0 * * * *',
          payload: { 
            text: '', 
            isTemporary: false,
            ephemeralAgent: {
              web_search: false,
              file_search: false,
              execute_code: false,
              mcp: [] as string[]
            }
          },
          status: 'active',
          outputConversationId: '',
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
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCreating(!isCreating)}
          className="rounded-md p-1 hover:bg-surface-hover"
        >
          <Plus className="h-5 w-5" />
        </Button>
      </div>

      {isCreating && (
        <div className="flex flex-col gap-3 rounded-lg border border-border-light p-3">
          <h3 className="font-medium">{localize('com_sidepanel_new_task')}</h3>
          
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">{localize('com_sidepanel_target_type')}</label>
            <SelectDropDown
              value={newTask.targetType}
              setValue={(val) => setNewTask({ ...newTask, targetType: val as 'agent' | 'assistant' })}
              availableValues={[
                { label: 'Agent', value: 'agent' },
                { label: 'Assistant', value: 'assistant' }
              ]}
              showAbove={false}
              showLabel={false}
              className="w-full"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">{localize('com_sidepanel_target_id')}</label>
            <Input
              type="text"
              value={newTask.targetId}
              onChange={(e) => setNewTask({ ...newTask, targetId: e.target.value })}
              placeholder="e.g. agent-123"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">{localize('com_sidepanel_output_conversation_id')}</label>
            <Input
              type="text"
              value={newTask.outputConversationId}
              onChange={(e) => setNewTask({ ...newTask, outputConversationId: e.target.value })}
              placeholder="Leave blank to create a new thread"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">{localize('com_sidepanel_cron_expression')}</label>
            <Input
              type="text"
              value={newTask.expression}
              onChange={(e) => setNewTask({ ...newTask, expression: e.target.value })}
              placeholder="0 * * * *"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">{localize('com_sidepanel_prompt')}</label>
            <TextareaAutosize
              value={newTask.payload.text as string}
              onChange={(e) => setNewTask({ ...newTask, payload: { ...newTask.payload, text: e.target.value } })}
              className="w-full rounded-md border border-border-light bg-surface-primary p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring-primary"
              minRows={3}
              placeholder="What should the agent do?"
            />
          </div>

          <div className="flex flex-col gap-3 mt-2 rounded-md border border-border-light p-3 bg-surface-secondary">
            <label className="text-sm font-medium">{localize('com_assistants_capabilities')}</label>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label htmlFor="web_search" className="text-sm cursor-pointer">{localize('com_ui_tool_name_web_search') || 'Web Search'}</label>
                <Switch
                  id="web_search"
                  checked={newTask.payload.ephemeralAgent?.web_search}
                  onCheckedChange={(checked) => setNewTask({ ...newTask, payload: { ...newTask.payload, ephemeralAgent: { ...newTask.payload.ephemeralAgent, web_search: !!checked } } })}
                  aria-label="Toggle Web Search"
                />
              </div>
              <div className="flex items-center justify-between">
                <label htmlFor="file_search" className="text-sm cursor-pointer">{localize('com_ui_tool_name_file_search') || 'File Search'}</label>
                <Switch
                  id="file_search"
                  checked={newTask.payload.ephemeralAgent?.file_search}
                  onCheckedChange={(checked) => setNewTask({ ...newTask, payload: { ...newTask.payload, ephemeralAgent: { ...newTask.payload.ephemeralAgent, file_search: !!checked } } })}
                  aria-label="Toggle File Search"
                />
              </div>
              <div className="flex items-center justify-between">
                <label htmlFor="execute_code" className="text-sm cursor-pointer">{localize('com_ui_tool_name_code') || 'Code Execution'}</label>
                <Switch
                  id="execute_code"
                  checked={newTask.payload.ephemeralAgent?.execute_code}
                  onCheckedChange={(checked) => setNewTask({ ...newTask, payload: { ...newTask.payload, ephemeralAgent: { ...newTask.payload.ephemeralAgent, execute_code: !!checked } } })}
                  aria-label="Toggle Code Execution"
                />
              </div>
            </div>

            {availableMCPServers.length > 0 && (
              <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-border-light">
                <label className="text-sm font-medium">{localize('com_ui_mcp_servers') || 'MCP Servers'}</label>
                <div className="flex flex-col gap-2 max-h-32 overflow-y-auto">
                  {availableMCPServers.map(server => (
                    <div key={server.serverName} className="flex items-center gap-2">
                      <Checkbox
                        id={`mcp_${server.serverName}`}
                        checked={newTask.payload.ephemeralAgent?.mcp?.includes(server.serverName)}
                        onCheckedChange={(checked) => {
                          const mcp = newTask.payload.ephemeralAgent?.mcp || [];
                          const newMcp = checked 
                            ? [...mcp, server.serverName]
                            : mcp.filter(name => name !== server.serverName);
                          setNewTask({ ...newTask, payload: { ...newTask.payload, ephemeralAgent: { ...newTask.payload.ephemeralAgent, mcp: newMcp } } });
                        }}
                      />
                      <label htmlFor={`mcp_${server.serverName}`} className="text-sm cursor-pointer truncate">
                        {server.serverName}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 mt-1">
            <Checkbox
              id="isTemporary"
              checked={newTask.payload.isTemporary as boolean}
              onCheckedChange={(checked) => setNewTask({ ...newTask, payload: { ...newTask.payload, isTemporary: !!checked } })}
              aria-label="Run as temporary chat"
            />
            <label htmlFor="isTemporary" className="text-sm cursor-pointer">
              {localize('com_sidepanel_temporary_chat')}
            </label>
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <Button
              variant="outline"
              onClick={() => setIsCreating(false)}
            >
              {localize('com_ui_cancel')}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isLoading || !newTask.targetId || !newTask.payload.text}
            >
              {createMutation.isLoading ? localize('com_ui_saving') : localize('com_ui_save')}
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="text-sm text-text-secondary">{localize('com_ui_loading')}</div>
        ) : tasks?.length === 0 ? (
          <div className="text-sm text-text-secondary">{localize('com_sidepanel_no_tasks')}</div>
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
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setViewingTaskId(task._id)}
                      className="text-text-secondary hover:text-text-primary"
                      title={localize('com_sidepanel_task_runs')}
                    >
                      <History className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(task._id)}
                      className="text-text-secondary hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="text-sm line-clamp-2 mt-1">
                  {task.payload.text as string}
                </div>
                {task.lastRunAt && (
                  <div className="text-xs text-text-secondary mt-1">
                    {localize('com_sidepanel_last_run')}: {new Date(task.lastRunAt).toLocaleString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <TaskRunsModal 
        taskId={viewingTaskId || ''} 
        isOpen={!!viewingTaskId} 
        onClose={() => setViewingTaskId(null)} 
      />
    </div>
  );
}
