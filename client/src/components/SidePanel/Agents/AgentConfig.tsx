import React, { useState, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Controller, useWatch, useFormContext } from 'react-hook-form';
import { QueryKeys, EModelEndpoint, AgentCapabilities } from 'librechat-data-provider';
import type { TPlugin } from 'librechat-data-provider';
import type { AgentForm, AgentPanelProps, IconComponentTypes } from '~/common';
import { cn, defaultTextProps, removeFocusOutlines, getEndpointField, getIconKey } from '~/utils';
import { useToastContext, useFileMapContext } from '~/Providers';
import { icons } from '~/components/Chat/Menus/Endpoints/Icons';
import Action from '~/components/SidePanel/Builder/Action';
import { ToolSelectDialog } from '~/components/Tools';
import { processAgentOption } from '~/utils';
import AgentAvatar from './AgentAvatar';
import FileContext from './FileContext';
import { useLocalize } from '~/hooks';
import FileSearch from './FileSearch';
import Artifacts from './Artifacts';
import AgentTool from './AgentTool';
import CodeForm from './Code/Form';
import { Panel } from '~/common';

const labelClass = 'mb-2 text-token-text-primary block font-medium';
const inputClass = cn(
  defaultTextProps,
  'flex w-full px-3 py-2 border-border-light bg-surface-secondary focus-visible:ring-2 focus-visible:ring-ring-primary',
  removeFocusOutlines,
);

