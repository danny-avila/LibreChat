import React, { useState, useMemo, useCallback } from 'react';
import { useToastContext } from '@librechat/client';
import { EModelEndpoint } from 'librechat-data-provider';
import { Controller, useWatch, useFormContext } from 'react-hook-form';
import type { AgentForm, AgentPanelProps, IconComponentTypes } from '~/common';
import {
  removeFocusOutlines,
  processAgentOption,
  getEndpointField,
  defaultTextProps,
  getIconKey,
  cn,
} from '~/utils';
import { useFileMapContext, useAgentPanelContext } from '~/Providers';
import useAgentCapabilities from '~/hooks/Agents/useAgentCapabilities';
import AgentCategorySelector from './AgentCategorySelector';
import Action from '~/components/SidePanel/Builder/Action';
import { ToolSelectDialog } from '~/components/Tools';
import { useGetAgentFiles } from '~/data-provider';
import { icons } from '~/hooks/Endpoint/Icons';
import Instructions from './Instructions';
import AgentAvatar from './AgentAvatar';
import FileContext from './FileContext';
import SearchForm from './Search/Form';
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

export default function AgentConfig({ createMutation }: Pick<AgentPanelProps, 'createMutation'>) {
  const localize = useLocalize();
  const fileMap = useFileMapContext();
  const { showToast } = useToastContext();
  const methods = useFormContext<AgentForm>();
  const [showToolDialog, setShowToolDialog] = useState(false);
  const {
    actions,
    setAction,
    agentsConfig,
    setActivePanel,
    endpointsConfig,
    groupedTools: allTools,
  } = useAgentPanelContext();

  const {
    control,
    formState: { errors },
  } = methods;
  const provider = useWatch({ control, name: 'provider' });
  const model = useWatch({ control, name: 'model' });
  const agent = useWatch({ control, name: 'agent' });
  const tools = useWatch({ control, name: 'tools' });
  const agent_id = useWatch({ control, name: 'id' });

  const { data: agentFiles = [] } = useGetAgentFiles(agent_id);

  const mergedFileMap = useMemo(() => {
    const newFileMap = { ...fileMap };
    agentFiles.forEach((file) => {
      if (file.file_id) {
        newFileMap[file.file_id] = file;
      }
    });
    return newFileMap;
  }, [fileMap, agentFiles]);

  const {
    ocrEnabled,
    codeEnabled,
    toolsEnabled,
    actionsEnabled,
    artifactsEnabled,
    webSearchEnabled,
    fileSearchEnabled,
  } = useAgentCapabilities(agentsConfig?.capabilities);

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
      fileMap: mergedFileMap,
    });
    return _agent.context_files ?? [];
  }, [agent, agent_id, mergedFileMap]);

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
      fileMap: mergedFileMap,
    });
    return _agent.knowledge_files ?? [];
  }, [agent, agent_id, mergedFileMap]);

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
      fileMap: mergedFileMap,
    });
    return _agent.code_files ?? [];
  }, [agent, agent_id, mergedFileMap]);

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

  // Determine what to show
  const selectedToolIds = tools ?? [];
  const visibleToolIds = new Set(selectedToolIds);

  // Check what group parent tools should be shown if any subtool is present
  Object.entries(allTools ?? {}).forEach(([toolId, toolObj]) => {
    if (toolObj.tools?.length) {
      // if any subtool of this group is selected, ensure group parent tool rendered
      if (toolObj.tools.some((st) => selectedToolIds.includes(st.tool_id))) {
        visibleToolIds.add(toolId);
      }
    }
  });

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
            <span className="text-red-500">*</span>
          </label>
          <Controller
            name="name"
            rules={{ required: localize('com_ui_agent_name_is_required') }}
            control={control}
            render={({ field }) => (
              <>
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
                <div
                  className={cn(
                    'mt-1 w-56 text-sm text-red-500',
                    errors.name ? 'visible h-auto' : 'invisible h-0',
                  )}
                >
                  {errors.name ? errors.name.message : ' '}
                </div>
              </>
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
        {/* Category */}
        <div className="mb-4">
          <label className={labelClass} htmlFor="category-selector">
            {localize('com_ui_category')} <span className="text-red-500">*</span>
          </label>
          <AgentCategorySelector className="w-full" />
        </div>
        {/* Instructions */}
        <Instructions />
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
        {(codeEnabled ||
          fileSearchEnabled ||
          artifactsEnabled ||
          ocrEnabled ||
          webSearchEnabled) && (
          <div className="mb-4 flex w-full flex-col items-start gap-3">
            <label className="text-token-text-primary block font-medium">
              {localize('com_assistants_capabilities')}
            </label>
            {/* Code Execution */}
            {codeEnabled && <CodeForm agent_id={agent_id} files={code_files} />}
            {/* Web Search */}
            {webSearchEnabled && <SearchForm />}
            {/* File Context (OCR) */}
            {ocrEnabled && <FileContext agent_id={agent_id} files={context_files} />}
            {/* Artifacts */}
            {artifactsEnabled && <Artifacts />}
            {/* File Search */}
            {fileSearchEnabled && <FileSearch agent_id={agent_id} files={knowledge_files} />}
          </div>
        )}
        {/* Agent Tools & Actions */}
        <div className="mb-4">
          <label className={labelClass}>
            {`${toolsEnabled === true ? localize('com_ui_tools') : ''}
              ${toolsEnabled === true && actionsEnabled === true ? ' + ' : ''}
              ${actionsEnabled === true ? localize('com_assistants_actions') : ''}`}
          </label>
          <div>
            <div className="mb-1">
              {/* // Render all visible IDs (including groups with subtools selected) */}
              {[...visibleToolIds].map((toolId, i) => {
                if (!allTools) return null;
                const tool = allTools[toolId];
                if (!tool) return null;
                return (
                  <AgentTool
                    key={`${toolId}-${i}-${agent_id}`}
                    tool={toolId}
                    allTools={allTools}
                    agent_id={agent_id}
                  />
                );
              })}
            </div>
            <div className="flex flex-col gap-1">
              {(actions ?? [])
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
            </div>
            <div className="mt-2 flex space-x-2">
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
        {/* MCP Section */}
        {/* <MCPSection /> */}

        {/* Support Contact (Optional) */}
        <div className="mb-4">
          <div className="mb-1.5 flex items-center gap-2">
            <span>
              <label className="text-token-text-primary block font-medium">
                {localize('com_ui_support_contact')}
              </label>
            </span>
          </div>
          <div className="space-y-3">
            {/* Support Contact Name */}
            <div className="flex flex-col">
              <label
                className="mb-1 flex items-center justify-between"
                htmlFor="support-contact-name"
              >
                <span className="text-sm">{localize('com_ui_support_contact_name')}</span>
              </label>
              <Controller
                name="support_contact.name"
                control={control}
                rules={{
                  minLength: {
                    value: 3,
                    message: localize('com_ui_support_contact_name_min_length', { minLength: 3 }),
                  },
                }}
                render={({ field, fieldState: { error } }) => (
                  <>
                    <input
                      {...field}
                      value={field.value ?? ''}
                      className={cn(inputClass, error ? 'border-2 border-red-500' : '')}
                      id="support-contact-name"
                      type="text"
                      placeholder={localize('com_ui_support_contact_name_placeholder')}
                      aria-label="Support contact name"
                    />
                    {error && (
                      <span className="text-sm text-red-500 transition duration-300 ease-in-out">
                        {error.message}
                      </span>
                    )}
                  </>
                )}
              />
            </div>
            {/* Support Contact Email */}
            <div className="flex flex-col">
              <label
                className="mb-1 flex items-center justify-between"
                htmlFor="support-contact-email"
              >
                <span className="text-sm">{localize('com_ui_support_contact_email')}</span>
              </label>
              <Controller
                name="support_contact.email"
                control={control}
                rules={{
                  pattern: {
                    value: /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
                    message: localize('com_ui_support_contact_email_invalid'),
                  },
                }}
                render={({ field, fieldState: { error } }) => (
                  <>
                    <input
                      {...field}
                      value={field.value ?? ''}
                      className={cn(inputClass, error ? 'border-2 border-red-500' : '')}
                      id="support-contact-email"
                      type="email"
                      placeholder={localize('com_ui_support_contact_email_placeholder')}
                      aria-label="Support contact email"
                    />
                    {error && (
                      <span className="text-sm text-red-500 transition duration-300 ease-in-out">
                        {error.message}
                      </span>
                    )}
                  </>
                )}
              />
            </div>
          </div>
        </div>
      </div>
      <ToolSelectDialog
        isOpen={showToolDialog}
        setIsOpen={setShowToolDialog}
        endpoint={EModelEndpoint.agents}
      />
    </>
  );
}