export default function AgentConfig({
  setAction,
  actions = [],
  agentsConfig,
  createMutation,
  setActivePanel,
  endpointsConfig,
}: AgentPanelProps) {
  const fileMap = useFileMapContext();
  const queryClient = useQueryClient();

  const allTools = queryClient.getQueryData<TPlugin[]>([QueryKeys.tools]) ?? [];
  const { showToast } = useToastContext();
  const localize = useLocalize();

  const [showToolDialog, setShowToolDialog] = useState(false);

  const methods = useFormContext<AgentForm>();

  const { control } = methods;
  const provider = useWatch({ control, name: 'provider' });
  const model = useWatch({ control, name: 'model' });
  const agent = useWatch({ control, name: 'agent' });
  const tools = useWatch({ control, name: 'tools' });
  const agent_id = useWatch({ control, name: 'id' });

  const toolsEnabled = useMemo(
    () => agentsConfig?.capabilities.includes(AgentCapabilities.tools),
    [agentsConfig],
  );
  const actionsEnabled = useMemo(
    () => agentsConfig?.capabilities.includes(AgentCapabilities.actions),
    [agentsConfig],
  );
  const artifactsEnabled = useMemo(
    () => agentsConfig?.capabilities.includes(AgentCapabilities.artifacts) ?? false,
    [agentsConfig],
  );
  const ocrEnabled = useMemo(
    () => agentsConfig?.capabilities.includes(AgentCapabilities.ocr) ?? false,
    [agentsConfig],
  );
  const fileSearchEnabled = useMemo(
    () => agentsConfig?.capabilities.includes(AgentCapabilities.file_search) ?? false,
    [agentsConfig],
  );
  const codeEnabled = useMemo(
    () => agentsConfig?.capabilities.includes(AgentCapabilities.execute_code) ?? false,
    [agentsConfig],
  );

  const context_files = useMemo(() => {
    if (typeof agent === 'string') {
      return [];
    }

    if (agent?.id !== agent_id) {
      return [];
    }

    if (agent.context_files) {
      return agent.context_files;
    }

    const _agent = processAgentOption({
      agent,
      fileMap,
    });
    return _agent.context_files ?? [];
  }, [agent, agent_id, fileMap]);

  const knowledge_files = useMemo(() => {
    if (typeof agent === 'string') {
      return [];
    }

    if (agent?.id !== agent_id) {
      return [];
    }

    if (agent.knowledge_files) {
      return agent.knowledge_files;
    }

    const _agent = processAgentOption({
      agent,
      fileMap,
    });
    return _agent.knowledge_files ?? [];
  }, [agent, agent_id, fileMap]);

  const code_files = useMemo(() => {
    if (typeof agent === 'string') {
      return [];
    }

    if (agent?.id !== agent_id) {
      return [];
    }

    if (agent.code_files) {
      return agent.code_files;
    }

    const _agent = processAgentOption({
      agent,
      fileMap,
    });
    return _agent.code_files ?? [];
  }, [agent, agent_id, fileMap]);

  const handleAddActions = useCallback(() => {
    if (!agent_id) {
      showToast({
        message: localize('com_assistants_actions_disabled'),
        status: 'warning',
      });
      return;
    }
    setActivePanel(Panel.actions);
  }, [agent_id, setActivePanel, showToast, localize]);

  const providerValue = typeof provider === 'string' ? provider : provider?.value;
  let Icon: IconComponentTypes | null | undefined;
  let endpointType: EModelEndpoint | undefined;
  let endpointIconURL: string | undefined;
  let iconKey: string | undefined;

  if (providerValue !== undefined) {
    endpointType = getEndpointField(endpointsConfig, providerValue as string, 'type');
    endpointIconURL = getEndpointField(endpointsConfig, providerValue as string, 'iconURL');
    iconKey = getIconKey({
      endpoint: providerValue as string,
      endpointsConfig,
      endpointType,
      endpointIconURL,
    });
    Icon = icons[iconKey];
  }

  return (
    <>
      <div className="h-auto bg-white px-4 pt-3 dark:bg-transparent">
        {/* Avatar & Name */}
        <div className="mb-4">
          <AgentAvatar
            agent_id={agent_id}
            createMutation={createMutation}
            avatar={agent?.['avatar'] ?? null}
          />
          <label className={labelClass} htmlFor="name">
            {localize('com_ui_name')}
          </label>
          <Controller
            name="name"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                value={field.value ?? ''}
                maxLength={256}
                className={inputClass}
                id="name"
                type="text"
                placeholder={localize('com_agents_name_placeholder')}
                aria-label="Agent name"
              />
            )}
          />
          <Controller
            name="id"
            control={control}
            render={({ field }) => (
              <p className="h-3 text-xs italic text-text-secondary" aria-live="polite">
                {field.value}
              </p>
            )}
          />
        </div>
        {/* Description */}
        <div className="mb-4">
          <label className={labelClass} htmlFor="description">
            {localize('com_ui_description')}
          </label>
          <Controller
            name="description"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                value={field.value ?? ''}
                maxLength={512}
                className={inputClass}
                id="description"
                type="text"
                placeholder={localize('com_agents_description_placeholder')}
                aria-label="Agent description"
              />
            )}
          />
        </div>
        {/* Instructions */}
        <div className="mb-4">
          <label className={labelClass} htmlFor="instructions">
            {localize('com_ui_instructions')}
          </label>
          <Controller
            name="instructions"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <>
                <textarea
                  {...field}
                  value={field.value ?? ''}
                  // maxLength={32768}
                  className={cn(inputClass, 'min-h-[100px] resize-y')}
                  id="instructions"
                  placeholder={localize('com_agents_instructions_placeholder')}
                  rows={3}
                  aria-label="Agent instructions"
                  aria-required="true"
                  aria-invalid={error ? 'true' : 'false'}
                />
                {error && (
                  <span
                    className="text-sm text-red-500 transition duration-300 ease-in-out"
                    role="alert"
                  >
                    {localize('com_ui_field_required')}
                  </span>
                )}
              </>
            )}
          />
        </div>
        {/* Model and Provider */}
        <div className="mb-4">
          <label className={labelClass} htmlFor="provider">
            {localize('com_ui_model')} <span className="text-red-500">*</span>
          </label>
          <button
            type="button"
            onClick={() => setActivePanel(Panel.model)}
            className="btn btn-neutral border-token-border-light relative h-10 w-full rounded-lg font-medium"
            aria-haspopup="true"
            aria-expanded="false"
          >
            <div className="flex w-full items-center gap-2">
              {Icon && (
                <div className="shadow-stroke relative flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white text-black dark:bg-white">
                  <Icon
                    className="h-2/3 w-2/3"
                    endpoint={providerValue as string}
                    endpointType={endpointType}
                    iconURL={endpointIconURL}
                  />
                </div>
              )}
              <span>{model != null && model ? model : localize('com_ui_select_model')}</span>
            </div>
          </button>
        </div>
        {(codeEnabled || fileSearchEnabled || artifactsEnabled || ocrEnabled) && (
          <div className="mb-4 flex w-full flex-col items-start gap-3">
            <label className="text-token-text-primary block font-medium">
              {localize('com_assistants_capabilities')}
            </label>
            {/* Code Execution */}
            {codeEnabled && <CodeForm agent_id={agent_id} files={code_files} />}
            {/* File Search */}
            {fileSearchEnabled && <FileSearch agent_id={agent_id} files={knowledge_files} />}
            {/* Artifacts */}
            {artifactsEnabled && <Artifacts />}
            {/* File Context (OCR) */}
            {ocrEnabled && <FileContext agent_id={agent_id} files={context_files} />}
          </div>
        )}
        {/* Agent Tools & Actions */}
        <div className="mb-4">
          <label className={labelClass}>
            {`${toolsEnabled === true ? localize('com_ui_tools') : ''}
              ${toolsEnabled === true && actionsEnabled === true ? ' + ' : ''}
              ${actionsEnabled === true ? localize('com_assistants_actions') : ''}`}
          </label>
          <div className="space-y-2">
            {tools?.map((func, i) => (
              <AgentTool
                key={`${func}-${i}-${agent_id}`}
                tool={func}
                allTools={allTools}
                agent_id={agent_id}
              />
            ))}
            {actions
              .filter((action) => action.agent_id === agent_id)
              .map((action, i) => (
                <Action
                  key={i}
                  action={action}
                  onClick={() => {
                    setAction(action);
                    setActivePanel(Panel.actions);
                  }}
                />
              ))}
            <div className="flex space-x-2">
              {(toolsEnabled ?? false) && (
                <button
                  type="button"
                  onClick={() => setShowToolDialog(true)}
                  className="btn btn-neutral border-token-border-light relative h-9 w-full rounded-lg font-medium"
                  aria-haspopup="dialog"
                >
                  <div className="flex w-full items-center justify-center gap-2">
                    {localize('com_assistants_add_tools')}
                  </div>
                </button>
              )}
              {(actionsEnabled ?? false) && (
                <button
                  type="button"
                  disabled={!agent_id}
                  onClick={handleAddActions}
                  className="btn btn-neutral border-token-border-light relative h-9 w-full rounded-lg font-medium"
                  aria-haspopup="dialog"
                >
                  <div className="flex w-full items-center justify-center gap-2">
                    {localize('com_assistants_add_actions')}
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      <ToolSelectDialog
        isOpen={showToolDialog}
        setIsOpen={setShowToolDialog}
        toolsFormKey="tools"
        endpoint={EModelEndpoint.agents}
      />
    </>
  );
}
